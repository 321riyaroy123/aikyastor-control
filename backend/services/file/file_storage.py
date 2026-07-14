"""
services/file/file_storage.py - File Storage (CephFS) operations
Handles file browsing, uploads, downloads, and directory management
 
Moved from: file_storage.py (project root)
Responsibility: unchanged — filesystem operations scoped to CEPHFS_MOUNT,
including path-traversal protection (_safe_path). file_routes.py calls
into this module.
"""

import os
import shutil
from typing import Dict, List, Any
from core.logger import logger
from config.config import CEPHFS_MOUNT
from core.activity import log_activity

def _safe_path(rel_path: str) -> str:
    """
    Convert relative path to absolute, with security checks
    
    Args:
        rel_path: Relative path
        
    Returns:
        Absolute path
    """
    abs_path = os.path.join(CEPHFS_MOUNT, rel_path.lstrip("/"))
    abs_path = os.path.normpath(abs_path)
    
    # Security check: ensure path is within CEPHFS_MOUNT
    if not abs_path.startswith(os.path.normpath(CEPHFS_MOUNT)):
        raise ValueError("Path traversal attempt detected")
    
    return abs_path

def browse_directory(rel_path: str = "") -> Dict[str, Any]:
    """
    List contents of a directory in CephFS
    
    Args:
        rel_path: Relative path within CephFS
        
    Returns:
        Dictionary with directory contents
    """
    try:
        abs_path = _safe_path(rel_path)
        
        if not os.path.exists(abs_path):
            return {"error": "Path not found", "path": rel_path, "entries": []}
        
        entries = []
        for item in os.listdir(abs_path):
            full = os.path.join(abs_path, item)
            stat = os.stat(full)
            entries.append({
                "name": item,
                "type": "dir" if os.path.isdir(full) else "file",
                "size": stat.st_size,
                "modified": str(stat.st_mtime),
            })
        
        # Sort: directories first, then by name
        entries = sorted(entries, key=lambda x: (x["type"] == "file", x["name"]))
        
        return {"path": rel_path, "entries": entries}
    except Exception as e:
        logger.exception(f"browse_directory error for {rel_path}")
        return {"error": str(e), "path": rel_path, "entries": []}

def upload_file(rel_path: str, filename: str, file_content: bytes, to_vault: bool = False) -> Dict[str, Any]:
    """
    Upload a file to CephFS
    
    Args:
        rel_path: Directory path within CephFS
        filename: Filename
        file_content: File content bytes
        to_vault: Whether to also sync this file to vault after upload
        
    Returns:
        Result dictionary
    """
    try:
        abs_dir = _safe_path(rel_path)
        os.makedirs(abs_dir, exist_ok=True)
        
        abs_path = os.path.join(abs_dir, filename)
        
        # Prevent directory traversal in filename
        if os.path.dirname(abs_path) != abs_dir:
            raise ValueError("Invalid filename")
        
        with open(abs_path, 'wb') as f:
            f.write(file_content)
        
        log_activity("UPLOAD (CephFS)", f"{rel_path or '/'}/{filename}", "success",
                     "Saved to CephFS")

        message = f"'{filename}' uploaded to CephFS:{rel_path or '/'}"

        if to_vault:
            from vault_ops import sync_path_to_vault_background
            sync_path_to_vault_background(abs_path, rel_path)
            message += " (Vault sync started in background)"

        return {"message": message}
    except Exception as e:
        logger.exception(f"upload_file error for {rel_path}/{filename}")
        log_activity("UPLOAD (CephFS)", filename, "error", str(e))
        return {"error": str(e)}

def download_file(rel_path: str) -> Dict[str, Any]:
    """
    Prepare file for download
    
    Args:
        rel_path: File path within CephFS
        
    Returns:
        Dictionary with file info or error
    """
    try:
        abs_path = _safe_path(rel_path)
        
        if not os.path.isfile(abs_path):
            return {"error": "File not found"}
        
        return {"file_path": abs_path, "filename": os.path.basename(abs_path)}
    except Exception as e:
        logger.exception(f"download_file error for {rel_path}")
        return {"error": str(e)}

def delete_file_or_dir(rel_path: str) -> Dict[str, Any]:
    """
    Delete a file or directory
    
    Args:
        rel_path: Path to delete
        
    Returns:
        Result dictionary
    """
    try:
        abs_path = _safe_path(rel_path)
        
        if not os.path.exists(abs_path):
            return {"error": "Path not found"}
        
        if os.path.isdir(abs_path):
            shutil.rmtree(abs_path)
        else:
            os.remove(abs_path)
        
        log_activity("DELETE (CephFS)", rel_path, "success")
        return {"message": f"'{rel_path}' deleted from CephFS"}
    except Exception as e:
        logger.exception(f"delete_file_or_dir error for {rel_path}")
        log_activity("DELETE (CephFS)", rel_path, "error", str(e))
        return {"error": str(e)}

def create_directory(rel_path: str) -> Dict[str, Any]:
    """
    Create a directory
    
    Args:
        rel_path: Directory path
        
    Returns:
        Result dictionary
    """
    try:
        abs_path = _safe_path(rel_path)
        os.makedirs(abs_path, exist_ok=True)
        
        log_activity("MKDIR (CephFS)", rel_path, "success")
        return {"message": f"Directory '{rel_path}' created"}
    except Exception as e:
        logger.exception(f"create_directory error for {rel_path}")
        log_activity("MKDIR (CephFS)", rel_path, "error", str(e))
        return {"error": str(e)}

def get_directory_stats(rel_path: str = "") -> Dict[str, Any]:
    """
    Get statistics about a directory
    
    Args:
        rel_path: Directory path
        
    Returns:
        Dictionary with stats
    """
    try:
        abs_path = _safe_path(rel_path)
        
        if not os.path.exists(abs_path):
            return {"error": "Path not found"}
        
        total_size = 0
        file_count = 0
        dir_count = 0
        
        for dirpath, dirnames, filenames in os.walk(abs_path):
            dir_count += len(dirnames)
            file_count += len(filenames)
            for filename in filenames:
                filepath = os.path.join(dirpath, filename)
                try:
                    total_size += os.path.getsize(filepath)
                except OSError:
                    pass
        
        return {
            "path": rel_path,
            "total_size": total_size,
            "file_count": file_count,
            "dir_count": dir_count,
        }
    except Exception as e:
        logger.exception(f"get_directory_stats error for {rel_path}")
        return {"error": str(e)}
