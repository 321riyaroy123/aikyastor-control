"""
Ceph RGW multisite replication status.

Production-only implementation.
"""
import os
import re
import json
import shlex
import subprocess
from typing import Dict, Any
from config.config import (
    REPLICATION_SECONDARY_HOST,
    REPLICATION_SECONDARY_USER,
)
from core.logger import logger
from services.cluster.ceph_ops import run_ceph_cmd

REALM = "aikyastor"
SECONDARY_ZONE = "aikyastor-secondary"
PRIMARY_ZONE = "aikyastor-primary"
SYNC_USER = "aikyastor-sync"
PRIMARY_ENDPOINT = os.getenv(
    "PRIMARY_RGW_ENDPOINT",
    "http://192.168.0.116:80"
)
SECONDARY_SSH_HOST = os.getenv(
    "SECONDARY_SSH_HOST",
    "192.168.0.160"
)

SECONDARY_SSH_USER = os.getenv(
    "SECONDARY_SSH_USER",
    "riya"
)

def _get_sync_user():
    """
    Get the RGW system user used for multisite synchronization.
    """

    return _run_rgw_admin(
        f"user info --uid={SYNC_USER}"
    )

def _get_remote_bucket_snapshot(
    host: str,
    user: str,
) -> Dict[str, Dict[str, int]]:
    """
    Get bucket statistics directly from the secondary Ceph cluster.

    This is intentionally administrative rather than S3-user based,
    so bucket visibility is not limited by the credentials of a
    particular S3 user.
    """

    bucket_list_command = (
        "sudo radosgw-admin bucket list "
        f"--rgw-realm={shlex.quote(REALM)} "
        f"--rgw-zone={shlex.quote(SECONDARY_ZONE)} "
        "--format=json"
    )

    output = _run_remote(
        host,
        user,
        bucket_list_command,
    )

    buckets = json.loads(output or "[]")

    snapshot = {}

    for bucket in buckets:
        stats_command = (
            "sudo radosgw-admin bucket stats "
            f"--bucket={shlex.quote(bucket)} "
            f"--rgw-realm={shlex.quote(REALM)} "
            f"--rgw-zone={shlex.quote(SECONDARY_ZONE)} "
            "--format=json"
        )

        stats_output = _run_remote(
            host,
            user,
            stats_command,
        )

        stats = json.loads(stats_output or "{}")

        usage = (
            stats
            .get("usage", {})
            .get("rgw.main", {})
        )

        snapshot[bucket] = {
            "objects": int(
                usage.get("num_objects", 0)
            ),
            "size": int(
                usage.get("size", 0)
            ),
        }

    return snapshot

def _ensure_sync_user():
    """
    Ensure the multisite synchronization system user exists.
    """

    try:
        user = _get_sync_user()

        keys = user.get("keys", [])

        if not keys:
            raise RuntimeError(
                f"Sync user '{SYNC_USER}' exists but has no access keys"
            )

        return {
            "access_key": keys[0].get("access_key"),
            "secret_key": keys[0].get("secret_key"),
        }

    except Exception:
        logger.info(
            "Creating RGW multisite sync user '%s'",
            SYNC_USER
        )

        user = _run_rgw_admin(
            f"user create "
            f"--uid={SYNC_USER} "
            f"--display-name='AiKyaStor Multisite Sync User' "
            f"--system"
        )

        keys = user.get("keys", [])

        if not keys:
            raise RuntimeError(
                "Failed to create multisite sync user"
            )

        return {
            "access_key": keys[0].get("access_key"),
            "secret_key": keys[0].get("secret_key"),
        }

def _zone_exists(zone_name: str) -> bool:
    try:
        _run_rgw_admin(
            f"zone get "
            f"--rgw-realm={REALM} "
            f"--rgw-zone={zone_name}"
        )
        return True
    except Exception:
        return False

def _run_remote(
    host: str,
    user: str,
    command: str,
    timeout: int = 120,
):
    """
    Execute a command on the secondary Ceph host.
    """

    target = f"{user}@{host}"

    ssh_command = [
        "ssh",
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        target,
        command,
    ]

    try:
        result = subprocess.run(
            ssh_command,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        if result.returncode != 0:
            raise RuntimeError(
                result.stderr.strip()
                or f"Remote command failed with code {result.returncode}"
            )

        return result.stdout.strip()

    except subprocess.TimeoutExpired:
        raise RuntimeError(
            f"SSH command timed out after {timeout} seconds"
        )

def _run_rgw_admin(args: str):
    """Run radosgw-admin and return parsed JSON."""
    cmd = f"radosgw-admin {args} --format=json"

    stdout, stderr, code = run_ceph_cmd(cmd)

    if code != 0:
        raise RuntimeError(stderr or "radosgw-admin command failed")

    if not stdout:
        return {}

    return json.loads(stdout)

def _parse_sync_status(output: str) -> Dict[str, Any]:
    text = output.lower()

    if "metadata is caught up with master" in text:
        metadata_status = "caught_up"
    elif "metadata sync syncing" in text:
        metadata_status = "syncing"
    else:
        metadata_status = "unknown"

    if "data is caught up with source" in text:
        data_status = "caught_up"
    elif "data sync" in text and "syncing" in text:
        data_status = "syncing"
    else:
        data_status = "unknown"

    return {
        "metadata": {
            "status": metadata_status
        },
        "data": {
            "status": data_status
        }
    }

def get_replication_status() -> Dict[str, Any]:
    """
    Return the current Ceph RGW multisite configuration
    and sync state.
    """

    try:
        realm = _run_rgw_admin(
            f"realm get --rgw-realm={REALM}"
        )

        zonegroup = _run_rgw_admin(
            f"zonegroup get "
            f"--rgw-zonegroup={PRIMARY_ZONE} "
            f"--rgw-realm={REALM}"
        )

        # ---------------------------------------------------------
        # Sync status belongs to the secondary cluster.
        # Query it remotely instead of asking the primary cluster.
        # ---------------------------------------------------------

        if not REPLICATION_SECONDARY_HOST:
            raise RuntimeError(
                "Secondary host is not configured"
            )

        if not REPLICATION_SECONDARY_USER:
            raise RuntimeError(
                "Secondary SSH user is not configured"
            )

        sync_command = (
            "sudo radosgw-admin sync status "
            f"--rgw-realm={shlex.quote(REALM)} "
            f"--rgw-zone={shlex.quote(SECONDARY_ZONE)}"
        )

        sync_stdout = _run_remote(
            REPLICATION_SECONDARY_HOST,
            REPLICATION_SECONDARY_USER,
            sync_command,
        )

        sync = _parse_sync_status(sync_stdout)

        zones = zonegroup.get("zones", [])

        primary = next(
            (
                z for z in zones
                if z.get("name") == PRIMARY_ZONE
            ),
            {}
        )

        secondary = next(
            (
                z for z in zones
                if z.get("name") == SECONDARY_ZONE
            ),
            {}
        )

        return {
            "enabled": True,

            "realm": {
                "name": realm.get("name", REALM),
                "id": realm.get("id"),
                "epoch": realm.get("epoch"),
            },

            "zonegroup": {
                "name": zonegroup.get("name"),
                "id": zonegroup.get("id"),
                "master_zone": zonegroup.get("master_zone"),
            },

            "primary": {
                "name": primary.get("name"),
                "id": primary.get("id"),
                "endpoints": primary.get("endpoints", []),
                "role": "primary",
                "status": "active",
            },

            "secondary": {
                "name": secondary.get("name"),
                "id": secondary.get("id"),
                "endpoints": secondary.get("endpoints", []),
                "role": "secondary",
                "status": "active",
            },

            "sync": sync,
        }

    except Exception as e:
        logger.exception("get_replication_status error")

        return {
            "enabled": False,
            "error": str(e)
        }

def _get_secondary_s3_snapshot(endpoint: str) -> Dict[str, Dict[str, int]]:
    """
    Read the secondary RGW through its S3 endpoint.

    The sync system user's credentials are used because that user is
    replicated as RGW metadata to the secondary zone. This makes the
    verification S3-facing instead of inspecting the primary cluster's
    local RGW pools.
    """
    try:
        import boto3
        from botocore.client import Config as BotoConfig

        sync_user = _get_sync_user()
        keys = sync_user.get("keys", [])

        if not keys:
            raise RuntimeError(
                f"Sync user '{SYNC_USER}' has no access keys"
            )

        access_key = keys[0].get("access_key")
        secret_key = keys[0].get("secret_key")

        if not access_key or not secret_key:
            raise RuntimeError(
                f"Sync user '{SYNC_USER}' has incomplete credentials"
            )

        s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="us-east-1",
            config=BotoConfig(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            ),
        )

        response = s3.list_buckets()
        snapshots: Dict[str, Dict[str, int]] = {}

        for bucket_info in response.get("Buckets", []):
            bucket_name = bucket_info["Name"]
            object_count = 0
            total_size = 0

            paginator = s3.get_paginator("list_objects_v2")

            for page in paginator.paginate(Bucket=bucket_name):
                for obj in page.get("Contents", []):
                    object_count += 1
                    total_size += int(obj.get("Size", 0))

            snapshots[bucket_name] = {
                "objects": object_count,
                "size": total_size,
            }

        return snapshots

    except Exception as e:
        raise RuntimeError(
            f"Unable to verify secondary RGW through S3 endpoint '{endpoint}': {e}"
        ) from e

def get_replicated_buckets() -> Dict[str, Any]:
    """
    Compare bucket state between the Rocky primary and
    Ubuntu secondary.

    Primary:
        radosgw-admin on Rocky

    Secondary:
        radosgw-admin executed remotely on Ubuntu

    Verification is independent of S3 user visibility.
    """

    try:
        # ---------------------------------------------------------
        # PRIMARY
        # ---------------------------------------------------------

        primary_result = _run_rgw_admin(
            f"bucket list "
            f"--rgw-realm={REALM} "
            f"--rgw-zone={PRIMARY_ZONE}"
        )

        primary_buckets = {}

        for bucket in primary_result:
            stats = _run_rgw_admin(
                f"bucket stats "
                f"--bucket={shlex.quote(bucket)} "
                f"--rgw-realm={REALM} "
                f"--rgw-zone={PRIMARY_ZONE}"
            )

            usage = (
                stats
                .get("usage", {})
                .get("rgw.main", {})
            )

            primary_buckets[bucket] = {
                "objects": int(
                    usage.get("num_objects", 0)
                ),
                "size": int(
                    usage.get("size", 0)
                ),
            }

        # ---------------------------------------------------------
        # SECONDARY
        # ---------------------------------------------------------

        secondary_buckets = _get_remote_bucket_snapshot(
            SECONDARY_SSH_HOST,
            SECONDARY_SSH_USER,
        )

        # ---------------------------------------------------------
        # COMPARE
        # ---------------------------------------------------------

        all_bucket_names = sorted(
            set(primary_buckets) |
            set(secondary_buckets)
        )

        buckets = []

        for name in all_bucket_names:

            primary = primary_buckets.get(name)
            secondary = secondary_buckets.get(name)

            primary_objects = (
                primary["objects"]
                if primary
                else 0
            )

            primary_size = (
                primary["size"]
                if primary
                else 0
            )

            secondary_objects = (
                secondary["objects"]
                if secondary
                else 0
            )

            secondary_size = (
                secondary["size"]
                if secondary
                else 0
            )

            if not primary:
                status = "secondary_only"

            elif not secondary:
                status = "missing_secondary"

            elif (
                primary_objects == secondary_objects
                and primary_size == secondary_size
            ):
                status = "replicated"

            else:
                status = "mismatch"

            buckets.append({
                "name": name,

                "objects": primary_objects,
                "size": primary_size,

                "secondary_objects": secondary_objects,
                "secondary_size": secondary_size,

                "status": status,
            })

        return {
            "buckets": buckets,
            "secondary_host": SECONDARY_SSH_HOST,
            "secondary_zone": SECONDARY_ZONE,
        }

    except Exception as e:
        logger.exception(
            "get_replicated_buckets error"
        )

        return {
            "buckets": [],
            "error": str(e),
        }

def configure_replication(
    secondary_zone: str,
    secondary_endpoint: str,
    read_only: bool = False,
) -> Dict[str, Any]:
    """
    Modify the existing secondary RGW zone and commit
    the updated multisite period.

    Production-only implementation.
    """

    try:
        if not secondary_zone:
            raise ValueError("Secondary zone name is required")

        if not secondary_endpoint:
            raise ValueError("Secondary endpoint is required")

        # ---------------------------------------------------------
        # 1. Verify the zone exists
        # ---------------------------------------------------------

        zone = _run_rgw_admin(
            f"zone get "
            f"--rgw-realm={REALM} "
            f"--rgw-zone={secondary_zone}"
        )

        if not zone.get("id"):
            raise RuntimeError(
                f"Secondary zone '{secondary_zone}' does not exist"
            )

        # ---------------------------------------------------------
        # 2. Modify endpoint and read-only state
        # ---------------------------------------------------------

        read_only_value = "true" if read_only else "false"

        _run_rgw_admin(
            f"zone modify "
            f"--rgw-realm={REALM} "
            f"--rgw-zone={secondary_zone} "
            f"--endpoints={secondary_endpoint} "
            f"--read-only={read_only_value}"
        )

        # ---------------------------------------------------------
        # 3. Commit the new multisite period
        # ---------------------------------------------------------

        stdout, stderr, code = run_ceph_cmd(
            f"radosgw-admin period update "
            f"--rgw-realm={REALM} "
            f"--commit"
        )

        if code != 0:
            raise RuntimeError(
                stderr or "Failed to commit RGW multisite period"
            )

        # ---------------------------------------------------------
        # 4. Return fresh configuration
        # ---------------------------------------------------------

        return {
            "success": True,
            "message": "Replication configuration applied successfully.",
            "zone": _run_rgw_admin(
                f"zone get "
                f"--rgw-realm={REALM} "
                f"--rgw-zone={secondary_zone}"
            ),
        }

    except Exception as e:
        logger.exception("configure_replication error")

        return {
            "success": False,
            "error": str(e),
        }

def provision_secondary_zone(
    secondary_zone: str,
    secondary_endpoint: str,
    read_only: bool = False,
):
    """
    Configure an existing Ceph cluster as a secondary RGW zone.

    This function performs the primary-side configuration.
    Remote secondary-cluster initialization is handled separately.
    """

    if not secondary_zone:
        raise ValueError("Secondary zone name is required")

    if not secondary_endpoint:
        raise ValueError("Secondary endpoint is required")

    sync_user = _ensure_sync_user()

    # ---------------------------------------------------------
    # Create the zone if it does not already exist
    # ---------------------------------------------------------

    if not _zone_exists(secondary_zone):

        _run_rgw_admin(
            f"zone create "
            f"--rgw-zone={secondary_zone} "
            f"--rgw-zonegroup={PRIMARY_ZONE} "
            f"--rgw-realm={REALM} "
            f"--endpoints={secondary_endpoint}"
        )

    else:

        _run_rgw_admin(
            f"zone modify "
            f"--rgw-zone={secondary_zone} "
            f"--rgw-realm={REALM} "
            f"--endpoints={secondary_endpoint} "
            f"--read-only={'true' if read_only else 'false'}"
        )

    # ---------------------------------------------------------
    # Add the zone to the zonegroup
    # ---------------------------------------------------------

    zonegroup = _run_rgw_admin(
        f"zonegroup get "
        f"--rgw-zonegroup={PRIMARY_ZONE} "
        f"--rgw-realm={REALM}"
    )

    zone_ids = [
        z.get("id")
        for z in zonegroup.get("zones", [])
    ]

    zone = _run_rgw_admin(
        f"zone get "
        f"--rgw-zone={secondary_zone} "
        f"--rgw-realm={REALM}"
    )

    if zone.get("id") not in zone_ids:

        stdout, stderr, code = run_ceph_cmd(
            f"radosgw-admin zonegroup add "
            f"--rgw-zonegroup={PRIMARY_ZONE} "
            f"--rgw-zone={secondary_zone} "
            f"--rgw-realm={REALM}"
        )

        if code != 0:
            raise RuntimeError(
                stderr or "Failed to add secondary zone"
            )

    # ---------------------------------------------------------
    # Commit the period
    # ---------------------------------------------------------

    stdout, stderr, code = run_ceph_cmd(
        f"radosgw-admin period update "
        f"--rgw-realm={REALM} "
        f"--commit"
    )

    if code != 0:
        raise RuntimeError(
            stderr or "Failed to commit multisite period"
        )

    return {
        "zone": secondary_zone,
        "endpoint": secondary_endpoint,
        "read_only": read_only,
    }

def provision_secondary(
    secondary_host: str,
    secondary_user: str,
    secondary_zone: str,
    secondary_endpoint: str,
    secondary_port: int = 7480,
    read_only: bool = False,
):
    """
    Provision the remote Ceph cluster as the RGW secondary.
    """

    if not secondary_host:
        raise ValueError("Secondary host is required")

    if not secondary_user:
        raise ValueError("Secondary SSH user is required")

    if not secondary_zone:
        raise ValueError("Secondary zone is required")

    # ---------------------------------------------------------
    # Primary-side configuration
    # ---------------------------------------------------------

    sync_user = _ensure_sync_user()

    primary_config = provision_secondary_zone(
        secondary_zone=secondary_zone,
        secondary_endpoint=secondary_endpoint,
        read_only=read_only,
    )

    access_key = sync_user["access_key"]
    secret_key = sync_user["secret_key"]

    # ---------------------------------------------------------
    # Pull realm onto secondary
    # ---------------------------------------------------------

    realm_pull = (
        "sudo radosgw-admin realm pull "
        f"--url={shlex.quote(PRIMARY_ENDPOINT)} "
        f"--access-key={shlex.quote(access_key)} "
        f"--secret={shlex.quote(secret_key)} "
        f"--rgw-realm={shlex.quote(REALM)} "
        "--default"
    )

    _run_remote(
        secondary_host,
        secondary_user,
        realm_pull,
    )

    # ---------------------------------------------------------
    # Configure the secondary zone as default
    # ---------------------------------------------------------

    _run_remote(
        secondary_host,
        secondary_user,
        (
            "sudo -n ceph orch apply rgw "
            f"{shlex.quote(secondary_zone)} "
            f"--realm {shlex.quote(REALM)} "
            f"--zonegroup {shlex.quote(PRIMARY_ZONE)} "
            f"--zone {shlex.quote(secondary_zone)} "
            f"--port {int(secondary_port)}"
        ),
    )

    # ---------------------------------------------------------
    # Configure RGW daemon
    # ---------------------------------------------------------

    _run_remote(
        secondary_host,
        secondary_user,
        (
            "sudo ceph orch apply rgw "
            f"{shlex.quote(REALM)} "
            f"--placement=1 "
            f"--port={int(secondary_port)}"
        ),
    )

    return {
        "success": True,
        "message": (
            f"Secondary zone '{secondary_zone}' "
            "provisioned successfully."
        ),
        "zone": secondary_zone,
        "endpoint": secondary_endpoint,
    }