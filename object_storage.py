"""
object_storage.py - Object Storage (RGW/S3) operations
Handles bucket management, object operations, and S3 interactions
"""

import json
import boto3
from botocore.client import Config
from typing import Dict, List, Any, Tuple
from logger import logger
from config import CEPH_RGW_ENDPOINT, CEPH_ACCESS_KEY, CEPH_SECRET_KEY, CEPH_REGION
from ceph_ops import run_ceph_cmd
from activity import log_activity

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
    obj_lock: bool = False
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
        for obj in objects:
            s3.delete_object(Bucket=bucket, Key=obj["Key"])
        s3.delete_bucket(Bucket=bucket)
        log_activity("DELETE BUCKET", bucket, "success", f"Removed {len(objects)} objects")
        return {"message": f"Bucket '{bucket}' deleted"}
    except Exception as e:
        logger.exception(f"delete_bucket error for {bucket}")
        log_activity("DELETE BUCKET", bucket, "error", str(e))
        return {"error": str(e)}

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
        s3.put_object(Bucket=bucket, Key=key, Body=file_content)
        log_activity("UPLOAD", f"{bucket}/{key}", "success", "Saved to S3")
        message = f"Object '{key}' uploaded to '{bucket}'"

        if to_vault:
            from vault_ops import sync_object_to_vault_background
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
