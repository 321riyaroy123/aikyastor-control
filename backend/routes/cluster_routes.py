"""
routes/cluster_routes.py - Cluster info & activity log Blueprint

Moved from: app.py
    - GET /api/activity
    - GET /api/activity/stats
    - GET /api/stats
    - GET /api/health
    - GET /api/version
    - GET /api/info

Responsibility:
    Thin HTTP layer only — validate input (none needed for these GETs),
    branch on config.IS_SIMULATION, call into the service layer
    (core.activity / services.cluster.ceph_ops / simulation.simulation),
    and return JSON. No business logic lives here, matching the
    original app.py route bodies exactly.
"""

from flask import Blueprint, jsonify
import config.config as config
from core.logger import logger
from core.activity import get_activity_log, get_activity_stats
from services.cluster.ceph_ops import get_cluster_stats, get_cluster_health, get_ceph_version
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