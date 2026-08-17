"""
Ceph RGW multisite replication status.

Production-only implementation.
"""
import re
import json
import shlex
import subprocess
from typing import Dict, Any

from core.logger import logger
from services.cluster.ceph_ops import run_ceph_cmd

REALM = "aikyastor"
SECONDARY_ZONE = "aikyastor-secondary"
PRIMARY_ZONE = "aikyastor-primary"
SYNC_USER = "aikyastor-sync"
PRIMARY_ENDPOINT = "http://192.168.56.110:80"

def _get_sync_user():
    """
    Get the RGW system user used for multisite synchronization.
    """

    return _run_rgw_admin(
        f"user info --uid={SYNC_USER}"
    )


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

    metadata_caught_up = "metadata is caught up with master" in text
    data_caught_up = "data is caught up with source" in text

    return {
        "metadata": {
            "status": "caught_up" if metadata_caught_up else "syncing"
        },
        "data": {
            "status": "caught_up" if data_caught_up else "syncing"
        }
    }

def get_replication_status() -> Dict[str, Any]:
    """
    Return the current Ceph RGW multisite configuration and sync state.
    """

    try:
        realm = _run_rgw_admin(
            f"realm get --rgw-realm={REALM}"
        )

        zonegroup = _run_rgw_admin(
            f"zonegroup get "
            f"--rgw-zonegroup=aikyastor-primary "
            f"--rgw-realm={REALM}"
        )

        sync_stdout, sync_stderr, sync_code = run_ceph_cmd(
            f"radosgw-admin sync status "
            f"--rgw-realm={REALM} "
            f"--rgw-zone={SECONDARY_ZONE}"
        )

        if sync_code != 0:
            raise RuntimeError(
                sync_stderr or "Failed to retrieve RGW sync status"
            )

        sync = _parse_sync_status(sync_stdout)

        zones = zonegroup.get("zones", [])

        primary = next(
            (
                z for z in zones
                if z.get("name") == "aikyastor-primary"
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

def get_replicated_buckets() -> Dict[str, Any]:
    """
    Return buckets in the primary RGW zone.

    These are the buckets participating in the multisite
    configuration. Actual replication health is reported
    separately through sync status.
    """

    try:
        result = _run_rgw_admin(
            f"bucket list "
            f"--rgw-realm={REALM} "
            f"--rgw-zone=aikyastor-primary"
        )

        buckets = []

        for bucket in result:
            try:
                stats = _run_rgw_admin(
                    f"bucket stats "
                    f"--bucket={bucket} "
                    f"--rgw-realm={REALM} "
                    f"--rgw-zone=aikyastor-primary"
                )

                usage = (
                    stats
                    .get("usage", {})
                    .get("rgw.main", {})
                )

                buckets.append({
                    "name": bucket,
                    "objects": usage.get("num_objects", 0),
                    "size": usage.get("size", 0),
                    "status": "replicating",
                })

            except Exception:
                buckets.append({
                    "name": bucket,
                    "objects": 0,
                    "size": 0,
                    "status": "unknown",
                })

        return {
            "buckets": buckets
        }

    except Exception as e:
        logger.exception("get_replicated_buckets error")
        return {
            "buckets": [],
            "error": str(e)
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