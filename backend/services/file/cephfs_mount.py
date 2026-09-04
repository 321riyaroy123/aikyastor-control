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
# Runtime CephFS configuration.
# This stores only non-secret configuration. CephX credentials
# remain in the system keyring under /etc/ceph/.
RUNTIME_CONFIG = os.path.join(
    os.path.dirname(__file__),
    "../../config/cephfs_runtime.json",
)

def _default_config() -> Dict[str, Any]:
    """Return the CephFS configuration from environment defaults."""
    return {
        "filesystem": CEPHFS_NAME,
        "user": CEPHFS_USER,
        "monitors": os.getenv("CEPHFS_MONITORS", ""),
        "mount_point": CEPHFS_MOUNT,
    }


def _load_runtime_store() -> Dict[str, Any]:
    """
    Load persisted CephFS configurations.

    The old single-configuration format is automatically migrated
    into the new per-filesystem format.
    """
    import json

    if not os.path.isfile(RUNTIME_CONFIG):
        return {
            "active": None,
            "filesystems": {},
        }

    try:
        with open(RUNTIME_CONFIG, "r", encoding="utf-8") as f:
            data = json.load(f)

        # New format.
        if isinstance(data, dict) and "filesystems" in data:
            return {
                "active": data.get("active"),
                "filesystems": data.get("filesystems", {}),
            }

        # Migrate the previous single-config format.
        if isinstance(data, dict) and data.get("filesystem"):
            filesystem = data["filesystem"]

            migrated = {
                "active": filesystem,
                "filesystems": {
                    filesystem: {
                        "user": data.get("user", CEPHFS_USER),
                        "monitors": data.get(
                            "monitors",
                            os.getenv("CEPHFS_MONITORS", ""),
                        ),
                        "mount_point": data.get(
                            "mount_point",
                            CEPHFS_MOUNT,
                        ),
                    }
                },
            }

            return migrated

    except Exception:
        logger.exception(
            "Failed to read runtime CephFS configuration store"
        )

    return {
        "active": None,
        "filesystems": {},
    }


def _save_runtime_store(store: Dict[str, Any]) -> None:
    """Persist the CephFS configuration store atomically."""
    import json

    os.makedirs(
        os.path.dirname(RUNTIME_CONFIG),
        exist_ok=True,
    )

    temp_path = f"{RUNTIME_CONFIG}.tmp"

    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2)
        f.write("\n")

    os.replace(temp_path, RUNTIME_CONFIG)


def get_active_config() -> Dict[str, Any]:
    """
    Return the configuration of the currently active filesystem.
    """
    store = _load_runtime_store()

    active = store.get("active")
    saved = store.get("filesystems", {}).get(active)

    if active and saved:
        return {
            "filesystem": active,
            "user": saved.get("user", CEPHFS_USER),
            "monitors": saved.get(
                "monitors",
                os.getenv("CEPHFS_MONITORS", ""),
            ),
            "mount_point": saved.get(
                "mount_point",
                CEPHFS_MOUNT,
            ),
        }

    return _default_config()


def get_saved_config(filesystem: str) -> Dict[str, Any] | None:
    """
    Return the saved configuration for a specific filesystem.
    """
    store = _load_runtime_store()

    saved = store.get("filesystems", {}).get(filesystem)

    if not saved:
        return None

    return {
        "filesystem": filesystem,
        "user": saved.get("user", CEPHFS_USER),
        "monitors": saved.get(
            "monitors",
            os.getenv("CEPHFS_MONITORS", ""),
        ),
        "mount_point": saved.get(
            "mount_point",
            CEPHFS_MOUNT,
        ),
    }


def save_active_config(
    filesystem: str,
    user: str,
    monitors: str,
    mount_point: str,
) -> None:
    """
    Save configuration for a filesystem and make it active.
    """
    store = _load_runtime_store()

    store.setdefault("filesystems", {})

    store["filesystems"][filesystem] = {
        "user": user,
        "monitors": monitors,
        "mount_point": mount_point,
    }

    store["active"] = filesystem

    _save_runtime_store(store)
    
def get_active_mount_point() -> str:
    """Return the mount point used by the active CephFS configuration."""
    return get_active_config()["mount_point"]

def is_mounted(mount_point: str = CEPHFS_MOUNT) -> bool:
    """Return True if the specified mount point is mounted."""
    try:
        result = subprocess.run(
            ["/usr/bin/mountpoint", "-q", mount_point],
            capture_output=True,
            timeout=5,
        )
        return result.returncode == 0

    except Exception:
        logger.exception(
            "CephFS mount status check failed for %s",
            mount_point,
        )
        return False

def get_mount_status() -> Dict[str, Any]:
    """Return the current active CephFS configuration and mount status."""
    config = get_active_config()
    mount_point = config["mount_point"]

    return {
        "configured": bool(
            config["filesystem"]
            and config["user"]
            and config["monitors"]
            and mount_point
            and CEPH_CONF
        ),
        "mounted": is_mounted(mount_point),
        "filesystem": config["filesystem"],
        "user": config["user"],
        "monitors": config["monitors"],
        "mount_point": mount_point,
    }

def list_filesystems() -> Dict[str, Any]:
    """
    Return the CephFS filesystems visible to the configured Ceph user.
    """
    try:
        config = get_active_config()

        filesystem_user = config["user"]
        monitors = config["monitors"]

        if not filesystem_user:
            return {
                "success": False,
                "error": "Ceph user is not configured",
            }

        if not monitors:
            return {
                "success": False,
                "error": "Ceph monitor addresses are not configured",
            }

        keyring = f"/etc/ceph/ceph.client.{filesystem_user}.keyring"

        if not os.path.isfile(keyring):
            return {
                "success": False,
                "error": (
                    f"Keyring not found for user "
                    f"'{filesystem_user}': {keyring}"
                ),
            }

        result = subprocess.run(
            [
                "/usr/bin/ceph",
                "--conf", CEPH_CONF,
                "--keyring", keyring,
                "--id", filesystem_user,
                "--mon-host", monitors,
                "fs",
                "ls",
                "-f", "json",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode != 0:
            error = result.stderr.strip() or "Unable to list CephFS filesystems"

            logger.error(
                "CephFS filesystem listing failed: %s",
                error,
            )

            return {
                "success": False,
                "error": error,
            }

        import json

        data = json.loads(result.stdout or "[]")

        filesystems = [
            item["name"]
            for item in data
            if isinstance(item, dict) and item.get("name")
        ]

        return {
            "success": True,
            "filesystems": filesystems,
        }

    except subprocess.TimeoutExpired:
        logger.error("CephFS filesystem listing timed out")

        return {
            "success": False,
            "error": "CephFS filesystem listing timed out",
        }

    except Exception as e:
        logger.exception("CephFS filesystem listing failed")

        return {
            "success": False,
            "error": str(e),
        }

def test_connection(
    filesystem: str,
    user: str,
    monitors: str,
) -> Dict[str, Any]:
    """
    Test whether the requested CephFS can be accessed.

    This does not mount the filesystem.
    """
    try:
        if not os.path.isfile(CEPH_CONF):
            return {
                "success": False,
                "error": f"Ceph configuration not found: {CEPH_CONF}",
            }

        # Validate the requested filesystem.
        if not filesystem or not filesystem.strip():
            return {
                "success": False,
                "error": "Filesystem is required",
            }

        # Validate the requested user.
        if not user or not user.strip():
            return {
                "success": False,
                "error": "User is required",
            }

        # Validate monitor address.
        if not monitors or not monitors.strip():
            return {
                "success": False,
                "error": "Monitors are required",
            }

        # The keyring is determined from the requested Ceph user.
        keyring = f"/etc/ceph/ceph.client.{user}.keyring"

        if not os.path.isfile(keyring):
            return {
                "success": False,
                "error": f"Keyring not found for user '{user}': {keyring}",
            }

        result = subprocess.run(
            [
                "/usr/bin/ceph",
                "--conf", CEPH_CONF,
                "--keyring", keyring,
                "--id", user,
                "--mon-host", monitors,
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
                filesystem,
                "error",
                error,
            )

            return {
                "success": False,
                "error": error,
            }

        # IMPORTANT:
        # Check the filesystem supplied by the user,
        # not CEPHFS_NAME from .env.
        if filesystem not in result.stdout:
            error = f"CephFS filesystem '{filesystem}' was not found"

            log_activity(
                "TEST CONNECTION (CephFS)",
                filesystem,
                "error",
                error,
            )

            return {
                "success": False,
                "error": error,
            }

        log_activity(
            "TEST CONNECTION (CephFS)",
            filesystem,
            "success",
            "CephFS connection successful",
        )

        return {
            "success": True,
            "filesystem": filesystem,
            "user": user,
            "monitors": monitors,
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

def mount_cephfs(
    filesystem: str,
    user: str,
    monitors: str,
    mount_point: str,
) -> Dict[str, Any]:
    """Mount the requested CephFS through the restricted helper."""
    try:
        # Basic validation.
        if not filesystem or not filesystem.strip():
            return {
                "success": False,
                "mounted": False,
                "error": "Filesystem is required",
            }

        if not user or not user.strip():
            return {
                "success": False,
                "mounted": False,
                "error": "User is required",
            }

        if not monitors or not monitors.strip():
            return {
                "success": False,
                "mounted": False,
                "error": "Monitors are required",
            }

        if not mount_point or not mount_point.strip():
            return {
                "success": False,
                "mounted": False,
                "error": "Mount point is required",
            }

        # The mount point must be an absolute path.
        if not mount_point.startswith("/"):
            return {
                "success": False,
                "mounted": False,
                "error": "Mount point must be an absolute path",
            }

        # Never allow mounting directly over /.
        if os.path.normpath(mount_point) == "/":
            return {
                "success": False,
                "mounted": False,
                "error": "Mount point cannot be /",
            }

        # Check the requested mount point, not the .env default.
        if is_mounted(mount_point):
            return {
                "success": True,
                "mounted": True,
                "mount_point": mount_point,
                "filesystem": filesystem,
                "user": user,
                "monitors": monitors,
                "message": "CephFS is already mounted",
            }

        result = subprocess.run(
            [
                "sudo",
                "-n",
                MOUNT_HELPER,
                filesystem,
                user,
                monitors,
                mount_point,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            error = result.stderr.strip() or "CephFS mount failed"

            log_activity(
                "MOUNT (CephFS)",
                mount_point,
                "error",
                error,
            )

            return {
                "success": False,
                "mounted": False,
                "mount_point": mount_point,
                "error": error,
            }

        # Do not trust the helper's exit code alone.
        if not is_mounted(mount_point):
            error = "Mount command succeeded but CephFS is not mounted"

            log_activity(
                "MOUNT (CephFS)",
                mount_point,
                "error",
                error,
            )

            return {
                "success": False,
                "mounted": False,
                "mount_point": mount_point,
                "error": error,
            }

        log_activity(
            "MOUNT (CephFS)",
            mount_point,
            "success",
            f"Mounted {filesystem}",
        )

        save_active_config(
            filesystem=filesystem,
            user=user,
            monitors=monitors,
            mount_point=mount_point,
        )

        return {
            "success": True,
            "mounted": True,
            "filesystem": filesystem,
            "user": user,
            "monitors": monitors,
            "mount_point": mount_point,
            "message": "CephFS mounted successfully",
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "mounted": False,
            "mount_point": mount_point,
            "error": "CephFS mount operation timed out",
        }

    except Exception as e:
        logger.exception("CephFS mount failed")

        return {
            "success": False,
            "mounted": False,
            "mount_point": mount_point,
            "error": str(e),
        }

def unmount_cephfs() -> Dict[str, Any]:
    """
    Unmount the currently active CephFS mount.

    The mount point comes from the persisted runtime
    configuration rather than from the client request.
    """
    mount_point = get_active_mount_point()

    if not mount_point:
        return {
            "success": False,
            "message": "No active CephFS mount point configured",
        }

    if not os.path.isabs(mount_point):
        return {
            "success": False,
            "message": "Invalid mount point",
        }

    if mount_point == "/":
        return {
            "success": False,
            "message": "Invalid mount point: /",
        }

    if not is_mounted(mount_point):
        return {
            "success": True,
            "message": "CephFS is already unmounted",
            "mount_point": mount_point,
        }

    try:
        result = subprocess.run(
            [
                "sudo",
                "-n",
                UNMOUNT_HELPER,
                mount_point,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        logger.error(
            "CephFS unmount timed out at %s",
            mount_point,
        )
        return {
            "success": False,
            "message": "CephFS unmount timed out",
            "mount_point": mount_point,
        }
    except Exception:
        logger.exception(
            "CephFS unmount failed at %s",
            mount_point,
        )
        return {
            "success": False,
            "message": "CephFS unmount failed",
            "mount_point": mount_point,
        }

    if result.returncode != 0:
        logger.error(
            "CephFS unmount helper failed: %s",
            result.stderr.strip(),
        )
        return {
            "success": False,
            "message": result.stderr.strip()
            or "CephFS unmount failed",
            "mount_point": mount_point,
        }

    if is_mounted(mount_point):
        logger.error(
            "CephFS unmount helper returned success but "
            "mount is still present at %s",
            mount_point,
        )
        return {
            "success": False,
            "message": "CephFS is still mounted",
            "mount_point": mount_point,
        }

    logger.info(
        "CephFS unmounted successfully at %s",
        mount_point,
    )

    return {
        "success": True,
        "message": "CephFS unmounted successfully",
        "mount_point": mount_point,
    }