"""
Ceph RGW multisite replication status.

Production-only implementation.
"""
import os
import re
import json
import shlex
import time
import subprocess
import threading
from typing import Dict, Any, Optional
from config.config import (
    REPLICATION_SECONDARY_HOST,
    REPLICATION_SECONDARY_USER,
    REPLICATION_SSH_CONNECT_TIMEOUT,
    REPLICATION_SSH_TIMEOUT,
    REPLICATION_SSH_SNAPSHOT_TIMEOUT,
    REPLICATION_CIRCUIT_BREAKER_COOLDOWN,
)
from core.logger import logger
from services.cluster.ceph_ops import run_ceph_cmd
from concurrent.futures import ThreadPoolExecutor, as_completed
 
REALM = "aikyastor"
SECONDARY_ZONE = "aikyastor-secondary"
PRIMARY_ZONE = "aikyastor-primary"
SYNC_USER = "aikyastor-sync"
PRIMARY_ENDPOINT = os.getenv("PRIMARY_RGW_ENDPOINT", "http://192.168.0.116:80")
SECONDARY_SSH_HOST = os.getenv("SECONDARY_SSH_HOST", "192.168.0.160")
SECONDARY_SSH_USER = os.getenv("SECONDARY_SSH_USER", "riya")
REPLICATION_CACHE_TTL = 15
_replication_cache = {
    "timestamp": 0,
    "data": None,
    "refreshing": False,
}
_replication_refresh_lock = threading.Lock()
 
 
# ─── Circuit breaker for the secondary SSH connection ────────────────────────
# Tracks only connectivity to the secondary host (SSH-level failures), not
# unrelated errors like a malformed command. Read/write under _breaker_lock.
_breaker_lock = threading.Lock()
_breaker_state = {
    "open_until": 0.0,   # monotonic time; calls are short-circuited until this
    "last_error": None,  # str | None, surfaced to callers while breaker is open
}
 
 
def _breaker_is_open() -> bool:
    with _breaker_lock:
        return time.monotonic() < _breaker_state["open_until"]
 
 
def _breaker_trip(error: str) -> None:
    with _breaker_lock:
        _breaker_state["open_until"] = time.monotonic() + REPLICATION_CIRCUIT_BREAKER_COOLDOWN
        _breaker_state["last_error"] = error
    logger.warning(
        "Replication circuit breaker OPEN for %ss: %s",
        REPLICATION_CIRCUIT_BREAKER_COOLDOWN,
        error,
    )
 
 
def _breaker_reset() -> None:
    with _breaker_lock:
        if _breaker_state["open_until"]:
            logger.info("Replication circuit breaker CLOSED (secondary reachable again)")
        _breaker_state["open_until"] = 0.0
        _breaker_state["last_error"] = None
 
 
def _breaker_seconds_remaining() -> float:
    with _breaker_lock:
        return max(0.0, _breaker_state["open_until"] - time.monotonic())
 
 
def _breaker_last_error() -> Optional[str]:
    with _breaker_lock:
        return _breaker_state["last_error"]
 
 
def reset_replication_circuit_breaker() -> Dict[str, Any]:
    """
    Manually clear the circuit breaker (e.g. a "Retry now" button after
    fixing the secondary connection), so the next call re-attempts SSH
    immediately instead of waiting out the cooldown.
    """
    _breaker_reset()
    return {"message": "Replication circuit breaker reset."}
 
 
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
    Get bucket statistics from the secondary Ceph cluster.
 
    Uses one SSH session for the bucket list and all bucket stats.
    """
    command = f"""
set -e
 
buckets=$(sudo radosgw-admin bucket list \
    --rgw-realm={shlex.quote(REALM)} \
    --rgw-zone={shlex.quote(SECONDARY_ZONE)} \
    --format=json)
 
echo "__BUCKET_LIST_START__"
printf '%s\\n' "$buckets"
echo "__BUCKET_LIST_END__"
 
for bucket in $(printf '%s' "$buckets" | python3 -c '
import sys, json
for b in json.load(sys.stdin):
    print(b)
'); do
 
    echo "__BUCKET_START__:$bucket"
 
    sudo radosgw-admin bucket stats \
        --bucket="$bucket" \
        --rgw-realm={shlex.quote(REALM)} \
        --rgw-zone={shlex.quote(SECONDARY_ZONE)} \
        --format=json
 
    printf '\n__BUCKET_END__\n'
done
"""
 
    output = _run_remote(
        host,
        user,
        command,
        timeout=REPLICATION_SSH_SNAPSHOT_TIMEOUT,
    )
 
    logger.info("SECONDARY RAW OUTPUT:\n%s", output,)
    logger.info(
        "Secondary replication snapshot returned %d bytes",
        len(output),
    )
 
    snapshot: Dict[str, Dict[str, int]] = {}
 
    current_bucket = None
    json_lines = []
 
    for line in output.splitlines():
        line = line.strip()
 
        if line.startswith("__BUCKET_START__:"):
            current_bucket = line.split(
                "__BUCKET_START__:",
                1,
            )[1].strip()
 
            json_lines = []
 
            logger.info(
                "PARSER: started bucket '%s'",
                current_bucket,
            )
 
            continue
 
        if "__BUCKET_END__" in line:
            before_marker = line.split(
                "__BUCKET_END__",
                1,
            )[0].strip()
 
            if before_marker:
                json_lines.append(before_marker)
 
            if current_bucket and json_lines:
                try:
                    stats = json.loads(
                        "\n".join(json_lines)
                    )
 
                    usage = (
                        stats
                        .get("usage", {})
                        .get("rgw.main", {})
                    )
 
                    snapshot[current_bucket] = {
                        "objects": int(
                            usage.get(
                                "num_objects",
                                0,
                            )
                        ),
                        "size": int(
                            usage.get(
                                "size",
                                0,
                            )
                        ),
                    }
 
                    logger.info(
                        "PARSER: parsed bucket '%s': objects=%d size=%d",
                        current_bucket,
                        snapshot[current_bucket]["objects"],
                        snapshot[current_bucket]["size"],
                    )
 
                except (json.JSONDecodeError, TypeError, ValueError) as exc:
                    logger.warning(
                        "Failed to parse secondary stats for '%s': %s",
                        current_bucket,
                        exc,
                    )
 
            current_bucket = None
            json_lines = []
            continue
 
        if current_bucket:
            json_lines.append(line)
 
    logger.info(
        "Secondary replication snapshot contains %d buckets",
        len(snapshot),
    )
 
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
    timeout: int = None,
    bypass_breaker: bool = False,
):
    """
    Execute a command on the secondary Ceph host.
 
    Protected by a circuit breaker: if a prior call recently failed to
    reach `host`, this raises immediately (using the last known error)
    instead of re-attempting a doomed SSH connection. Pass
    bypass_breaker=True for explicit user-triggered actions (e.g. a
    "test connection" / "retry now" button) where re-attempting even
    during the cooldown window is the whole point.
    """
 
    if timeout is None:
        timeout = REPLICATION_SSH_TIMEOUT
 
    if not bypass_breaker and _breaker_is_open():
        remaining = _breaker_seconds_remaining()
        raise RuntimeError(
            f"Secondary unreachable (retrying in {remaining:.0f}s): "
            f"{_breaker_last_error()}"
        )
 
    target = f"{user}@{host}"
 
    ssh_command = [
        "ssh",
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", f"ConnectTimeout={REPLICATION_SSH_CONNECT_TIMEOUT}",
        # Prevents ssh from blocking on an interactive password/passphrase
        # prompt if key auth isn't set up -- fail fast instead of hanging
        # until the outer subprocess timeout kills it.
        "-o", "PasswordAuthentication=no",
        "-o", "KbdInteractiveAuthentication=no",
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
            error = (
                result.stderr.strip()
                or f"Remote command failed with code {result.returncode}"
            )
            _breaker_trip(error)
            raise RuntimeError(error)
 
        _breaker_reset()
        return result.stdout.strip()
 
    except subprocess.TimeoutExpired:
        error = f"SSH command timed out after {timeout} seconds"
        _breaker_trip(error)
        raise RuntimeError(error)
 
    except FileNotFoundError:
        # ssh binary missing -- not a connectivity issue, don't trip the
        # breaker (retrying won't help, but it also isn't the secondary's
        # fault and shouldn't mask itself behind a cooldown message).
        raise RuntimeError("'ssh' executable not found on this host")
 
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
 
    On any failure to reach the secondary, returns quickly (bounded by
    REPLICATION_SSH_CONNECT_TIMEOUT / REPLICATION_SSH_TIMEOUT, or
    near-instantly if the circuit breaker is already open) with
    "enabled": False and a "reachable": False flag the frontend can use
    to distinguish "secondary is down" from "something else broke."
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
 
        try:
            sync_stdout = _run_remote(
                REPLICATION_SECONDARY_HOST,
                REPLICATION_SECONDARY_USER,
                sync_command,
            )
        except RuntimeError as e:
            # Secondary is unreachable/erroring -- this is an expected,
            # recoverable state (not a bug), so it gets its own clearly
            # distinguishable response rather than falling into the
            # generic except Exception handler below.
            logger.warning("get_replication_status: secondary unreachable: %s", e)
            return {
                "enabled": True,
                "reachable": False,
                "error": str(e),
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
                "sync": None,
            }
 
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
            "reachable": True,
 
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
            "reachable": False,
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
 
def _get_primary_bucket_snapshot() -> Dict[str, Dict[str, int]]:
    """
    Get bucket statistics from the primary Ceph cluster.
    """
 
    bucket_result = _run_rgw_admin(
        f"bucket list "
        f"--rgw-realm={REALM} "
        f"--rgw-zone={PRIMARY_ZONE}"
    )
 
    if not bucket_result:
        return {}
 
    def get_bucket_stats(bucket: str):
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
 
        return bucket, {
            "objects": int(
                usage.get("num_objects", 0)
            ),
            "size": int(
                usage.get("size", 0)
            ),
        }
 
    snapshot = {}
 
    with ThreadPoolExecutor(
        max_workers=min(4, len(bucket_result))
    ) as executor:
 
        futures = {
            executor.submit(
                get_bucket_stats,
                bucket
            ): bucket
            for bucket in bucket_result
        }
 
        for future in as_completed(futures):
            bucket = futures[future]
 
            try:
                name, stats = future.result()
                snapshot[name] = stats
 
            except Exception as exc:
                logger.warning(
                    "Failed to get stats for primary bucket '%s': %s",
                    bucket,
                    exc,
                )
 
    return snapshot
 
def _refresh_replication_cache():
    global _replication_cache
 
    try:
        logger.info("Refreshing replication bucket cache")
 
        # ---------------------------------------------------------
        # COLLECT PRIMARY + SECONDARY IN PARALLEL
        # ---------------------------------------------------------
 
        with ThreadPoolExecutor(max_workers=2) as executor:
 
            primary_future = executor.submit(
                _get_primary_bucket_snapshot
            )
 
            secondary_future = executor.submit(
                _get_remote_bucket_snapshot,
                SECONDARY_SSH_HOST,
                SECONDARY_SSH_USER,
            )
 
            # Primary is local (fast, no network dependency) -- fetch its
            # result first without letting a hung secondary hold it up.
            try:
                primary_buckets = primary_future.result()
            except Exception:
                logger.exception("Failed to snapshot primary buckets")
                primary_buckets = {}
 
            try:
                secondary_buckets = secondary_future.result()
            except Exception as exc:
                # Secondary being unreachable is expected/recoverable --
                # log at warning, not exception/error, and continue with
                # an empty secondary snapshot so the primary-side data
                # (which we DO have) still reaches the dashboard instead
                # of the whole refresh aborting.
                logger.warning(
                    "Failed to snapshot secondary buckets (%s@%s): %s",
                    SECONDARY_SSH_USER, SECONDARY_SSH_HOST, exc,
                )
                secondary_buckets = {}
                secondary_error = str(exc)
            else:
                secondary_error = None
 
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
                status = "missing_secondary" if secondary_error is None else "secondary_unreachable"
 
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
 
        result = {
            "status": "ready",
            "buckets": buckets,
            "secondary_host": SECONDARY_SSH_HOST,
            "secondary_zone": SECONDARY_ZONE,
            "secondary_reachable": secondary_error is None,
        }
 
        if secondary_error:
            result["secondary_error"] = secondary_error
 
        _replication_cache["data"] = result
        _replication_cache["timestamp"] = time.time()
 
        logger.info(
            "Replication bucket cache refreshed successfully"
        )
 
    except Exception:
        logger.exception(
            "Failed to refresh replication bucket cache"
        )
 
    finally:
        with _replication_refresh_lock:
            _replication_cache["refreshing"] = False
 
def get_replicated_buckets() -> Dict[str, Any]:
    """
    Returns cached primary/secondary bucket comparison data.
 
    Never blocks the calling request thread on network I/O:
      - Cache hit (fresh): returns immediately.
      - Cache hit (stale): returns the stale data immediately and kicks
        off a background refresh if one isn't already running.
      - Cache miss (first call ever): returns a "loading" placeholder
        immediately and kicks off a background refresh. The frontend
        should poll this endpoint again shortly (e.g. every 2-3s) until
        `status` is "ready".
    """
    global _replication_cache
 
    now = time.time()
    data = _replication_cache["data"]
    timestamp = _replication_cache["timestamp"]
 
    # ---------------------------------------------------------
    # CACHE HIT (fresh)
    # ---------------------------------------------------------
 
    if (
        data is not None
        and now - timestamp < REPLICATION_CACHE_TTL
    ):
        return data
 
    # ---------------------------------------------------------
    # CACHE EXPIRED OR MISSING — kick off a background refresh if one
    # isn't already in flight, and return without blocking either way.
    # ---------------------------------------------------------
 
    with _replication_refresh_lock:
        already_refreshing = _replication_cache["refreshing"]
        if not already_refreshing:
            _replication_cache["refreshing"] = True
 
    if not already_refreshing:
        thread = threading.Thread(
            target=_refresh_replication_cache,
            daemon=True,
        )
        thread.start()
 
    if data is not None:
        # Stale-but-known data: serve it immediately so the dashboard has
        # something to show while the background refresh runs.
        return data
 
    # First request ever (no cache yet): return a lightweight placeholder
    # instead of blocking. If the circuit breaker is currently open we can
    # say so immediately without waiting on the background thread at all.
    placeholder = {
        "status": "loading",
        "buckets": [],
        "secondary_host": SECONDARY_SSH_HOST,
        "secondary_zone": SECONDARY_ZONE,
    }
 
    if _breaker_is_open():
        placeholder["secondary_reachable"] = False
        placeholder["secondary_error"] = _breaker_last_error()
        placeholder["retry_in_seconds"] = round(_breaker_seconds_remaining(), 1)
 
    return placeholder
 
def configure_replication(
    secondary_zone: str,
    secondary_endpoint: str,
    read_only: bool = False,
) -> Dict[str, Any]:
    """
    Modify the existing secondary RGW zone, verify the resulting
    zonegroup configuration, and commit the updated multisite period.
 
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
            f"--endpoints={shlex.quote(secondary_endpoint)} "
            f"--read-only={read_only_value}"
        )
 
        # ---------------------------------------------------------
        # 3. Verify the configuration in the zonegroup
        # ---------------------------------------------------------
 
        zonegroup = _run_rgw_admin(
            f"zonegroup get "
            f"--rgw-realm={REALM} "
            f"--rgw-zonegroup={PRIMARY_ZONE} "
            f"--format=json"
        )
 
        configured_zone = next(
            (
                z
                for z in zonegroup.get("zones", [])
                if z.get("name") == secondary_zone
            ),
            None,
        )
 
        if configured_zone is None:
            raise RuntimeError(
                f"Zone '{secondary_zone}' was not found "
                "in the primary zonegroup after configuration"
            )
 
        configured_endpoints = configured_zone.get(
            "endpoints",
            [],
        )
 
        configured_read_only = configured_zone.get(
            "read_only"
        )
 
        expected_endpoints = [secondary_endpoint]
 
        # Ceph may represent read_only as a boolean or string
        configured_read_only_bool = (
            configured_read_only is True
            or str(configured_read_only).lower() == "true"
        )
 
        if configured_endpoints != expected_endpoints:
            raise RuntimeError(
                "Secondary endpoint was not applied correctly. "
                f"Expected {expected_endpoints}, "
                f"got {configured_endpoints}"
            )
 
        if configured_read_only_bool != read_only:
            raise RuntimeError(
                "Secondary read-only setting was not applied correctly. "
                f"Expected {read_only}, "
                f"got {configured_read_only}"
            )
 
        logger.info(
            "Replication configuration verified: "
            "zone=%s endpoint=%s read_only=%s",
            secondary_zone,
            secondary_endpoint,
            read_only,
        )
 
        # ---------------------------------------------------------
        # 4. Commit the new multisite period
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
        # 5. Return verified configuration
        # ---------------------------------------------------------
 
        return {
            "success": True,
            "message": "Replication configuration applied successfully.",
            "zone": configured_zone,
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
 
    # Provisioning is an explicit, user-initiated action (not a background
    # poll), so it's fine -- and desirable -- for it to bypass the circuit
    # breaker and attempt the connection regardless of recent failures.
    _run_remote(
        secondary_host,
        secondary_user,
        realm_pull,
        timeout=REPLICATION_SSH_SNAPSHOT_TIMEOUT,
        bypass_breaker=True,
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
        timeout=REPLICATION_SSH_SNAPSHOT_TIMEOUT,
        bypass_breaker=True,
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
        timeout=REPLICATION_SSH_SNAPSHOT_TIMEOUT,
        bypass_breaker=True,
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