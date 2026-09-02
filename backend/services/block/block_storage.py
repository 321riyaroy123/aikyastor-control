"""
services/block/block_storage.py - Block Storage (RBD) operations
Handles RBD image management, snapshots, and mapping

Moved from: block_storage.py (project root)
Responsibility: unchanged — all `rbd` CLI operations (list/create/delete
images, map/unmap, snapshots). block_routes.py calls into this module.
"""
import os
import tempfile
import json
from typing import Dict, List, Any, Tuple
from core.logger import logger
from config.config import RBD_POOL, CMD_TIMEOUT
from services.cluster.ceph_ops import run_ceph_cmd
from core.activity import log_activity

def list_rbd_images() -> Dict[str, Any]:
    """
    List all RBD images in the pool

    Returns:
        Dictionary with image list
    """
    try:
        stdout, stderr, code = run_ceph_cmd(f"rbd ls {RBD_POOL} --format json")
        if code != 0:
            return {"images": []}

        images_raw = json.loads(stdout) if stdout else []
        images = []

        for img_name in images_raw:
            stdout, stderr, code = run_ceph_cmd(
                f"rbd info {RBD_POOL}/{img_name} --format json"
            )
            if code == 0:
                info = json.loads(stdout)
                images.append({
                    "name": img_name,
                    "size": info.get("size", 0),
                    "format": info.get("format", 2),
                    "features": info.get("features", []),
                })

        return {"images": images}
    except Exception as e:
        logger.exception("list_rbd_images error")
        return {"images": [], "error": str(e)}

def create_rbd_image(name: str, size_mb: int) -> Dict[str, Any]:
    """
    Create a new RBD image

    Args:
        name: Image name
        size_mb: Size in MB

    Returns:
        Result dictionary
    """
    try:
        stdout, stderr, code = run_ceph_cmd(
            f"rbd create {RBD_POOL}/{name} --size {size_mb}M"
        )
        if code != 0:
            log_activity("CREATE IMAGE", name, "error", stderr)
            return {"error": stderr}

        log_activity("CREATE IMAGE", name, "success", f"{size_mb}MB created")
        return {"message": f"Image '{name}' ({size_mb}MB) created"}
    except Exception as e:
        logger.exception(f"create_rbd_image error for {name}")
        log_activity("CREATE IMAGE", name, "error", str(e))
        return {"error": str(e)}

def delete_rbd_image(name: str) -> Dict[str, Any]:
    """
    Delete an RBD image

    Args:
        name: Image name

    Returns:
        Result dictionary
    """
    try:
        # Unmap if mapped (best-effort, short timeout so a hung/busy device
        # doesn't consume the full CMD_TIMEOUT before the actual delete runs)
        run_ceph_cmd(
            f"sudo -n /usr/bin/rbd unmap {RBD_POOL}/{name} 2>/dev/null || true",
            timeout=5
        )
        stdout, stderr, code = run_ceph_cmd(f"rbd rm {RBD_POOL}/{name}")
        if code != 0:
            log_activity("DELETE IMAGE", name, "error", stderr)
            return {"error": stderr}

        log_activity("DELETE IMAGE", name, "success")
        return {"message": f"Image '{name}' deleted"}
    except Exception as e:
        logger.exception(f"delete_rbd_image error for {name}")
        log_activity("DELETE IMAGE", name, "error", str(e))
        return {"error": str(e)}

def map_rbd_image(name: str) -> Dict[str, Any]:
    """
    Map an RBD image to a device

    Args:
        name: Image name

    Returns:
        Result dictionary with device path
    """
    try:
        stdout, stderr, code = run_ceph_cmd(f"sudo -n /usr/bin/rbd map {RBD_POOL}/{name}")
        if code != 0:
            log_activity("MAP IMAGE", name, "error", stderr)
            return {"error": stderr}

        device = stdout.strip()
        log_activity("MAP IMAGE", name, "success", f"Device: {device}")
        return {"message": f"'{name}' mapped to {device}", "device": device}
    except Exception as e:
        logger.exception(f"map_rbd_image error for {name}")
        log_activity("MAP IMAGE", name, "error", str(e))
        return {"error": str(e)}

def unmap_rbd_image(device: str) -> Dict[str, Any]:
    """
    Unmap an RBD device

    Args:
        device: Mapped device path, e.g. /dev/rbd0
    """
    try:
        stdout, stderr, code = run_ceph_cmd(
            f"sudo -n /usr/bin/rbd unmap {device}"
        )

        if code != 0:
            log_activity("UNMAP IMAGE", device, "error", stderr)
            return {"error": stderr}

        log_activity("UNMAP IMAGE", device, "success")
        return {"message": f"'{device}' unmapped"}

    except Exception as e:
        logger.exception(f"unmap_rbd_image error for {device}")
        log_activity("UNMAP IMAGE", device, "error", str(e))
        return {"error": str(e)}
        
def list_mapped_images() -> Dict[str, Any]:
    """
    List all mapped RBD images

    Returns:
        Dictionary with mapped images
    """
    try:
        stdout, stderr, code = run_ceph_cmd(
            "sudo -n /usr/bin/rbd showmapped --format json"
        )

        if code != 0:
            logger.error(f"list_mapped_images failed: {stderr}")
            return {"mapped": [], "error": stderr}

        mapped = json.loads(stdout) if stdout else []

        return {"mapped": mapped}

    except Exception as e:
        logger.exception("list_mapped_images error")
        return {"mapped": [], "error": str(e)}

def create_snapshot(image_name: str, snapshot_name: str) -> Dict[str, Any]:
    """
    Create a snapshot of an RBD image

    Args:
        image_name: Image name
        snapshot_name: Snapshot name

    Returns:
        Result dictionary
    """
    try:
        stdout, stderr, code = run_ceph_cmd(
            f"rbd snap create {RBD_POOL}/{image_name}@{snapshot_name}"
        )
        if code != 0:
            log_activity("SNAPSHOT", f"{image_name}@{snapshot_name}", "error", stderr)
            return {"error": stderr}

        log_activity("SNAPSHOT", f"{image_name}@{snapshot_name}", "success")
        return {"message": f"Snapshot '{snapshot_name}' created for '{image_name}'"}
    except Exception as e:
        logger.exception(f"create_snapshot error for {image_name}@{snapshot_name}")
        log_activity("SNAPSHOT", f"{image_name}@{snapshot_name}", "error", str(e))
        return {"error": str(e)}

def list_snapshots(image_name: str) -> Dict[str, Any]:
    """
    List snapshots for an RBD image

    Args:
        image_name: Image name

    Returns:
        Dictionary with snapshots
    """
    try:
        stdout, stderr, code = run_ceph_cmd(
            f"rbd snap ls {RBD_POOL}/{image_name} --format json"
        )
        snaps = json.loads(stdout) if stdout else []
        return {"snapshots": snaps}
    except Exception as e:
        logger.exception(f"list_snapshots error for {image_name}")
        return {"snapshots": [], "error": str(e)}

def export_snapshot(image_name: str, snapshot_name: str) -> Dict[str, Any]:
    """
    Export an RBD snapshot to a temporary image file.

    Returns:
        Dictionary containing the temporary file path and download filename.
    """
    export_path = None

    try:
        # Generate a unique temporary filename
        fd, export_path = tempfile.mkstemp(
            prefix="aikyastor-rbd-",
            suffix=".img"
        )

        # Close and remove the empty file.
        # rbd export requires the destination not to already exist.
        os.close(fd)
        os.unlink(export_path)

        stdout, stderr, code = run_ceph_cmd(
            f"rbd export "
            f"{RBD_POOL}/{image_name}@{snapshot_name} "
            f"{export_path}",
            timeout=CMD_TIMEOUT
        )

        if code != 0:
            if export_path and os.path.exists(export_path):
                os.remove(export_path)

            log_activity(
                "EXPORT SNAPSHOT",
                f"{image_name}@{snapshot_name}",
                "error",
                stderr
            )

            return {"error": stderr}

        filename = f"{image_name}-{snapshot_name}.img"

        log_activity(
            "EXPORT SNAPSHOT",
            f"{image_name}@{snapshot_name}",
            "success",
            f"Exported as {filename}"
        )

        return {
            "path": export_path,
            "filename": filename
        }

    except Exception as e:
        logger.exception(
            f"export_snapshot error for "
            f"{image_name}@{snapshot_name}"
        )

        if export_path and os.path.exists(export_path):
            try:
                os.remove(export_path)
            except OSError:
                pass

        log_activity(
            "EXPORT SNAPSHOT",
            f"{image_name}@{snapshot_name}",
            "error",
            str(e)
        )

        return {"error": str(e)}