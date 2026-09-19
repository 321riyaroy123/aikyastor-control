"""
services/cluster/metrics_service.py - Dashboard aggregate metrics

New module, same layer as ceph_ops.py. Owns everything the redesigned
Dashboard/Overview page needs that ceph_ops.py doesn't already provide:
parsed/prioritized health, cluster services (MON/MGR/OSD/MDS/RGW),
OSD utilization, pool stats, cluster I/O, and (later phase) Prometheus.

Reuses ceph_ops.run_ceph_cmd() for all subprocess execution — no new
subprocess wrapper is introduced, matching the existing pattern.

Every get_* function here is independently failure-tolerant: a failing
`ceph` subcommand returns a dict with "available": False and an "error"
string rather than raising, so one bad command can never take down the
whole /api/dashboard aggregate response. This is deliberate — the
project's history includes several HTTP-200-with-silently-empty-payload
bugs, and the fix pattern adopted here is to make failure VISIBLE in the
JSON (available=False + error message) rather than returning an
indistinguishable empty/zeroed success shape.

PHASE 5 STATUS: get_health_summary(), get_capacity_summary(),
get_cluster_services(), get_mds_status(), get_osd_utilization(), and
get_pool_stats() are wired into /api/dashboard (see routes/cluster_routes.py).
PHASE 7 adds get_cluster_io() (instantaneous reading) and
get_cluster_io_history() (server-side ring buffer, filled by a background
sampler thread — see start_io_history_sampler(), called once from app.py
at startup, not per-request). Prometheus integration has no scaffold yet
(no Prometheus instance exists for this cluster) — not started.
"""

import json
from datetime import datetime, timezone
from typing import Dict, Any, List
import time
from core.logger import logger
from services.cluster.ceph_ops import run_ceph_cmd
from services.object.object_storage import get_s3_client
from services.block.block_storage import list_rbd_images
from services.file.cephfs_mount import get_active_mount_point, is_mounted
from services.vault.vault_ops import get_vault_status
from services.monitoring.prometheus_service import (
    query,
    query_range,
    PrometheusError,
)

# ─── Shared: single `ceph -s` fetch, parsed once per call ───────────────────
# Real output shape verified against Ceph Squid 19.2.5 on 2026-09-16:
#   top-level keys: fsid, health, election_epoch, quorum, quorum_names,
#   quorum_age, monmap, osdmap, pgmap, mgrmap, (fsmap/servicemap present
#   when CephFS/RGW are deployed, not verified structurally here since
#   Phase 1 doesn't need them).

def _get_ceph_status_raw() -> Dict[str, Any]:
    """
    Fetch and JSON-parse `ceph -s --format json` once.
    Returns {} on any failure — callers must treat that as "unavailable"
    and populate available=False rather than crash on missing keys.
    """
    stdout, stderr, code = run_ceph_cmd("ceph -s --format json")
    if code != 0 or not stdout:
        logger.error(f"ceph -s failed: {stderr}")
        return {}
    try:
        return json.loads(stdout)
    except json.JSONDecodeError as e:
        logger.error(f"ceph -s returned invalid JSON: {e}")
        return {}


# ─── Health summary (Phase 1) ────────────────────────────────────────────────

# Ordering used to pick the "most important" issue(s) for the collapsed
# banner view. HEALTH_ERR-severity checks sort before HEALTH_WARN.
_SEVERITY_RANK = {"HEALTH_ERR": 0, "HEALTH_WARN": 1}


def get_health_summary() -> Dict[str, Any]:
    """
    Parsed, prioritized cluster health for the Level-1 health banner and
    the expandable "View all issues" panel.

    Real shape this parses (verified against live cluster):
        status.health.checks.<CHECK_CODE> = {
            "severity": "HEALTH_WARN" | "HEALTH_ERR",
            "summary": {"message": str, "count": int},
            "muted": bool
        }
    `ceph health` (used by the existing ceph_ops.get_cluster_health) returns
    the identical checks shape, so this function is the richer superset —
    it additionally derives the top issue and a sorted, badge-ready list.

    Returns:
        {
            "available": bool,
            "status": "HEALTH_OK" | "HEALTH_WARN" | "HEALTH_ERR" | "UNKNOWN",
            "issue_count": int,
            "top_issue": {"code": str, "severity": str, "message": str, "count": int} | None,
            "issues": [ {code, severity, message, count, muted}, ... ]  # sorted, severest first
        }
    """
    raw = _get_ceph_status_raw()
    if not raw:
        return {
            "available": False,
            "status": "UNKNOWN",
            "issue_count": 0,
            "top_issue": None,
            "issues": [],
            "error": "ceph -s unavailable or returned invalid JSON",
        }

    health = raw.get("health", {})
    status = health.get("status", "UNKNOWN")
    checks = health.get("checks", {}) or {}

    issues: List[Dict[str, Any]] = []
    for code, check in checks.items():
        summary = check.get("summary", {}) or {}
        issues.append({
            "code": code,
            "severity": check.get("severity", "HEALTH_WARN"),
            "message": summary.get("message", code),
            "count": summary.get("count", 0),
            "muted": check.get("muted", False),
        })

    # Severest first, then by count descending, so the banner's "top issue"
    # is genuinely the most urgent one rather than dict-iteration order
    # (which ceph does not guarantee).
    issues.sort(key=lambda i: (_SEVERITY_RANK.get(i["severity"], 2), -i["count"]))

    top_issue = issues[0] if issues else None

    return {
        "available": True,
        "status": status,
        "issue_count": len(issues),
        "top_issue": top_issue,
        "issues": issues,
    }

def get_storage_components() -> dict:
    """
    Get the operational status of the user-facing storage services.

    These checks deliberately test the actual storage interfaces rather
    than inferring availability solely from Ceph daemon state.
    """

    components = {}

    # ---------------------------------------------------------
    # Object Storage / RGW
    # ---------------------------------------------------------
    try:
        s3 = get_s3_client()
        response = s3.list_buckets()

        components["object"] = {
            "status": "HEALTHY",
            "label": "S3 / RGW",
            "detail": f"{len(response.get('Buckets', []))} bucket(s)",
        }

    except Exception as e:
        components["object"] = {
            "status": "UNAVAILABLE",
            "label": "S3 / RGW",
            "detail": str(e),
        }

    # ---------------------------------------------------------
    # Block Storage / RBD
    # ---------------------------------------------------------
    try:
        rbd_result = list_rbd_images()

        if "error" in rbd_result:
            components["block"] = {
                "status": "UNAVAILABLE",
                "label": "RBD",
                "detail": rbd_result["error"],
            }
        else:
            images = rbd_result.get("images", [])

            components["block"] = {
                "status": "AVAILABLE",
                "label": "RBD",
                "detail": (
                    f"{len(images)} image(s)"
                    if images
                    else "No images"
                ),
                "image_count": len(images),
            }

    except Exception as e:
        components["block"] = {
            "status": "UNAVAILABLE",
            "label": "RBD",
            "detail": str(e),
        }

    # ---------------------------------------------------------
    # File Storage / CephFS
    # ---------------------------------------------------------
    try:
        mount_point = get_active_mount_point()
        mounted = is_mounted(mount_point)

        components["file"] = {
            "status": "MOUNTED" if mounted else "NOT_MOUNTED",
            "label": "CephFS",
            "detail": mount_point if mounted else f"Not mounted at {mount_point}",
        }

    except Exception as e:
        components["file"] = {
            "status": "UNAVAILABLE",
            "label": "CephFS",
            "detail": str(e),
        }

    # ---------------------------------------------------------
    # Vault
    # ---------------------------------------------------------
    try:
        vault = get_vault_status()

        components["vault"] = {
            "status": "MOUNTED" if vault.get("mounted") else "NOT_MOUNTED",
            "label": "Vault Backup",
            "detail": (
                vault.get("path")
                if vault.get("mounted")
                else f"Not mounted at {vault.get('path', '/vault')}"
            ),
        }

    except Exception as e:
        components["vault"] = {
            "status": "UNAVAILABLE",
            "label": "Vault Backup",
            "detail": str(e),
        }

    return {
        "available": True,
        **components,
    }

# ─── The remaining parsers below are derived from the same ceph -s payload ──
# and have been verified against real output, but are NOT wired into any
# route yet. They are included here (rather than written fresh next phase)
# purely because they share _get_ceph_status_raw() with Phase 1 and writing
# them now avoids re-deriving the same verified schema twice. Do not import
# or call these from cluster_routes.py until their own phase.

def get_cluster_services() -> Dict[str, Any]:
    """
    PHASE 3 (Cluster Services panel, Section 10).

    MON/MGR/OSD from monmap/osdmap/mgrmap (wired since Phase 2).
    RGW added this phase, from servicemap.services.rgw.daemons — verified
    against real cluster output: each daemon is keyed by its gid (a numeric
    string), with a "summary" sibling key to skip, and per-daemon
    metadata.id/zone_name/realm_name/ceph_version_short give the RGW
    instance identity. On the cluster this was verified against, only ONE
    rgw daemon appeared in servicemap (id=aikyastor-primary.*, zone
    aikyastor-primary) even though the project has both aikyastor-primary
    and aikyastor-secondary zones configured — this is expected scoping,
    not a bug: `ceph -s` only reports daemons visible to the cluster it's
    run against, and the secondary RGW/zone lives on a separate host
    (192.168.0.160 per project context) which wasn't part of this capture.
    Do not treat "only 1 RGW visible" as an error condition here; report
    what's actually in servicemap.

    MDS is NOT yet included — see the module-level TODO below this
    function. fsmap parsing needs a clean `ceph fs status` sample before
    being written (the one fsmap sample captured earlier was structurally
    malformed — repeated top-level id/up/in/max keys — and guessing a
    parser against malformed input risks silently wrong MDS counts).
    """
    raw = _get_ceph_status_raw()
    if not raw:
        return {"available": False, "error": "ceph -s unavailable"}

    monmap = raw.get("monmap", {})
    osdmap = raw.get("osdmap", {})
    mgrmap = raw.get("mgrmap", {})
    servicemap = raw.get("servicemap", {})

    rgw_daemons = []
    rgw_service = servicemap.get("services", {}).get("rgw", {})
    for gid, daemon in rgw_service.get("daemons", {}).items():
        if gid == "summary":
            continue
        meta = daemon.get("metadata", {})
        rgw_daemons.append({
            "gid": gid,
            "id": meta.get("id", gid),
            "zone_name": meta.get("zone_name", "unknown"),
            "realm_name": meta.get("realm_name", "unknown"),
            "ceph_version": meta.get("ceph_version_short", "unknown"),
        })

    return {
        "available": True,
        "mon": {
            "up": len(raw.get("quorum", [])),
            "total": monmap.get("num_mons", 0),
        },
        "mgr": {
            "active": 1 if mgrmap.get("available") else 0,
            "standby": mgrmap.get("num_standbys", 0),
        },
        "osd": {
            "up": osdmap.get("num_up_osds", 0),
            "in": osdmap.get("num_in_osds", 0),
            "total": osdmap.get("num_osds", 0),
        },
        "rgw": {
            "count": len(rgw_daemons),
            "daemons": rgw_daemons,
        },
    }


# TODO (Phase 3 continuation): get_mds_status() — RESOLVED, see below.
# Previously blocked on a clean fsmap sample. Riya provided real
# `ceph fs status --format json` output instead, which turned out to have
# a completely different (and better-suited) shape than the fsmap guess
# above assumed — see get_mds_status()'s docstring for the actual verified
# structure. Keeping this note for history: the earlier plan to parse
# fsmap.by_rank from `ceph -s` is superseded; `ceph fs status` is used
# instead as it's the cleaner, purpose-built source for this data.

def get_mds_status() -> Dict[str, Any]:
    """
    PHASE 3 (Cluster Services panel, Section 10) — MDS row.

    Real shape verified against `ceph fs status --format json` on Riya's
    cluster (2026-09-16), which is structurally different from anything
    guessable off the `ceph -s` fsmap alone:

        {
          "clients": [{"clients": int, "fs": <filesystem name>}, ...],
          "mds_version": [...],   # not used here
          "mdsmap": [
            # one entry per MDS DAEMON (not per filesystem) — active
            # daemons carry rank/caps/dirs/dns/inos; standby daemons
            # carry only name+state:
            {"name": str, "state": "active", "rank": int, "caps": int,
             "dirs": int, "dns": int, "inos": int, "rate": number},
            {"name": str, "state": "standby"},
            ...
          ],
          "pools": [...]  # not used here — CephFS pool detail already
                           # available via get_pool_stats() in the Pools
                           # phase
        }

    Verified on real data: 4 filesystems (from `clients`), 4 active MDS
    (one per filesystem, all at rank 0 — no multi-active ranks in this
    deployment) + 3 standby MDS daemons = 7 total MDS daemons.

    This does NOT use `ceph -s`'s fsmap at all (that field's shape in an
    earlier captured sample was malformed/inconsistent and is not used as
    a source for MDS state anywhere in this codebase).
    """
    stdout, stderr, code = run_ceph_cmd("ceph fs status --format json")
    if code != 0 or not stdout:
        logger.error(f"ceph fs status failed: {stderr}")
        return {"available": False, "error": stderr or "ceph fs status failed"}

    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as e:
        logger.error(f"ceph fs status returned invalid JSON: {e}")
        return {"available": False, "error": "invalid JSON from ceph fs status"}

    filesystems = [c.get("fs") for c in data.get("clients", []) if c.get("fs")]
    mdsmap = data.get("mdsmap", [])

    active = [m for m in mdsmap if m.get("state") == "active"]
    standby = [m for m in mdsmap if m.get("state") == "standby"]

    return {
        "available": True,
        "filesystem_count": len(filesystems),
        "filesystems": filesystems,
        "active_count": len(active),
        "standby_count": len(standby),
        "daemons": [{
            "name": m.get("name"),
            "state": m.get("state"),
            "rank": m.get("rank"),  # None for standby daemons
        } for m in mdsmap],
    }


def get_capacity_summary() -> Dict[str, Any]:
    """
    PHASE 2 (KPI cards). Wraps ceph_ops.get_cluster_stats() — deliberately
    reuses that existing function rather than re-parsing `ceph df` a
    second time (same data, already correct, no reason to duplicate).
    Adds a rounded utilization percentage since the KPI card needs it
    directly and Dashboard.jsx already has its own separate
    calculatePercentage() call for the old StatCards — this is an
    independent computation for the new KPI row, not a shared one, to
    avoid coupling the two card sets together.
    """
    from services.cluster.ceph_ops import get_cluster_stats
    stats = get_cluster_stats()
    if "error" in stats and not stats.get("total_bytes"):
        return {"available": False, "error": stats.get("error", "ceph df failed")}

    total = stats.get("total_bytes", 0)
    used = stats.get("total_used_raw", 0)
    avail = stats.get("total_avail", 0)
    pct = round((used / total) * 100, 1) if total else 0

    return {
        "available": True,
        "total_bytes": total,
        "used_bytes": used,
        "avail_bytes": avail,
        "utilization_pct": pct,
    }

def get_cluster_io() -> Dict[str, Any]:
    """
    Return current cluster I/O rates from Prometheus.

    Throughput and operation rates come from Ceph pool metrics exposed
    through Prometheus. Cluster inventory fields remain sourced from
    `ceph -s` so the existing dashboard API shape is preserved.
    """

    def _value(result: List[Dict[str, Any]]) -> float:
        if not result:
            return 0.0
        return float(result[0]["value"][1])

    try:
        read_bytes = query(
            "sum(rate(ceph_pool_rd_bytes[1m]))"
        )
        write_bytes = query(
            "sum(rate(ceph_pool_wr_bytes[1m]))"
        )
        read_ops = query(
            "sum(rate(ceph_pool_rd[1m]))"
        )
        write_ops = query(
            "sum(rate(ceph_pool_wr[1m]))"
        )

        # Preserve the existing inventory fields used elsewhere
        # in the dashboard.
        raw = _get_ceph_status_raw()
        pgmap = raw.get("pgmap", {}) if raw else {}

        return {
            "available": True,

            # Prometheus-backed performance metrics
            "read_bytes_sec": _value(read_bytes),
            "write_bytes_sec": _value(write_bytes),
            "read_op_per_sec": _value(read_ops),
            "write_op_per_sec": _value(write_ops),

            # Existing Ceph inventory fields
            "num_pgs": pgmap.get("num_pgs", 0),
            "num_pools": pgmap.get("num_pools", 0),
            "num_objects": pgmap.get("num_objects", 0),
        }

    except PrometheusError as exc:
        logger.error(
            "Prometheus I/O query failed: %s",
            exc,
        )

        return {
            "available": False,
            "error": str(exc),
        }

# ─── Cluster I/O history (Phase 7 sampling strategy) ─────────────────────────
# `ceph -s` gives no history of its own (confirmed above) and the frontend
# polls independently per browser tab, so accumulating history client-side
# would lose it on every reload and diverge across tabs. Instead: a
# server-side ring buffer, filled by a background daemon thread that
# samples get_cluster_io() on its own fixed cadence — decoupled from
# /api/dashboard's own request timing, so the chart has real history
# immediately on page load rather than starting empty and filling in only
# as long as a browser tab happens to stay open. Same shape as the
# existing services/object/lifecycle_scheduler.py background-thread
# pattern (daemon thread, fixed sleep interval, exceptions caught inside
# the loop so one failed sample never kills the sampler) — no new
# concurrency pattern introduced.

# ─── Cluster I/O history (Prometheus) ────────────────────────────────────────

_IO_HISTORY_WINDOW_SECONDS = 3600  # 1 hour
_IO_HISTORY_STEP_SECONDS = 10      # 10-second resolution
_IO_HISTORY_MAXLEN = (
    _IO_HISTORY_WINDOW_SECONDS // _IO_HISTORY_STEP_SECONDS
)


def get_cluster_io_history() -> Dict[str, Any]:
    """
    Return one hour of cluster I/O history from Prometheus.

    Throughput and operation rates are calculated from Ceph pool metrics.
    The response shape is kept compatible with the existing frontend.
    """

    end = time.time()
    start = end - _IO_HISTORY_WINDOW_SECONDS

    queries = {
        "read_bytes_sec": "sum(rate(ceph_pool_rd_bytes[1m]))",
        "write_bytes_sec": "sum(rate(ceph_pool_wr_bytes[1m]))",
        "read_op_per_sec": "sum(rate(ceph_pool_rd[1m]))",
        "write_op_per_sec": "sum(rate(ceph_pool_wr[1m]))",
    }

    try:
        results = {
            name: query_range(
                promql,
                start=start,
                end=end,
                step=_IO_HISTORY_STEP_SECONDS,
            )
            for name, promql in queries.items()
        }

        # Prometheus returns one time series for each aggregate query.
        # Convert each result into {timestamp: value} for easy alignment.
        series = {}

        for name, result in results.items():
            values = {}

            if result:
                for timestamp, value in result[0].get("values", []):
                    values[float(timestamp)] = float(value)

            series[name] = values

        # Use timestamps from the read-throughput series as the timeline.
        timestamps = sorted(
            set().union(
                *[set(values.keys()) for values in series.values()]
            )
        )

        points = []

        for timestamp in timestamps[-_IO_HISTORY_MAXLEN:]:
            points.append({
                "timestamp": datetime.fromtimestamp(
                    timestamp,
                    tz=timezone.utc,
                ).isoformat(),
                "available": True,
                "read_bytes_sec": series["read_bytes_sec"].get(
                    timestamp, 0.0
                ),
                "write_bytes_sec": series["write_bytes_sec"].get(
                    timestamp, 0.0
                ),
                "read_op_per_sec": series["read_op_per_sec"].get(
                    timestamp, 0.0
                ),
                "write_op_per_sec": series["write_op_per_sec"].get(
                    timestamp, 0.0
                ),
            })

        return {
            "available": True,
            "source": "prometheus",
            "interval_seconds": _IO_HISTORY_STEP_SECONDS,
            "max_points": _IO_HISTORY_MAXLEN,
            "points": points,
        }

    except PrometheusError as exc:
        logger.error(
            "Prometheus I/O history query failed: %s",
            exc,
        )

        return {
            "available": False,
            "source": "prometheus",
            "interval_seconds": _IO_HISTORY_STEP_SECONDS,
            "max_points": _IO_HISTORY_MAXLEN,
            "points": [],
            "error": str(exc),
        }

def get_osd_utilization() -> Dict[str, Any]:
    """
    PHASE 4 (OSD Utilization, Section 11). Wired into /api/dashboard.
    Verified against real `ceph osd df --format json`: nodes[].utilization
    is already a percentage (e.g. 1.18 == 1.18%, not a 0-1 fraction) —
    confirmed against nodes[].kb_used/kb which computes to the same value.
    Do NOT multiply by 100 again when rendering.
    """
    stdout, stderr, code = run_ceph_cmd("ceph osd df --format json")
    if code != 0 or not stdout:
        logger.error(f"ceph osd df failed: {stderr}")
        return {"available": False, "error": stderr or "ceph osd df failed"}

    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as e:
        logger.error(f"ceph osd df returned invalid JSON: {e}")
        return {"available": False, "error": "invalid JSON from ceph osd df"}

    nodes = data.get("nodes", [])
    osds = [{
        "id": n.get("id"),
        "name": n.get("name", f"osd.{n.get('id')}"),
        "device_class": n.get("device_class", "unknown"),
        "status": n.get("status", "unknown"),
        "utilization_pct": round(n.get("utilization", 0), 2),
        "kb": n.get("kb", 0),
        "kb_used": n.get("kb_used", 0),
        "kb_avail": n.get("kb_avail", 0),
        "pgs": n.get("pgs", 0),
    } for n in nodes]

    summary = data.get("summary", {})
    return {
        "available": True,
        "osds": osds,
        "average_utilization_pct": round(summary.get("average_utilization", 0), 2),
    }


def get_pool_stats() -> Dict[str, Any]:
    """
    PHASE 5 (Pool Overview, Section 12). Wired into /api/dashboard.

    Combines two commands:
      1. `ceph df detail --format json` — per-pool stored/used/objects/
         percent_used/max_avail. Pools are keyed here by "name"/"id".
      2. `ceph osd pool ls detail --format json` — the actual replication/
         redundancy source. Verified against real cluster output
         (2026-09-17): each entry is a flat object keyed by "pool_id"/
         "pool_name" (NOT "id"/"name" — different key names than #1,
         confirmed by inspecting a real entry) with "size" (replica/copy
         count), "min_size", and "pg_num" all present directly — no
         nesting. "application_metadata" is a dict whose single top-level
         key names the pool's use (e.g. {"rgw": {}}, {"cephfs": {...}},
         {"rbd": {}}, {"mgr": {}}, {"nfs": {}}) and is used here purely
         as a display label; it is not otherwise interpreted.

         Confirmed live on Riya's cluster: 26 of 27 pools have size=1
         (no redundancy — single copy), only `.mgr` has size=2. This
         matches (and is the real source behind) the POOL_NO_REDUNDANCY
         health check already surfaced by get_health_summary() — that
         check is a cluster-wide count, this is the real per-pool detail
         it was standing in for. A pool is flagged "redundant": False
         whenever size <= 1, since a single copy has no replica to lose.

      The two are merged by pool_id == id (both integers, confirmed
      matching format — e.g. rbd is id 2 / pool_id 2 in both outputs on
      the same cluster capture). If `ceph osd pool ls detail` fails or a
      given pool_id has no match (defensive only — not observed in real
      data, where every ceph df detail pool had a corresponding ls-detail
      entry), the pool still renders with real usage stats and
      size/min_size/pg_num/application/redundant as None rather than the
      whole pool being dropped or the endpoint failing — matching this
      module's "never let one failing subcommand blank the response"
      discipline. redundancy_available flags whether the second call
      succeeded at all, so the frontend can distinguish "no redundancy
      data because the call failed" from "redundancy data present, this
      pool genuinely has no replicas".
    """
    stdout, stderr, code = run_ceph_cmd("ceph df detail --format json")
    if code != 0 or not stdout:
        logger.error(f"ceph df detail failed: {stderr}")
        return {"available": False, "error": stderr or "ceph df detail failed"}

    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as e:
        logger.error(f"ceph df detail returned invalid JSON: {e}")
        return {"available": False, "error": "invalid JSON from ceph df detail"}

    # Redundancy/replication detail — separate command, independently
    # failure-tolerant. A failure here does NOT fail the whole function;
    # it just means every pool's size/min_size/pg_num/application/redundant
    # come back as None (see docstring).
    redundancy_by_id: Dict[Any, Dict[str, Any]] = {}
    redundancy_available = False
    ls_stdout, ls_stderr, ls_code = run_ceph_cmd("ceph osd pool ls detail --format json")
    if ls_code == 0 and ls_stdout:
        try:
            ls_data = json.loads(ls_stdout)
            for p in ls_data:
                app_meta = p.get("application_metadata", {}) or {}
                application = next(iter(app_meta), None)
                redundancy_by_id[p.get("pool_id")] = {
                    "size": p.get("size"),
                    "min_size": p.get("min_size"),
                    "pg_num": p.get("pg_num"),
                    "application": application,
                }
            redundancy_available = True
        except json.JSONDecodeError as e:
            logger.error(f"ceph osd pool ls detail returned invalid JSON: {e}")
    else:
        logger.error(f"ceph osd pool ls detail failed: {ls_stderr}")

    pools = []
    for p in data.get("pools", []):
        pool_id = p.get("id")
        redundancy = redundancy_by_id.get(pool_id, {})
        size = redundancy.get("size")
        pools.append({
            "name": p.get("name"),
            "id": pool_id,
            "stored_bytes": p.get("stats", {}).get("stored", 0),
            "bytes_used": p.get("stats", {}).get("bytes_used", 0),
            "objects": p.get("stats", {}).get("objects", 0),
            "percent_used": round(p.get("stats", {}).get("percent_used", 0) * 100, 4),
            "max_avail": p.get("stats", {}).get("max_avail", 0),
            "size": size,
            "min_size": redundancy.get("min_size"),
            "pg_num": redundancy.get("pg_num"),
            "application": redundancy.get("application"),
            "redundant": (size is not None and size > 1) if size is not None else None,
        })

    return {
        "available": True,
        "pools": pools,
        "redundancy_available": redundancy_available,
    }
