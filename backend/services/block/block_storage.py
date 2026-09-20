"""
services/block/block_storage.py - Block Storage (RBD) operations
Handles RBD image management, snapshots, and mapping

Moved from: block_storage.py (project root)
Responsibility: unchanged — all `rbd` CLI operations (list/create/delete
images, map/unmap, snapshots). block_routes.py calls into this module.
"""

import re
import os
import tempfile
import json
import subprocess
from typing import Dict, List, Any, Tuple, Generator, Optional
from core.logger import logger
from config.config import RBD_POOL, CMD_TIMEOUT
from services.cluster.ceph_ops import run_ceph_cmd
from core.activity import log_activity

def _resolve_pool(pool: Optional[str]) -> str:
    """Return the requested RBD pool or the configured default."""
    return (pool or RBD_POOL).strip()

def list_rbd_pools() -> Dict[str, Any]:
    """
    Return only pools initialized for RBD.

    Uses Ceph pool application metadata. A pool initialized with
    `rbd pool init` is tagged with the `rbd` application.
    """
    try:
        stdout, stderr, code = run_ceph_cmd(
            "ceph osd pool application get --format json"
        )

        if code != 0:
            return {
                "pools": [],
                "error": stderr,
            }

        pool_apps = json.loads(stdout) if stdout else {}

        rbd_pools = [
            pool_name
            for pool_name, applications in pool_apps.items()
            if "rbd" in applications
        ]

        return {
            "pools": rbd_pools
        }

    except Exception as e:
        logger.exception("list_rbd_pools error")

        return {
            "pools": [],
            "error": str(e),
        }

def create_rbd_pool(name: str) -> Dict[str, Any]:
    """
    Create and initialize a Ceph pool for RBD usage.

    Args:
        name: Name of the new RBD pool.

    Returns:
        Result dictionary.
    """

    try:
        name = (name or "").strip()

        # Keep pool names simple and safe because they are
        # passed to Ceph CLI commands.
        if not name:
            return {"error": "Pool name is required"}

        if not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}",
            name
        ):
            return {
                "error": (
                    "Invalid pool name. Use letters, numbers, "
                    "dots, underscores, or hyphens."
                )
            }

        # Step 1: Create the Ceph pool
        stdout, stderr, code = run_ceph_cmd(
            f"ceph osd pool create {name}"
        )

        if code != 0:
            log_activity(
                "CREATE RBD POOL",
                name,
                "error",
                stderr
            )
            return {"error": stderr}

        # Step 2: Initialize the pool for RBD
        stdout, stderr, code = run_ceph_cmd(
            f"rbd pool init {name}"
        )

        if code != 0:
            log_activity(
                "CREATE RBD POOL",
                name,
                "error",
                (
                    "Pool created, but RBD initialization failed: "
                    f"{stderr}"
                )
            )

            return {
                "error": (
                    "Pool was created, but RBD initialization "
                    f"failed: {stderr}"
                )
            }

        log_activity(
            "CREATE RBD POOL",
            name,
            "success",
            "Pool created and initialized for RBD"
        )

        return {
            "message": (
                f"RBD pool '{name}' created and initialized"
            )
        }

    except Exception as e:
        logger.exception(
            f"create_rbd_pool error for {name}"
        )

        log_activity(
            "CREATE RBD POOL",
            name,
            "error",
            str(e)
        )

        return {"error": str(e)}

def list_rbd_images(pool: Optional[str] = None):
    pool = _resolve_pool(pool)

    try:
        stdout, stderr, code = run_ceph_cmd(
            f"rbd ls {pool} --format json"
        )

        if code != 0:
            return {
                "images": [],
                "error": stderr,
            }

        images_raw = json.loads(stdout) if stdout else []
        images = []

        for img_name in images_raw:
            stdout, stderr, code = run_ceph_cmd(
                f"rbd info {pool}/{img_name} --format json"
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

        return {
            "images": [],
            "error": str(e),
        }

def create_rbd_image(
    name: str,
    size_mb: int,
    pool: Optional[str] = None,
):

    pool = _resolve_pool(pool)

    try:
        stdout, stderr, code = run_ceph_cmd(
            f"rbd create {pool}/{name} --size {size_mb}M"
        )

        if code != 0:
            log_activity(
                "CREATE IMAGE",
                f"{pool}/{name}",
                "error",
                stderr,
            )

            return {"error": stderr}

        log_activity(
            "CREATE IMAGE",
            f"{pool}/{name}",
            "success",
            f"{size_mb}MB created",
        )

        return {
            "message": (
                f"Image '{name}' ({size_mb}MB) "
                f"created in pool '{pool}'"
            )
        }

    except Exception as e:
        logger.exception(
            f"create_rbd_image error for {pool}/{name}"
        )

        return {"error": str(e)}
        
def delete_rbd_image(name: str, pool: Optional[str] = None):
    """
    Delete an RBD image

    Args:
        name: Image name
        pool: Pool name

    Returns:
        Result dictionary
    """
    pool = _resolve_pool(pool)
    try:
        # Unmap if mapped (best-effort, short timeout so a hung/busy device
        # doesn't consume the full CMD_TIMEOUT before the actual delete runs)
        run_ceph_cmd(
            f"sudo -n /usr/bin/rbd unmap {pool}/{name} 2>/dev/null || true",
            timeout=5
        )
        stdout, stderr, code = run_ceph_cmd(f"rbd rm {pool}/{name}")
        if code != 0:
            log_activity("DELETE IMAGE", f"{pool}/{name}", "error", stderr)
            return {"error": stderr}

        log_activity("DELETE IMAGE", f"{pool}/{name}", "success")
        return {"message": f"Image '{name}' deleted"}
    except Exception as e:
        logger.exception(f"delete_rbd_image error for {pool}/{name}")
        log_activity("DELETE IMAGE", f"{pool}/{name}", "error", str(e))
        return {"error": str(e)}

def map_rbd_image(name: str, pool: Optional[str] = None):
    """
    Map an RBD image to a device

    Args:
        name: Image name
        pool: Pool name

    Returns:
        Result dictionary with device path
    """
    pool = _resolve_pool(pool)
    try:
        stdout, stderr, code = run_ceph_cmd(f"sudo -n /usr/bin/rbd map {pool}/{name}")
        if code != 0:
            log_activity("MAP IMAGE", f"{pool}/{name}", "error", stderr)
            return {"error": stderr}

        device = stdout.strip()
        log_activity("MAP IMAGE", f"{pool}/{name}", "success", f"Device: {device}")
        return {"message": f"'{name}' mapped to {device}", "device": device}
    except Exception as e:
        logger.exception(f"map_rbd_image error for {pool}/{name}")
        log_activity("MAP IMAGE", f"{pool}/{name}", "error", str(e))
        return {"error": str(e)}

def unmap_rbd_image(
    name: str,
    pool: Optional[str] = None
) -> Dict[str, Any]:
    """
    Unmount and unmap all RBD mappings for an image.

    Workflow:
        1. Resolve pool.
        2. Find all mapped devices for pool/image.
        3. Check whether each device is mounted.
        4. If mounted, check whether the mount is busy.
        5. If safe, unmount the filesystem.
        6. Unmap the RBD device.

    The agent is not involved in this operation. The backend
    discovers the current RBD mapping independently.

    Args:
        name: RBD image name.
        pool: RBD pool name.

    Returns:
        Dictionary describing the unmount/unmap operation.
    """

    pool = _resolve_pool(pool)

    if not name or not name.strip():
        return {"error": "RBD image name is required"}

    name = name.strip()

    try:
        # ---------------------------------------------------------
        # 1. Discover all currently mapped RBD devices
        # ---------------------------------------------------------
        stdout, stderr, code = run_ceph_cmd(
            "sudo -n /usr/bin/rbd showmapped --format json"
        )

        if code != 0:
            error = stderr.strip() or "Unable to determine mapped RBD devices"

            log_activity(
                "UNMAP IMAGE",
                f"{pool}/{name}",
                "error",
                error
            )

            return {"error": error}

        if not stdout.strip():
            return {
                "error": (
                    f"RBD image '{pool}/{name}' "
                    "is not currently mapped"
                )
            }

        # ---------------------------------------------------------
        # 2. Parse rbd showmapped JSON
        #
        # Ceph versions can return the mappings as either:
        #   { "0": {...}, "1": {...} }
        #
        # or:
        #   [{...}, {...}]
        # ---------------------------------------------------------
        try:
            mapped_data = json.loads(stdout)
        except json.JSONDecodeError as e:
            logger.exception("Failed to parse rbd showmapped JSON")

            return {
                "error": f"Invalid rbd showmapped JSON: {str(e)}"
            }

        if isinstance(mapped_data, dict):
            mappings = list(mapped_data.values())
        elif isinstance(mapped_data, list):
            mappings = mapped_data
        else:
            mappings = []

        # ---------------------------------------------------------
        # 3. Find mappings belonging to this exact pool/image
        # ---------------------------------------------------------
        matching_mappings = []

        for mapping in mappings:
            if not isinstance(mapping, dict):
                continue

            mapping_pool = str(mapping.get("pool", "")).strip()
            mapping_name = str(
                mapping.get("name", mapping.get("image", ""))
            ).strip()

            if (
                mapping_pool == pool
                and mapping_name == name
            ):
                matching_mappings.append(mapping)

        if not matching_mappings:
            return {
                "error": (
                    f"RBD image '{pool}/{name}' "
                    "is not currently mapped"
                )
            }

        # ---------------------------------------------------------
        # 4. Resolve devices
        # ---------------------------------------------------------
        devices = []

        for mapping in matching_mappings:
            device = str(mapping.get("device", "")).strip()

            if device:
                devices.append(device)

        if not devices:
            return {
                "error": (
                    f"RBD image '{pool}/{name}' has mappings, "
                    "but no device paths were reported"
                )
            }

        # Remove duplicates while preserving order.
        devices = list(dict.fromkeys(devices))

        # ---------------------------------------------------------
        # 5. Find mountpoints BEFORE changing anything
        #
        # We do this for all devices first so that we don't
        # partially unmount/unmap the image.
        # ---------------------------------------------------------
        mounted_devices = []

        for device in devices:
            mount_stdout, mount_stderr, mount_code = run_ceph_cmd(
                f"findmnt -n -o TARGET --source {device}"
            )

            mountpoint = mount_stdout.strip()

            if mount_code == 0 and mountpoint:
                mounted_devices.append({
                    "device": device,
                    "mountpoint": mountpoint
                })

        # ---------------------------------------------------------
        # 6. Check whether mounted filesystems are busy
        # ---------------------------------------------------------
        busy_mounts = []

        for mounted in mounted_devices:
            device = mounted["device"]
            mountpoint = mounted["mountpoint"]

            busy_stdout, busy_stderr, busy_code = run_ceph_cmd(
                f"sudo -n /usr/bin/fuser -m {mountpoint}"
            )

            # fuser:
            #   0 = one or more processes are using it
            #   non-zero = no processes found / command issue
            if busy_code == 0 and busy_stdout.strip():
                busy_mounts.append({
                    "device": device,
                    "mountpoint": mountpoint,
                    "processes": busy_stdout.strip()
                })

        # ---------------------------------------------------------
        # 7. Never force-unmount a busy filesystem
        # ---------------------------------------------------------
        if busy_mounts:
            log_activity(
                "UNMAP IMAGE",
                f"{pool}/{name}",
                "error",
                "Filesystem is busy"
            )

            return {
                "error": (
                    f"Cannot unmap '{pool}/{name}' because "
                    "the filesystem is currently in use"
                ),
                "busy": busy_mounts,
                "devices": devices
            }

        # ---------------------------------------------------------
        # 8. Automatically unmount safe mountpoints
        # ---------------------------------------------------------
        unmounted = []

        for mounted in mounted_devices:
            device = mounted["device"]
            mountpoint = mounted["mountpoint"]

            stdout_umount, stderr_umount, code_umount = run_ceph_cmd(
                f"sudo -n /usr/bin/umount {mountpoint}"
            )

            if code_umount != 0:
                error = (
                    stderr_umount.strip()
                    or f"Failed to unmount {mountpoint}"
                )

                log_activity(
                    "UNMAP IMAGE",
                    f"{pool}/{name}",
                    "error",
                    error
                )

                return {
                    "error": error,
                    "device": device,
                    "mountpoint": mountpoint,
                    "unmounted": unmounted
                }

            unmounted.append({
                "device": device,
                "mountpoint": mountpoint
            })

        # ---------------------------------------------------------
        # 9. Unmap every matching RBD device
        # ---------------------------------------------------------
        unmapped = []

        for device in devices:
            stdout_unmap, stderr_unmap, code_unmap = run_ceph_cmd(
                f"sudo -n /usr/bin/rbd unmap {device}"
            )

            if code_unmap != 0:
                error = (
                    stderr_unmap.strip()
                    or f"Failed to unmap {device}"
                )

                log_activity(
                    "UNMAP IMAGE",
                    f"{pool}/{name}",
                    "error",
                    error
                )

                return {
                    "error": error,
                    "device": device,
                    "unmounted": unmounted,
                    "unmapped": unmapped
                }

            unmapped.append(device)

        # ---------------------------------------------------------
        # 10. Success
        # ---------------------------------------------------------
        log_activity(
            "UNMAP IMAGE",
            f"{pool}/{name}",
            "success",
            (
                f"Unmounted {len(unmounted)} mount(s), "
                f"unmapped {len(unmapped)} device(s)"
            )
        )

        return {
            "message": (
                f"RBD image '{pool}/{name}' "
                "unmounted and unmapped successfully"
            ),
            "pool": pool,
            "image": name,
            "unmounted": unmounted,
            "unmapped": unmapped
        }

    except Exception as e:
        logger.exception(
            f"unmap_rbd_image error for {pool}/{name}"
        )

        log_activity(
            "UNMAP IMAGE",
            f"{pool}/{name}",
            "error",
            str(e)
        )

        return {
            "error": str(e)
        }       

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

def create_snapshot(image_name: str, snapshot_name: str, pool: str | None = None) -> Dict[str, Any]:
    """
    Create a snapshot of an RBD image

    Args:
        image_name: Image name
        snapshot_name: Snapshot name
        pool: Pool name

    Returns:
        Result dictionary
    """
    pool = _resolve_pool(pool)
    try:
        stdout, stderr, code = run_ceph_cmd(
            f"rbd snap create {pool}/{image_name}@{snapshot_name}"
        )
        if code != 0:
            log_activity("SNAPSHOT", f"{pool}/{image_name}@{snapshot_name}", "error", stderr)
            return {"error": stderr}

        log_activity("SNAPSHOT", f"{pool}/{image_name}@{snapshot_name}", "success")
        return {"message": f"Snapshot '{snapshot_name}' created for '{image_name}'"}
    except Exception as e:
        logger.exception(f"create_snapshot error for {pool}/{image_name}@{snapshot_name}")
        log_activity("SNAPSHOT", f"{pool}/{image_name}@{snapshot_name}", "error", str(e))
        return {"error": str(e)}

def list_snapshots(image_name: str, pool: str | None = None) -> Dict[str, Any]:
    """
    List snapshots for an RBD image

    Args:
        image_name: Image name
        pool: Pool name

    Returns:
        Dictionary with snapshots
    """
    pool = _resolve_pool(pool)
    try:
        stdout, stderr, code = run_ceph_cmd(
            f"rbd snap ls {pool}/{image_name} --format json"
        )
        snaps = json.loads(stdout) if stdout else []
        return {"snapshots": snaps}
    except Exception as e:
        logger.exception(f"list_snapshots error for {pool}/{image_name}")
        return {"snapshots": [], "error": str(e)}

def export_snapshot(image_name: str, snapshot_name: str, pool: str | None = None) -> Dict[str, Any]:
    """
    Export an RBD snapshot to a temporary image file.

    Returns:
        Dictionary containing the temporary file path and download filename.
    """
    pool = _resolve_pool(pool)
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
            f"{pool}/{image_name}@{snapshot_name} "
            f"{export_path}",
            timeout=CMD_TIMEOUT
        )

        if code != 0:
            if export_path and os.path.exists(export_path):
                os.remove(export_path)

            log_activity(
                "EXPORT SNAPSHOT",
                f"{pool}/{image_name}@{snapshot_name}",
                "error",
                stderr
            )

            return {"error": stderr}

        filename = f"{image_name}-{snapshot_name}.img"

        log_activity(
            "EXPORT SNAPSHOT",
            f"{pool}/{image_name}@{snapshot_name}",
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
            f"{pool}/{image_name}@{snapshot_name}"
        )

        if export_path and os.path.exists(export_path):
            try:
                os.remove(export_path)
            except OSError:
                pass

        log_activity(
            "EXPORT SNAPSHOT",
            f"{pool}/{image_name}@{snapshot_name}",
            "error",
            str(e)
        )

        return {"error": str(e)}

def delete_snapshot(
    image_name: str,
    snapshot_name: str,
    pool: str | None = None,
) -> Dict[str, Any]:
    """
    Delete an RBD snapshot.
    """
    pool = _resolve_pool(pool)

    try:
        stdout, stderr, code = run_ceph_cmd(
            f"rbd snap rm {pool}/{image_name}@{snapshot_name}"
        )

        if code != 0:
            log_activity(
                "DELETE SNAPSHOT",
                f"{pool}/{image_name}@{snapshot_name}",
                "error",
                stderr,
            )
            return {"error": stderr}

        log_activity(
            "DELETE SNAPSHOT",
            f"{pool}/{image_name}@{snapshot_name}",
            "success",
        )

        return {
            "message": (
                f"Snapshot '{snapshot_name}' deleted "
                f"from '{image_name}'"
            )
        }

    except Exception as e:
        logger.exception(
            f"delete_snapshot error for "
            f"{pool}/{image_name}@{snapshot_name}"
        )

        log_activity(
            "DELETE SNAPSHOT",
            f"{pool}/{image_name}@{snapshot_name}",
            "error",
            str(e),
        )

        return {"error": str(e)}

def stream_snapshot_export(
    image_name: str,
    snapshot_name: str,
    pool: str | None = None,
):
    """
    Stream an RBD snapshot export directly from Ceph.

    The exported image is not written to a temporary file.
    """
    pool = _resolve_pool(pool)

    command = [
        "rbd",
        "export",
        f"{pool}/{image_name}@{snapshot_name}",
        "-",
    ]

    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=1024 * 1024,
        )

        return process

    except Exception as e:
        logger.exception(
            f"stream_snapshot_export error for "
            f"{pool}/{image_name}@{snapshot_name}"
        )

        raise