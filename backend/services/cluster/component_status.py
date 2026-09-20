import json
import os
import shutil
import subprocess

import boto3
from botocore.config import Config as BotoConfig

import config.config as config
from services.cluster.ceph_ops import run_ceph_cmd


def get_rgw_status():
    """
    Verify that the configured RGW/S3 endpoint is actually reachable.
    """

    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=config.CEPH_RGW_ENDPOINT,
            aws_access_key_id=config.CEPH_ACCESS_KEY,
            aws_secret_access_key=config.CEPH_SECRET_KEY,
            region_name=config.CEPH_REGION,
            config=BotoConfig(
                connect_timeout=3,
                read_timeout=5,
                retries={"max_attempts": 1},
            ),
        )

        # Actual S3/RGW request.
        s3.list_buckets()

        return {
            "name": "RGW / S3",
            "type": "Object",
            "status": "Active",
            "details": config.CEPH_RGW_ENDPOINT,
            "healthy": True,
        }

    except Exception as e:
        return {
            "name": "RGW / S3",
            "type": "Object",
            "status": "Unavailable",
            "details": str(e),
            "healthy": False,
        }


def get_rbd_status():
    """Check that the configured RBD pool actually exists."""

    pool = config.RBD_POOL

    try:
        stdout, stderr, code = run_ceph_cmd(
            "ceph osd pool ls"
        )

        if code != 0:
            return {
                "name": "RBD Pool",
                "type": "Block",
                "status": "Unavailable",
                "details": stderr.strip(),
                "healthy": False,
            }

        pools = [
            line.strip()
            for line in stdout.splitlines()
            if line.strip()
        ]

        if pool in pools:
            return {
                "name": "RBD Pool",
                "type": "Block",
                "status": "Active",
                "details": f"pool: {pool}",
                "healthy": True,
            }

        return {
            "name": "RBD Pool",
            "type": "Block",
            "status": "Not Found",
            "details": f"pool: {pool}",
            "healthy": False,
        }

    except Exception as e:
        return {
            "name": "RBD Pool",
            "type": "Block",
            "status": "Unavailable",
            "details": str(e),
            "healthy": False,
        }


def get_cephfs_status():
    """Check both CephFS existence and the local mount."""

    mount = config.CEPHFS_MOUNT
    filesystem = config.CEPHFS_NAME

    try:
        stdout, stderr, code = run_ceph_cmd(
            "ceph fs status --format json"
        )

        if code != 0:
            return {
                "name": "CephFS",
                "type": "File",
                "status": "Unavailable",
                "details": stderr.strip(),
                "healthy": False,
            }

        mounted = subprocess.run(
            ["mountpoint", "-q", mount],
            timeout=3,
        ).returncode == 0

        if mounted:
            return {
                "name": "CephFS",
                "type": "File",
                "status": "Mounted",
                "details": mount,
                "filesystem": filesystem,
                "healthy": True,
            }

        return {
            "name": "CephFS",
            "type": "File",
            "status": "Not Mounted",
            "details": mount,
            "filesystem": filesystem,
            "healthy": False,
        }

    except Exception as e:
        return {
            "name": "CephFS",
            "type": "File",
            "status": "Unavailable",
            "details": str(e),
            "healthy": False,
        }


def get_vault_disk_status():
    """Check the configured local vault filesystem."""

    path = config.VAULT_PATH

    try:
        if not os.path.exists(path):
            return {
                "name": "Vault Disk",
                "type": "Backup",
                "status": "Unavailable",
                "details": path,
                "healthy": False,
            }

        usage = shutil.disk_usage(path)

        free_gb = usage.free / (1024 ** 3)
        total_gb = usage.total / (1024 ** 3)

        return {
            "name": "Vault Disk",
            "type": "Backup",
            "status": "Available",
            "details": (
                f"{path} · "
                f"{free_gb:.1f} GB free / "
                f"{total_gb:.1f} GB"
            ),
            "free_bytes": usage.free,
            "total_bytes": usage.total,
            "healthy": True,
        }

    except Exception as e:
        return {
            "name": "Vault Disk",
            "type": "Backup",
            "status": "Unavailable",
            "details": str(e),
            "healthy": False,
        }


def get_component_status():
    return {
        "components": [
            get_rgw_status(),
            get_rbd_status(),
            get_cephfs_status(),
            get_vault_disk_status(),
        ]
    }