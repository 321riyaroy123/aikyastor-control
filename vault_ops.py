"""
vault_ops.py - Vault operations for backup and archival
Handles vault syncing, exports, and backup management
"""

import os
import threading
from typing import Dict, Any, Tuple
from logger import logger
from config import VAULT_PATH, CMD_TIMEOUT
from ceph_ops import run_ceph_cmd
from activity import log_activity

def _ensure_vault_subdir(sub: str) -> str:
    """
    Ensure vault subdirectory exists and return path
    
    Args:
        sub: Subdirectory name
        
    Returns:
        Full path to subdirectory
    """
    path = os.path.join(VAULT_PATH, sub)
    os.makedirs(path, exist_ok=True)
    return path

def get_vault_status() -> Dict[str, Any]:
    """
    Get vault mount and usage status
    
    Returns:
        Dictionary with vault stats
    """
    try:
        # os.path.exists() is true for a plain directory too, which would
        # misleadingly report "mounted" even if nothing is mounted there.
        # Use /proc/mounts to verify an actual mountpoint.
        mounted = os.path.ismount(VAULT_PATH)
        if not mounted and os.path.exists("/proc/mounts"):
            with open("/proc/mounts") as f:
                mounted = any(
                    line.split()[1] == os.path.normpath(VAULT_PATH)
                    for line in f if len(line.split()) > 1
                )

        total, used, free = 0, 0, 0

        if mounted and os.path.exists(VAULT_PATH):
            st = os.statvfs(VAULT_PATH)
            total = st.f_blocks * st.f_frsize
            free = st.f_bavail * st.f_frsize
            used = total - free
        
        return {
            "mounted": mounted,
            "path": VAULT_PATH,
            "total": total,
            "used": used,
            "free": free,
        }
    except Exception as e:
        logger.exception("get_vault_status error")
        return {"mounted": False, "path": VAULT_PATH, "error": str(e)}

def sync_to_vault_rsync(src: str, dest_sub: str) -> Tuple[bool, str]:
    """
    Sync a file or directory to vault using rsync
    
    Args:
        src: Source path
        dest_sub: Destination subdirectory in vault
        
    Returns:
        Tuple of (success, message)
    """
    try:
        dest = _ensure_vault_subdir(dest_sub)
        cmd = f"rsync -av --progress '{src}' '{dest}/'"
        out, err, code = run_ceph_cmd(cmd, timeout=CMD_TIMEOUT * 2)
        return code == 0, err if code != 0 else out
    except Exception as e:
        logger.exception(f"sync_to_vault_rsync error")
        return False, str(e)

def sync_bucket_to_vault_rclone(bucket: str, access_key: str, secret_key: str, 
                                endpoint: str, region: str) -> Tuple[bool, str]:
    """
    Sync an S3 bucket to vault using rclone
    
    Args:
        bucket: Bucket name
        access_key: AWS access key
        secret_key: AWS secret key
        endpoint: S3 endpoint URL
        region: AWS region
        
    Returns:
        Tuple of (success, message)
    """
    try:
        dest = _ensure_vault_subdir(f"object/{bucket}")
        cmd = (
            f"rclone sync "
            f":s3:{bucket} '{dest}' "
            f"--s3-provider Ceph "
            f"--s3-endpoint {endpoint} "
            f"--s3-access-key-id {access_key} "
            f"--s3-secret-access-key {secret_key} "
            f"--s3-region {region} "
            f"-v"
        )
        out, err, code = run_ceph_cmd(cmd, timeout=CMD_TIMEOUT * 3)
        return code == 0, err if code != 0 else out
    except Exception as e:
        logger.exception(f"sync_bucket_to_vault_rclone error for {bucket}")
        return False, str(e)

def export_rbd_to_vault(image_name: str, pool: str) -> Tuple[bool, str]:
    """
    Export an RBD image to vault
    
    Args:
        image_name: RBD image name
        pool: RBD pool name
        
    Returns:
        Tuple of (success, message)
    """
    try:
        dest = _ensure_vault_subdir("block")
        dest_file = os.path.join(dest, f"{image_name}.img")
        cmd = f"rbd export {pool}/{image_name} '{dest_file}'"
        out, err, code = run_ceph_cmd(cmd, timeout=CMD_TIMEOUT * 2)
        return code == 0, err if code != 0 else f"Exported to {dest_file}"
    except Exception as e:
        logger.exception(f"export_rbd_to_vault error for {image_name}")
        return False, str(e)

def start_bucket_sync_background(bucket: str, access_key: str, secret_key: str,
                                  endpoint: str, region: str) -> Dict[str, Any]:
    """
    Start bucket to vault sync in background
    
    Args:
        bucket: Bucket name
        access_key: AWS access key
        secret_key: AWS secret key
        endpoint: S3 endpoint URL
        region: AWS region
        
    Returns:
        Result dictionary
    """
    def do_sync():
        log_activity("VAULT SYNC (Bucket)", bucket, "info",
                     f"rclone sync to /vault/object/{bucket}/", vault=True)
        ok, msg = sync_bucket_to_vault_rclone(bucket, access_key, secret_key, endpoint, region)
        if ok:
            log_activity("VAULT SYNC (Bucket)", bucket, "success",
                         f"rclone → /vault/object/{bucket}/", vault=True)
        else:
            log_activity("VAULT SYNC (Bucket)", bucket, "error", msg, vault=True)
    
    threading.Thread(target=do_sync, daemon=True).start()
    return {"message": f"Bucket '{bucket}' → Vault sync started in background"}

def start_rbd_export_background(image_name: str, pool: str) -> Dict[str, Any]:
    """
    Start RBD export in background
    
    Args:
        image_name: RBD image name
        pool: RBD pool name
        
    Returns:
        Result dictionary
    """
    def do_export():
        log_activity("VAULT EXPORT (RBD)", image_name, "info",
                     f"Starting rbd export to vault...", vault=True)
        ok, msg = export_rbd_to_vault(image_name, pool)
        if ok:
            log_activity("VAULT EXPORT (RBD)", image_name, "success",
                         f"Exported to /vault/block/{image_name}.img", vault=True)
        else:
            log_activity("VAULT EXPORT (RBD)", image_name, "error", msg, vault=True)
    
    threading.Thread(target=do_export, daemon=True).start()
    return {"message": f"RBD export of '{image_name}' to Vault started in background"}

def start_cephfs_sync_background(cephfs_mount: str) -> Dict[str, Any]:
    """
    Start CephFS mount to vault sync in background
    
    Args:
        cephfs_mount: CephFS mount path
        
    Returns:
        Result dictionary
    """
    def do_sync():
        log_activity("VAULT SYNC (CephFS)", "entire mount", "info",
                     "rsync started...", vault=True)
        dest = _ensure_vault_subdir("file")
        cmd = f"rsync -av --progress '{cephfs_mount}/' '{dest}/'"
        out, err, code = run_ceph_cmd(cmd, timeout=CMD_TIMEOUT * 3)
        if code == 0:
            log_activity("VAULT SYNC (CephFS)", "entire mount", "success",
                         f"rsync → /vault/file/", vault=True)
        else:
            log_activity("VAULT SYNC (CephFS)", "entire mount", "error", err, vault=True)
    
    threading.Thread(target=do_sync, daemon=True).start()
    return {"message": "CephFS → Vault sync started in background"}

def sync_path_to_vault_background(abs_path: str, rel_path: str) -> Dict[str, Any]:
    """
    Sync a single uploaded file from CephFS to vault in the background

    Args:
        abs_path: Absolute path of the file on CephFS
        rel_path: Relative directory path within CephFS (for vault destination)

    Returns:
        Result dictionary
    """
    filename = os.path.basename(abs_path)

    def do_sync():
        log_activity("VAULT SYNC (CephFS)", filename, "info",
                     "rsync started...", vault=True)
        dest_sub = f"file/{rel_path.lstrip('/') or 'root'}"
        ok, msg = sync_to_vault_rsync(abs_path, dest_sub)
        if ok:
            log_activity("VAULT SYNC (CephFS)", filename, "success",
                         f"rsync → /vault/{dest_sub}/", vault=True)
        else:
            log_activity("VAULT SYNC (CephFS)", filename, "error", msg, vault=True)

    threading.Thread(target=do_sync, daemon=True).start()
    return {"message": f"'{filename}' → Vault sync started in background"}

def sync_object_to_vault_background(bucket: str, key: str, file_content: bytes) -> Dict[str, Any]:
    """
    Write an uploaded object's content directly to the vault's object mirror
    in the background

    Args:
        bucket: Bucket name
        key: Object key/path
        file_content: File content bytes

    Returns:
        Result dictionary
    """
    target = f"{bucket}/{key}"

    def do_sync():
        log_activity("VAULT SYNC", target, "info",
                     f"Writing to /vault/object/{bucket}/{key}", vault=True)
        try:
            dest_dir = _ensure_vault_subdir(os.path.join("object", bucket, os.path.dirname(key)))
            dest_file = os.path.join(dest_dir, os.path.basename(key))
            with open(dest_file, "wb") as f:
                f.write(file_content)
            log_activity("VAULT SYNC", target, "success",
                         f"Copied to /vault/object/{bucket}/{key}", vault=True)
        except Exception as e:
            logger.exception(f"sync_object_to_vault_background error for {target}")
            log_activity("VAULT SYNC", target, "error", str(e), vault=True)

    threading.Thread(target=do_sync, daemon=True).start()
    return {"message": f"'{key}' → Vault sync started in background"}
