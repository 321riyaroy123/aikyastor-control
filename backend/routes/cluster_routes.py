"""
routes/cluster_routes.py - Cluster info & activity log Blueprint

Moved from: app.py
    - GET /api/activity
    - GET /api/activity/stats
    - GET /api/stats
    - GET /api/health
    - GET /api/version
    - GET /api/info

Added (Dashboard redesign):
    - GET /api/dashboard
      Phase 1 (Cluster Health Banner):  "health" block
      Phase 2 (Top KPI cards):          "capacity" + "services" blocks
      Phase 3 (Cluster Services panel): "services.rgw" extended, "mds" block added
      Phase 4 (OSD Utilization):        "osds" block added
      Phase 5 (Pool Overview):          "pools" block added
      Phase 6 (Attention Required):     no new block — frontend-only,
                                         reuses "health" as-is
      Phase 7 (Performance charts):     "io" + "io_history" blocks added.
                                         "io_history" is backed by a
                                         background sampler thread — see
                                         metrics_service.start_io_history_sampler(),
                                         which MUST be started once at
                                         app startup (app.py) or
                                         "io_history.points" will stay
                                         permanently empty. Prometheus
                                         has no scaffold yet — not started
                                         (no Prometheus instance exists
                                         for this cluster).

Responsibility:
    Thin HTTP layer only — validate input (none needed for these GETs),
    branch on config.IS_SIMULATION, call into the service layer
    (core.activity / services.cluster.ceph_ops / services.cluster.metrics_service
    / simulation.simulation), and return JSON. No business logic lives here,
    matching the original app.py route bodies exactly.

PHASE 7 NOTE: /api/dashboard now returns "health", "capacity", "services"
(mon/mgr/osd/rgw), "mds", "osds" (per-OSD utilization list, from
`ceph osd df`), "pools" (per-pool stats + real replication/redundancy
data, from `ceph df detail` merged with `ceph osd pool ls detail`), "io"
(instantaneous pgmap read/write bytes+ops), and "io_history" (ring-buffer
time series of the same, sampled independently every 10s by a background
thread — see metrics_service.py). "activity" and "prometheus" remain
unimplemented — no scaffold exists for either yet; Prometheus in
particular is deliberately not stubbed out since this cluster has no
Prometheus instance to report on. Simulation mode is intentionally NOT
implemented for /api/dashboard yet (explicit decision — this endpoint
501s in simulation mode rather than silently returning fake or empty data).
"""

from flask import Blueprint, jsonify
import config.config as config
from core.logger import logger
from core.activity import get_activity_log, get_activity_stats
from services.cluster.ceph_ops import get_cluster_stats, get_cluster_health, get_ceph_version
from services.cluster.component_status import get_component_status
from services.cluster.metrics_service import (
    get_health_summary,
    get_capacity_summary,
    get_cluster_services,
    get_mds_status,
    get_osd_utilization,
    get_pool_stats,
    get_cluster_io,
    get_cluster_io_history,
    get_storage_components,
)
import simulation.simulation as simulation

cluster_bp = Blueprint("cluster", __name__, url_prefix="/api")


@cluster_bp.route("/activity", methods=["GET"])
def get_activity():
    """Get activity log"""
    if config.IS_SIMULATION:
        return jsonify({"log": simulation.get_mock_activity()})
    try:
        log_data = get_activity_log()
        return jsonify({"log": log_data})
    except Exception as e:
        logger.exception("get_activity error")
        return jsonify({"error": str(e)}), 500


@cluster_bp.route("/activity/stats", methods=["GET"])
def activity_stats():
    """Get activity statistics"""
    try:
        stats = get_activity_stats()
        return jsonify(stats)
    except Exception as e:
        logger.exception("activity_stats error")
        return jsonify({"error": str(e)}), 500


@cluster_bp.route("/stats", methods=["GET"])
def cluster_stats():
    """Get cluster statistics"""
    try:
        if config.IS_SIMULATION:
            return jsonify(simulation.get_mock_stats())
        return jsonify(get_cluster_stats())
    except Exception as e:
        logger.exception("cluster_stats error")
        return jsonify({"error": str(e)}), 500


@cluster_bp.route("/health", methods=["GET"])
def cluster_health():
    """Get cluster health status"""
    try:
        if config.IS_SIMULATION:
            return jsonify(simulation.get_mock_health())
        return jsonify(get_cluster_health())
    except Exception as e:
        logger.exception("cluster_health error")
        return jsonify({"error": str(e)}), 500


@cluster_bp.route("/version", methods=["GET"])
def ceph_version():
    """Get Ceph version"""
    try:
        if config.IS_SIMULATION:
            return jsonify({"version": "17.2.5 (quincy)"})
        return jsonify({"version": get_ceph_version()})
    except Exception as e:
        logger.exception("ceph_version error")
        return jsonify({"error": str(e)}), 500


@cluster_bp.route("/info", methods=["GET"])
def app_info():
    """Get application info"""
    return jsonify({
        "app": "AiKyaStor CONTROL",
        "version": "1.0.0",
        "mode": config.get_app_mode(),
        "ceph_version": get_ceph_version() if not config.IS_SIMULATION else "17.2.5 (quincy)"
    })


@cluster_bp.route("/dashboard", methods=["GET"])
def dashboard():
    """
    Aggregate dashboard endpoint for the redesigned Overview page.

    PHASE 1: returns only "health". Each subsystem block is fetched and
    caught independently so that a failure in one (once more blocks are
    added in later phases) can never take down the whole response — every
    block instead carries its own "available"/"error" fields, which the
    frontend is expected to render per-section rather than blanking the
    whole page on a partial failure.

    Simulation mode is explicitly unimplemented for this endpoint right
    now (by request — simulation support is being skipped for this
    redesign). Returns 501 so the frontend can distinguish "not built yet"
    from "ceph command failed" rather than the two being silently conflated.
    """
    if config.IS_SIMULATION:
        return jsonify({
            "error": "Dashboard aggregate endpoint has no simulation-mode implementation yet"
        }), 501

    try:
        health = get_health_summary()
    except Exception as e:
        logger.exception("dashboard: get_health_summary error")
        health = {"available": False, "status": "UNKNOWN", "issue_count": 0,
                  "top_issue": None, "issues": [], "error": str(e)}

    try:
        capacity = get_capacity_summary()
    except Exception as e:
        logger.exception("dashboard: get_capacity_summary error")
        capacity = {"available": False, "error": str(e)}

    try:
        services = get_cluster_services()
    except Exception as e:
        logger.exception("dashboard: get_cluster_services error")
        services = {"available": False, "error": str(e)}

    try:
        mds = get_mds_status()
    except Exception as e:
        logger.exception("dashboard: get_mds_status error")
        mds = {"available": False, "error": str(e)}

    try:
        osds = get_osd_utilization()
    except Exception as e:
        logger.exception("dashboard: get_osd_utilization error")
        osds = {"available": False, "error": str(e)}

    try:
        pools = get_pool_stats()
    except Exception as e:
        logger.exception("dashboard: get_pool_stats error")
        pools = {"available": False, "error": str(e)}

    try:
        io = get_cluster_io()
    except Exception as e:
        logger.exception("dashboard: get_cluster_io error")
        io = {"available": False, "error": str(e)}

    try:
        io_history = get_cluster_io_history()
    except Exception as e:
        logger.exception("dashboard: get_cluster_io_history error")
        io_history = {"available": False, "error": str(e)}

    try:
        version = get_ceph_version()
    except Exception as e:
        logger.exception("dashboard: get_ceph_version error")
        version = None

    try:
        components = get_storage_components()
    except Exception as e:
        logger.exception("dashboard: get_storage_components error")
        components = {"available": False, "error": str(e)}

    return jsonify({
        "health": health,
        "capacity": capacity,
        "services": services,
        "mds": mds,
        "osds": osds,
        "pools": pools,
        "io": io,
        "io_history": io_history,
        "components": components,
        "version": version,
    })

@cluster_bp.route("/components", methods=["GET"])
def component_status():
    """Return real-time status of storage components."""

    try:
        if config.IS_SIMULATION:
            return jsonify({
                "components": [
                    {
                        "name": "RGW / S3",
                        "type": "Object",
                        "status": "Active",
                        "details": "http://192.168.29.252:80",
                        "healthy": True,
                    },
                    {
                        "name": "RBD Pool",
                        "type": "Block",
                        "status": "Active",
                        "details": "pool: rbd",
                        "healthy": True,
                    },
                    {
                        "name": "CephFS",
                        "type": "File",
                        "status": "Mounted",
                        "details": "/mnt/cephfs",
                        "healthy": True,
                    },
                    {
                        "name": "Vault Disk",
                        "type": "Backup",
                        "status": "Available",
                        "details": "/vault",
                        "healthy": True,
                    },
                ]
            })

        return jsonify(get_component_status())

    except Exception as e:
        logger.exception("component_status error")
        return jsonify({
            "error": str(e)
        }), 500