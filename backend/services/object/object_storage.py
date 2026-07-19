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
from typing import Dict, List, Any, Tuple
from core.logger import logger
from config.config import CEPH_RGW_ENDPOINT, CEPH_ACCESS_KEY, CEPH_SECRET_KEY, CEPH_REGION
from services.cluster.ceph_ops import run_ceph_cmd
from core.activity import log_activity
from services.object.policy_manager import get_policy
from services.object.bucket_settings import initialize_bucket, set_bucket_lifecycle, get_bucket_lifecycle as get_bucket_lifecycle_setting, delete_bucket_settings
import xml.etree.ElementTree as ET

def get_s3_client() -> boto3.client:
    """
    Create and return an S3 client configured for Ceph RGW
    
    Returns:
        boto3 S3 client
    """
    return boto3.client(
        "s3",
        endpoint_url=CEPH_RGW_ENDPOINT,
        aws_access_key_id=CEPH_ACCESS_KEY,
        aws_secret_access_key=CEPH_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name=CEPH_REGION,
    )

def list_buckets() -> Dict[str, Any]:
    """
    List all S3 buckets
    
    Returns:
        Dictionary with bucket list
    """
    try:
        s3 = get_s3_client()
        resp = s3.list_buckets()
        buckets = [
            {"name": b["Name"], "created": str(b["CreationDate"])}
            for b in resp.get("Buckets", [])
        ]
        return {"buckets": buckets}
    except Exception as e:
        logger.exception("list_buckets error")
        return {"error": str(e), "buckets": []}

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

def create_bucket(
    bucket: str,
    owner: str = "admin",
    acl: str = "private",
    versioning: bool = False,
    obj_lock: bool = False,
    lifecycle: str | None = None
) -> Dict[str, Any]:
    """
    Create a new bucket
    
    Args:
        bucket: Bucket name
        owner: Bucket owner user
        acl: Access control level
        versioning: Enable versioning
        obj_lock: Enable object lock
        
    Returns:
        Result dictionary
    """
    try:
        s3 = get_s3_client()
        try:
            s3.create_bucket(Bucket=bucket)
        except Exception as e:
            err = str(e)
            if "BucketAlreadyOwnedByYou" in err:
                pass  # already exists and owned by us, continue
            elif "BucketAlreadyExists" in err:
                return {"error": f"Bucket '{bucket}' already exists"}
            else:
                logger.exception(f"create_bucket error for {bucket}")
                log_activity("CREATE BUCKET", bucket, "error", err)
                return {"error": err}

        # Post-creation config — all non-fatal
        if acl and acl != "private":
            try:
                s3.put_bucket_acl(Bucket=bucket, ACL=acl)
            except Exception as e:
                logger.warning(f"ACL failed: {e}")

        if versioning or obj_lock:
            try:
                s3.put_bucket_versioning(
                    Bucket=bucket,
                    VersioningConfiguration={"Status": "Enabled"}
                )
            except Exception as e:
                logger.warning(f"Versioning failed: {e}")

        if owner:
            try:
                run_ceph_cmd(f"radosgw-admin bucket link --bucket={bucket} --uid={owner}")
            except Exception as e:
                logger.warning(f"Owner link failed: {e}")

        initialize_bucket(bucket, lifecycle or "none")

        detail = f"Owner:{owner or 'default'} ACL:{acl} Versioning:{versioning} ObjLock:{obj_lock}"
        log_activity("CREATE BUCKET", bucket, "success", detail)

        return {"message": f"Bucket '{bucket}' created successfully", "bucket": bucket}
    except Exception as e:
        logger.exception(f"create_bucket error for {bucket}")
        log_activity("CREATE BUCKET", bucket, "error", str(e))
        return {"error": str(e)}

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
    
def get_bucket_lifecycle(bucket):
    policy_id = get_bucket_lifecycle_setting(bucket)

    return {
        "bucket": bucket,
        "lifecycle": get_policy(policy_id)
    }

def assign_bucket_lifecycle(bucket, policy_id):
    set_bucket_lifecycle(bucket, policy_id)

    return {
        "message": "Lifecycle updated successfully",
        "bucket": bucket,
        "lifecycle": get_policy(policy_id)
    }

def upload_object(bucket: str, key: str, file_content: bytes, to_vault: bool = False) -> Dict[str, Any]:
    """
    Upload an object to a bucket
    
    Args:
        bucket: Bucket name
        key: Object key/path
        file_content: File content bytes
        to_vault: Whether to also sync this object to vault after upload
        
    Returns:
        Result dictionary
    """
    try:
        s3 = get_s3_client()
        s3.put_object(Bucket=bucket, Key=key, Body=file_content, Metadata={"uploaded_at": datetime.now(timezone.utc).isoformat()})
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
