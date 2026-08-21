"""
services/object/object_storage.py - Object Storage (RGW/S3) operations
Handles bucket management, object operations, S3 interactions, and lifecycle policies
 
Moved from: object_storage.py (project root)
 
Responsibility:
    All boto3/S3 calls against Ceph RGW live here: bucket CRUD, object
    management (upload/download/delete with versioning support), RGW user
    listing, and lifecycle policy assignment. object_routes.py calls into
    this module; it never talks to boto3 directly.
 
Functions:
    - Bucket operations: list_buckets(), create_bucket(), delete_bucket()
    - Object operations: list_bucket_objects(), upload_object(), get_object(),
      delete_object(), delete_object_permanently(), delete_all_object_versions()
    - User operations: list_rgw_users()
    - Lifecycle/policy: get_bucket_lifecycle(), assign_bucket_lifecycle()
    - Internal: get_s3_client()
 
Integration:
    - Uses bucket_settings module to persist lifecycle policy per bucket
    - Uses policy_manager.get_policy() to fetch policy details
    - Logs all operations via core.activity.log_activity()
    - upload_object() adds uploaded_at metadata for lifecycle engine
    - delete_bucket() cascades to delete all object versions and settings
"""

import json
import boto3
from datetime import datetime, timezone
from botocore.client import Config
from botocore.exceptions import ClientError
from typing import Dict, List, Any, Tuple
from core.logger import logger
from config.config import CEPH_RGW_ENDPOINT, CEPH_RGW_ENDPOINT_SECURE, CEPH_ACCESS_KEY, CEPH_SECRET_KEY, CEPH_REGION
from services.cluster.ceph_ops import run_ceph_cmd
from core.activity import log_activity
from services.object.lifecycle_policy_manager import get_lifecycle_policy, get_all_lifecycle_policies
from services.object.lifecycle_converter import policy_to_lifecycle_configuration, lifecycle_configuration_to_policy
from services.object.bucket_settings import (
    initialize_bucket,
    delete_bucket_settings,
    get_bucket_encryption as get_saved_bucket_encryption,
    set_bucket_encryption as save_bucket_encryption,
)
import xml.etree.ElementTree as ET

def get_s3_client(secure: bool = False) -> boto3.client:
    """
    Create and return an S3 client configured for Ceph RGW.

    Args:
        secure: If True, uses the HTTPS endpoint (required for buckets
            with SSE-S3 enabled, since RGW refuses to negotiate
            server-side encryption over plain HTTP).
    """
    return boto3.client(
        "s3",
        endpoint_url=CEPH_RGW_ENDPOINT_SECURE if secure else CEPH_RGW_ENDPOINT,
        aws_access_key_id=CEPH_ACCESS_KEY,
        aws_secret_access_key=CEPH_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name=CEPH_REGION,
        verify=not secure,  # self-signed cert in dev; skip verification on HTTPS
    )

def list_buckets() -> Dict[str, Any]:
    """
    List all S3 buckets with their actual configuration.
    """

    try:
        s3 = get_s3_client()
        resp = s3.list_buckets()

        buckets = []

        for b in resp.get("Buckets", []):
            bucket_name = b["Name"]

            status = get_bucket_status(
                s3,
                bucket_name
            )

            buckets.append({
                "name": bucket_name,
                "created": str(b["CreationDate"]),
                **status
            })

        return {
            "buckets": buckets
        }

    except Exception as e:
        logger.exception("list_buckets error")
        return {
            "error": str(e),
            "buckets": []
        }

def list_bucket_objects(bucket: str) -> Dict[str, Any]:
    """
    List objects in a bucket
    
    Args:
        bucket: Bucket name
        
    Returns:
        Dictionary with object list
    """
    try:
        s3 = get_s3_client()
        resp = s3.list_objects_v2(Bucket=bucket)
        objects = []
        for obj in resp.get("Contents", []):
            objects.append({
                "key": obj["Key"],
                "size": obj["Size"],
                "modified": str(obj["LastModified"]),
            })
        return {"bucket": bucket, "objects": objects}
    except Exception as e:
        logger.exception(f"list_bucket_objects error for {bucket}")
        return {"error": str(e), "objects": []}

def get_bucket_status(s3, bucket: str) -> Dict[str, Any]:
    """
    Get the actual configuration/status of an S3/RGW bucket.
    """

    # ---------------------------------------------------------
    # ACL
    # ---------------------------------------------------------
    acl_response = s3.get_bucket_acl(Bucket=bucket)

    grants = acl_response.get("Grants", [])

    acl = "private"

    for grant in grants:
        grantee = grant.get("Grantee", {})
        permission = grant.get("Permission")

        grantee_type = grantee.get("Type")
        grantee_uri = grantee.get("URI")

        if (
            grantee_type == "Group"
            and grantee_uri == "http://acs.amazonaws.com/groups/global/AllUsers"
        ):
            if permission == "READ":
                acl = "public-read"
            elif permission == "WRITE":
                acl = "public-read-write"

        elif (
            grantee_type == "Group"
            and grantee_uri
            == "http://acs.amazonaws.com/groups/global/AuthenticatedUsers"
        ):
            if permission == "READ":
                acl = "authenticated-read"

    # ---------------------------------------------------------
    # Versioning
    # ---------------------------------------------------------
    versioning_response = s3.get_bucket_versioning(
        Bucket=bucket
    )

    versioning = versioning_response.get(
        "Status",
        "Disabled"
    )

    # ---------------------------------------------------------
    # Object Lock
    # ---------------------------------------------------------
    object_locking = False
    object_lock = None

    try:
        object_lock_response = s3.get_object_lock_configuration(
            Bucket=bucket
        )

        object_lock = object_lock_response.get(
            "ObjectLockConfiguration"
        )

        object_locking = (
            object_lock is not None
            and object_lock.get("ObjectLockEnabled") == "Enabled"
        )

    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code")

        if error_code not in (
            "NoSuchObjectLockConfiguration",
            "ObjectLockConfigurationNotFoundError",
        ):
            raise

    return {
        "acl": acl,
        "versioning": versioning,
        "object_locking": object_locking,
        "object_lock": object_lock,
    }

def get_bucket_encryption(bucket: str) -> Dict[str, Any]:
    """
    Retrieve the actual server-side encryption configuration
    from Ceph RGW.

    RGW is the source of truth for production state.
    """

    try:
        s3 = get_s3_client()

        response = s3.get_bucket_encryption(
            Bucket=bucket
        )

        configuration = response.get(
            "ServerSideEncryptionConfiguration",
            {}
        )

        rules = configuration.get("Rules", [])

        if not rules:
            return {
                "bucket": bucket,
                "enabled": False,
                "type": None,
                "configuration": configuration
            }

        default_encryption = rules[0].get(
            "ApplyServerSideEncryptionByDefault",
            {}
        )

        algorithm = default_encryption.get(
            "SSEAlgorithm"
        )

        return {
            "bucket": bucket,
            "enabled": True,
            "type": algorithm,
            "configuration": configuration
        }

    except ClientError as e:
        code = e.response.get(
            "Error", {}
        ).get("Code")

        if code in (
            "ServerSideEncryptionConfigurationNotFoundError",
            "NoSuchBucket",
        ):
            if code == "ServerSideEncryptionConfigurationNotFoundError":
                return {
                    "bucket": bucket,
                    "enabled": False,
                    "type": None,
                    "configuration": {
                        "Rules": []
                    }
                }

        logger.exception(
            f"Failed to retrieve encryption for '{bucket}'"
        )

        return {
            "error": e.response.get(
                "Error", {}
            ).get("Message", str(e))
        }

    except Exception as e:
        logger.exception(
            f"Unexpected error retrieving encryption for '{bucket}'"
        )

        return {
            "error": str(e)
        }


def set_bucket_encryption(
    bucket: str,
    enabled: bool,
    encryption_type: str = "AES256"
) -> Dict[str, Any]:
    try:
        if enabled:
            if encryption_type != "AES256":
                return {
                    "error": (
                        f"Unsupported encryption type "
                        f"'{encryption_type}'. "
                        f"Currently only AES256 is supported."
                    )
                }

            configuration = {
                "Rules": [
                    {
                        "ApplyServerSideEncryptionByDefault": {
                            "SSEAlgorithm": "AES256"
                        }
                    }
                ]
            }

            s3 = get_s3_client(secure=True)
            s3.put_bucket_encryption(
                Bucket=bucket,
                ServerSideEncryptionConfiguration=configuration
            )

            save_bucket_encryption(
                bucket,
                True,
                "AES256"
            )

            log_activity(
                "BUCKET ENCRYPTION",
                bucket,
                "success",
                "Enabled SSE-S3 (AES256)"
            )

            return {
                "message": (
                    f"Server-side encryption enabled "
                    f"for '{bucket}'."
                ),
                "bucket": bucket,
                "enabled": True,
                "type": "AES256",
                "configuration": configuration
            }

        # Disable encryption
        s3 = get_s3_client()
        s3.delete_bucket_encryption(Bucket=bucket)

        save_bucket_encryption(
            bucket,
            False,
            "AES256"
        )

        log_activity(
            "BUCKET ENCRYPTION",
            bucket,
            "success",
            "Server-side encryption disabled"
        )

        return {
            "message": (
                f"Server-side encryption disabled "
                f"for '{bucket}'."
            ),
            "bucket": bucket,
            "enabled": False,
            "type": None,
            "configuration": {
                "Rules": []
            }
        }

    except ClientError as e:
        logger.exception(
            f"Failed to configure encryption "
            f"for '{bucket}'"
        )

        return {
            "error": e.response.get(
                "Error", {}
            ).get("Message", str(e))
        }

    except Exception as e:
        logger.exception(
            f"Unexpected error configuring encryption "
            f"for '{bucket}'"
        )

        return {
            "error": str(e)
        }

def create_bucket(
    bucket: str,
    owner: str = "admin",
    acl: str = "private",
    versioning: bool = False,
    object_locking: bool = False,
    encryption_enabled: bool = False,
    encryption_type: str = "AES256"
) -> Dict[str, Any]:
    try:
        s3 = get_s3_client()

        # Create bucket with the requested ACL and Object Lock capability.
        s3.create_bucket(
            Bucket=bucket,
            ACL=acl,
            ObjectLockEnabledForBucket=object_locking
        )

        # Enable versioning after bucket creation.
        if versioning:
            s3.put_bucket_versioning(
                Bucket=bucket,
                VersioningConfiguration={"Status": "Enabled"}
            )

        # Configure server-side encryption.
        if encryption_enabled:
            if encryption_type != "AES256":
                return {
                    "error": (
                        f"Unsupported encryption type "
                        f"'{encryption_type}'. "
                        f"Currently only AES256 is supported."
                    )
                }

            encryption_configuration = {
                "Rules": [
                    {
                        "ApplyServerSideEncryptionByDefault": {
                            "SSEAlgorithm": "AES256"
                        }
                    }
                ]
            }

            # SSE-S3 requires the secure endpoint
            s3_secure = get_s3_client(secure=True)
            s3_secure.put_bucket_encryption(
                Bucket=bucket,
                ServerSideEncryptionConfiguration=encryption_configuration
            )

            save_bucket_encryption(bucket, True, "AES256")
        else:
            save_bucket_encryption(bucket, False, "AES256")

        detail = (
            f"Owner:{owner} "
            f"ACL:{acl} "
            f"Versioning:{versioning} "
            f"ObjLock:{object_locking} "
            f"Encryption:"
            f"{'SSE-S3(AES256)' if encryption_enabled else 'Disabled'}"
        )

        log_activity(
            "CREATE BUCKET",
            bucket,
            "success",
            detail
        )

        return {
            "message": f"Bucket '{bucket}' created successfully",
            "bucket": bucket
        }

    except Exception as e:
        logger.exception(
            f"create_bucket error for {bucket}"
        )

        log_activity(
            "CREATE BUCKET",
            bucket,
            "error",
            str(e)
        )

        return {
            "error": str(e)
        }

def delete_bucket(bucket: str) -> Dict[str, Any]:
    """
    Delete a bucket (and all objects within it)
    
    Args:
        bucket: Bucket name
        
    Returns:
        Result dictionary
    """
    try:
        s3 = get_s3_client()
        objects = s3.list_objects_v2(Bucket=bucket).get("Contents", [])
        delete_all_object_versions(bucket)
        s3.delete_bucket(Bucket=bucket)
        delete_bucket_settings(bucket)
        log_activity("DELETE BUCKET", bucket, "success", f"Removed {len(objects)} objects")
        return {"message": f"Bucket '{bucket}' deleted"}
    except Exception as e:
        logger.exception(f"delete_bucket error for {bucket}")
        log_activity("DELETE BUCKET", bucket, "error", str(e))
        return {"error": str(e)}

def delete_object_permanently(bucket: str, key: str):
    """
    Permanently delete all versions and delete markers
    of a single object.
    """

    s3 = get_s3_client()

    versions = s3.list_object_versions(
        Bucket=bucket,
        Prefix=key
    )

    # Delete every version of this object
    for version in versions.get("Versions", []):
        if version["Key"] != key:
            continue

        s3.delete_object(
            Bucket=bucket,
            Key=key,
            VersionId=version["VersionId"]
        )

    # Delete every delete marker
    for marker in versions.get("DeleteMarkers", []):
        if marker["Key"] != key:
            continue

        s3.delete_object(
            Bucket=bucket,
            Key=key,
            VersionId=marker["VersionId"]
        )

def delete_all_object_versions(bucket: str):
    """
    Permanently delete every object version and delete marker
    from a bucket.
    """

    s3 = get_s3_client()

    paginator = s3.get_paginator("list_object_versions")

    for page in paginator.paginate(Bucket=bucket):

        # Delete object versions
        for version in page.get("Versions", []):
            s3.delete_object(
                Bucket=bucket,
                Key=version["Key"],
                VersionId=version["VersionId"]
            )

        # Delete delete markers
        for marker in page.get("DeleteMarkers", []):
            s3.delete_object(
                Bucket=bucket,
                Key=marker["Key"],
                VersionId=marker["VersionId"]
            )
    
def get_bucket_lifecycle(bucket: str) -> Dict[str, Any]:
    """
    Retrieve the native S3/Ceph RGW lifecycle configuration.

    RGW is the source of truth in production.
    """

    try:
        s3 = get_s3_client()

        response = s3.get_bucket_lifecycle_configuration(
            Bucket=bucket
        )

        configuration = response.get(
            "Rules",
            []
        )

        native_configuration = {
            "Rules": configuration
        }

        lifecycle_policy = lifecycle_configuration_to_policy(
            native_configuration,
            get_all_lifecycle_policies()
        )

        return {
            "bucket": bucket,
            "lifecycle": lifecycle_policy,
            "configuration": native_configuration
        }

    except ClientError as e:
        code = e.response["Error"]["Code"]

        if code in (
            "NoSuchLifecycleConfiguration",
            "NoSuchLifecycle"
        ):
            return {
                "bucket": bucket,
                "lifecycle": get_lifecycle_policy("none"),
                "configuration": {
                    "Rules": []
                }
            }

        logger.exception(
            f"Failed to retrieve lifecycle for '{bucket}'"
        )

        return {
            "error": e.response["Error"]["Message"]
        }

    except Exception as e:
        logger.exception(
            f"Unexpected error retrieving lifecycle for '{bucket}'"
        )

        return {
            "error": str(e)
        }

def assign_bucket_lifecycle(
    bucket: str,
    policy_id: str
) -> Dict[str, Any]:
    """
    Apply an AiKyaStor lifecycle policy directly to
    Ceph RGW using the native S3 lifecycle API.
    """

    try:
        if not policy_id:
            return {
                "error": "Lifecycle policy is required."
            }

        lifecycle_policy = get_lifecycle_policy(policy_id)

        if not lifecycle_policy:
            return {
                "error": f"Lifecycle policy '{policy_id}' not found."
            }

        s3 = get_s3_client()

        if policy_id == "none":
            try:
                s3.delete_bucket_lifecycle(
                    Bucket=bucket
                )
            except ClientError as e:
                code = e.response["Error"]["Code"]

                if code not in (
                    "NoSuchLifecycleConfiguration",
                    "NoSuchLifecycle"
                ):
                    raise

            log_activity(
                "LIFECYCLE POLICY",
                bucket,
                "success",
                "Native RGW lifecycle configuration removed"
            )

            return {
                "message": (
                    f"Lifecycle policy removed from '{bucket}'."
                ),
                "bucket": bucket,
                "lifecycle": lifecycle_policy,
                "configuration": {
                    "Rules": []
                }
            }

        configuration = policy_to_lifecycle_configuration(
            lifecycle_policy
        )

        logger.info(
            "Applying RGW lifecycle configuration to '%s':\n%s",
            bucket,
            json.dumps(configuration, indent=2)
        )

        s3.put_bucket_lifecycle_configuration(
            Bucket=bucket,
            LifecycleConfiguration=configuration
        )

        log_activity(
            "LIFECYCLE POLICY",
            bucket,
            "success",
            f"Applied lifecycle policy '{policy_id}'"
        )

        return {
            "message": (
                f"Lifecycle policy '{lifecycle_policy['name']}' "
                f"applied to '{bucket}'."
            ),
            "bucket": bucket,
            "lifecycle": lifecycle_policy,
            "configuration": configuration
        }

    except ClientError as e:
        logger.exception(
            f"Failed to apply lifecycle policy "
            f"for '{bucket}'"
        )

        return {
            "error": e.response["Error"]["Message"]
        }

    except ValueError as e:
        logger.warning(
            f"Invalid lifecycle policy for '{bucket}': {e}"
        )

        return {
            "error": str(e)
        }

    except Exception as e:
        logger.exception(
            f"Unexpected error applying lifecycle "
            f"for '{bucket}'"
        )

        return {
            "error": str(e)
        }

def delete_bucket_lifecycle(bucket: str) -> Dict[str, Any]:
    """
    Remove the native lifecycle configuration from a bucket.
    """

    try:
        s3 = get_s3_client()

        try:
            s3.delete_bucket_lifecycle(
                Bucket=bucket
            )

        except ClientError as e:
            code = e.response["Error"]["Code"]

            if code not in (
                "NoSuchLifecycleConfiguration",
                "NoSuchLifecycle"
            ):
                raise

        log_activity(
            "DELETE LIFECYCLE POLICY",
            bucket,
            "success",
            "Native RGW lifecycle configuration removed"
        )

        return {
            "message": (
                f"Lifecycle policy removed from '{bucket}'."
            ),
            "bucket": bucket,
            "lifecycle": get_lifecycle_policy("none")
        }

    except ClientError as e:
        logger.exception(
            f"Failed to delete lifecycle for '{bucket}'"
        )

        return {
            "error": e.response["Error"]["Message"]
        }

    except Exception as e:
        logger.exception(
            f"Unexpected error deleting lifecycle "
            f"for '{bucket}'"
        )

        return {
            "error": str(e)
        }

def upload_object(bucket: str, key: str, file_content: bytes, to_vault: bool = False) -> Dict[str, Any]:
    try:
        encryption_status = get_saved_bucket_encryption(bucket)
        use_secure = encryption_status.get("enabled", False)

        s3 = get_s3_client(secure=use_secure)
        s3.put_object(Bucket=bucket, Key=key, Body=file_content)
        log_activity("UPLOAD", f"{bucket}/{key}", "success", "Saved to S3")
        message = f"Object '{key}' uploaded to '{bucket}'"

        if to_vault:
            from services.vault.vault_ops import sync_object_to_vault_background
            sync_object_to_vault_background(bucket, key, file_content)
            message += " (Vault sync started in background)"

        return {"message": message}
    except Exception as e:
        logger.exception(f"upload_object error for {bucket}/{key}")
        log_activity("UPLOAD", f"{bucket}/{key}", "error", str(e))
        return {"error": str(e)}

def get_object(bucket: str, key: str) -> Dict[str, Any]:
    """
    Fetch an object's content for download (streamed back to the client),
    matching the original single-file app's behavior of serving the object
    directly rather than via a presigned URL.

    Args:
        bucket: Bucket name
        key: Object key/path

    Returns:
        Dictionary with the object's body stream and metadata, or error
    """
    try:
        s3 = get_s3_client()
        obj = s3.get_object(Bucket=bucket, Key=key)
        return {"body": obj["Body"], "content_type": obj.get("ContentType", "application/octet-stream")}
    except Exception as e:
        logger.exception(f"get_object error for {bucket}/{key}")
        return {"error": str(e)}

def delete_object(bucket: str, key: str) -> Dict[str, Any]:
    """
    Delete an object from a bucket
    
    Args:
        bucket: Bucket name
        key: Object key/path
        
    Returns:
        Result dictionary
    """
    try:
        s3 = get_s3_client()
        s3.delete_object(Bucket=bucket, Key=key)
        log_activity("DELETE OBJECT", f"{bucket}/{key}", "success")
        return {"message": f"Object '{key}' deleted from '{bucket}'"}
    except Exception as e:
        logger.exception(f"delete_object error for {bucket}/{key}")
        log_activity("DELETE OBJECT", f"{bucket}/{key}", "error", str(e))
        return {"error": str(e)}

def list_rgw_users() -> Dict[str, Any]:
    """
    List all RGW users
    
    Returns:
        Dictionary with user list
    """
    try:
        stdout, stderr, code = run_ceph_cmd("radosgw-admin user list --format json")
        if code != 0:
            return {"users": []}
        users = json.loads(stdout) if stdout else []
        return {"users": users}
    except Exception as e:
        logger.exception("list_rgw_users error")
        return {"users": [], "error": str(e)}
