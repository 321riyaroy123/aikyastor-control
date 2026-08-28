"""
services/file/cephfs_mount.py - CephFS mount management

Handles:
    - CephFS configuration/status
    - Connection testing
    - Mounting
    - Unmounting

Privileged mount/unmount operations are performed through
the restricted system helpers configured on the Ceph server.
"""

import os
import subprocess
from typing import Dict, Any

from config.config import (
    CEPHFS_MOUNT,
    CEPHFS_NAME,
    CEPHFS_USER,
    CEPHFS_KEYRING,
    CEPH_CONF,
)
from core.logger import logger
from core.activity import log_activity


# These are the only privileged commands AiKyaStor is allowed to execute.
MOUNT_HELPER = "/usr/local/sbin/aikyastor-cephfs-mount"
UNMOUNT_HELPER = "/usr/local/sbin/aikyastor-cephfs-unmount"


def is_mounted() -> bool:
    """Return True if the configured CephFS mount point is mounted."""
    try:
        result = subprocess.run(
            ["/usr/bin/mountpoint", "-q", CEPHFS_MOUNT],
            capture_output=True,
            timeout=5,
        )
        return result.returncode == 0

    except Exception:
        logger.exception("CephFS mount status check failed")
        return False


def get_mount_status() -> Dict[str, Any]:
    """Return the current CephFS configuration and mount status."""
    return {
        "configured": bool(
            CEPHFS_MOUNT
            and CEPHFS_NAME
            and CEPHFS_USER
            and CEPHFS_KEYRING
            and CEPH_CONF
        ),
        "mounted": is_mounted(),
        "filesystem": CEPHFS_NAME,
        "user": CEPHFS_USER,
        "mount_point": CEPHFS_MOUNT,
    }


def test_connection() -> Dict[str, Any]:
    """
    Test whether the configured CephFS can be accessed.

    This does not mount the filesystem.
    """
    try:
        if not os.path.isfile(CEPH_CONF):
            return {
                "success": False,
                "error": f"Ceph configuration not found: {CEPH_CONF}",
            }

        if not os.path.isfile(CEPHFS_KEYRING):
            return {
                "success": False,
                "error": f"Ceph keyring not found: {CEPHFS_KEYRING}",
            }

        # Query the configured filesystem using the existing Ceph
        # configuration and keyring.
        result = subprocess.run(
            [
                "/usr/bin/ceph",
                "--conf", CEPH_CONF,
                "--keyring", CEPHFS_KEYRING,
                "--id", CEPHFS_USER,
                "fs",
                "ls",
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )

        if result.returncode != 0:
            error = result.stderr.strip() or "Ceph connection test failed"

            log_activity(
                "TEST CONNECTION (CephFS)",
                CEPHFS_NAME,
                "error",
                error,
            )

            return {
                "success": False,
                "error": error,
            }

        if CEPHFS_NAME not in result.stdout:
            error = f"CephFS filesystem '{CEPHFS_NAME}' was not found"

            log_activity(
                "TEST CONNECTION (CephFS)",
                CEPHFS_NAME,
                "error",
                error,
            )

            return {
                "success": False,
                "error": error,
            }

        log_activity(
            "TEST CONNECTION (CephFS)",
            CEPHFS_NAME,
            "success",
            "CephFS connection successful",
        )

        return {
            "success": True,
            "filesystem": CEPHFS_NAME,
            "user": CEPHFS_USER,
            "message": "CephFS connection successful",
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "error": "Ceph connection test timed out",
        }

    except Exception as e:
        logger.exception("CephFS connection test failed")
        return {
            "success": False,
            "error": str(e),
        }


def mount_cephfs() -> Dict[str, Any]:
    """Mount the configured CephFS through the restricted helper."""
    try:
        if is_mounted():
            return {
                "success": True,
                "mounted": True,
                "mount_point": CEPHFS_MOUNT,
                "message": "CephFS is already mounted",
            }

        result = subprocess.run(
            ["sudo", "-n", MOUNT_HELPER],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            error = result.stderr.strip() or "CephFS mount failed"

            log_activity(
                "MOUNT (CephFS)",
                CEPHFS_MOUNT,
                "error",
                error,
            )

            return {
                "success": False,
                "mounted": False,
                "error": error,
            }

        # Do not trust the command's exit code alone.
        if not is_mounted():
            error = "Mount command succeeded but CephFS is not mounted"

            log_activity(
                "MOUNT (CephFS)",
                CEPHFS_MOUNT,
                "error",
                error,
            )

            return {
                "success": False,
                "mounted": False,
                "error": error,
            }

        log_activity(
            "MOUNT (CephFS)",
            CEPHFS_MOUNT,
            "success",
            f"Mounted {CEPHFS_NAME}",
        )

        return {
            "success": True,
            "mounted": True,
            "filesystem": CEPHFS_NAME,
            "mount_point": CEPHFS_MOUNT,
            "message": f"CephFS mounted at {CEPHFS_MOUNT}",
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "mounted": False,
            "error": "CephFS mount operation timed out",
        }

    except Exception as e:
        logger.exception("CephFS mount failed")

        return {
            "success": False,
            "mounted": False,
            "error": str(e),
        }


def unmount_cephfs() -> Dict[str, Any]:
    """Unmount the configured CephFS through the restricted helper."""
    try:
        if not is_mounted():
            return {
                "success": True,
                "mounted": False,
                "mount_point": CEPHFS_MOUNT,
                "message": "CephFS is already unmounted",
            }

        result = subprocess.run(
            ["sudo", "-n", UNMOUNT_HELPER],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            error = result.stderr.strip() or "CephFS unmount failed"

            log_activity(
                "UNMOUNT (CephFS)",
                CEPHFS_MOUNT,
                "error",
                error,
            )

            return {
                "success": False,
                "mounted": True,
                "error": error,
            }

        if is_mounted():
            error = "Unmount command succeeded but CephFS is still mounted"

            log_activity(
                "UNMOUNT (CephFS)",
                CEPHFS_MOUNT,
                "error",
                error,
            )

            return {
                "success": False,
                "mounted": True,
                "error": error,
            }

        log_activity(
            "UNMOUNT (CephFS)",
            CEPHFS_MOUNT,
            "success",
        )

        return {
            "success": True,
            "mounted": False,
            "mount_point": CEPHFS_MOUNT,
            "message": f"CephFS unmounted from {CEPHFS_MOUNT}",
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "mounted": True,
            "error": "CephFS unmount operation timed out",
        }

    except Exception as e:
        logger.exception("CephFS unmount failed")

        return {
            "success": False,
            "mounted": True,
            "error": str(e),
        }