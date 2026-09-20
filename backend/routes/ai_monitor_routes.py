"""
routes/ai_monitor_routes.py - Ceph-AI Monitoring Blueprint

Read-only status/telemetry endpoints for the ceph-ai anomaly detection and
RCA system. ceph-ai runs as a SEPARATE PROCESS (see
services/ai_monitor/ai_monitor_db.py's module docstring for the full
rationale) -- this blueprint only ever reads ceph-ai's SQLite database via
that service module. It never imports ml_anomaly_detector.py,
ceph_semantic_baseline.py, or any other ceph-ai module directly.

Routes:
    GET /api/ai-monitor/connectivity   - is the ceph-ai process alive/writing?
    GET /api/ai-monitor/status         - latest normalized v7+v8 anomaly status
    GET /api/ai-monitor/events         - recent events_log entries
    GET /api/ai-monitor/metrics        - metrics time-series window (for charts)
    GET /api/ai-monitor/rca/latest     - most recent RCA incident diagnosis

Pattern followed: routes/vault_routes.py's HashiCorp Vault section is the
closest existing analog in this codebase -- a read-only status API for a
distinct subsystem the app depends on but doesn't directly control. Same
config.IS_SIMULATION branching style is used here, plus an additional
config.CEPH_AI_ENABLED gate specific to this subsystem (see config.py
docstring: the dashboard must degrade to an explicit "disabled"/"offline"
state rather than silently showing nothing when the ceph-ai process isn't
configured or running).
"""

from flask import Blueprint, request, jsonify

import config.config as config
from core.logger import logger
from services.ai_monitor.ai_monitor_db import (
    get_monitor_connectivity,
    get_latest_metrics_snapshot,
    get_metrics_window,
    get_recent_events,
    get_latest_anomaly_status,
    get_latest_rca_incident,
)
import simulation.simulation as simulation

ai_monitor_bp = Blueprint("ai_monitor", __name__, url_prefix="/api/ai-monitor")


def _disabled_response():
    """
    Shared response for every route when CEPH_AI_ENABLED is False.

    This is a 200, not a 404/503 -- the feature is recognized and
    intentionally turned off, which is a different state from "broken."
    The frontend uses "enabled": false to show a distinct "not configured"
    panel instead of an error state.
    """
    return jsonify({
        "enabled": False,
        "message": (
            "Ceph-AI monitoring is not enabled. Set CEPH_AI_ENABLED=true "
            "and CEPH_AI_DB_PATH once the ceph-ai monitoring process is "
            "deployed."
        ),
    }), 200


@ai_monitor_bp.route("/connectivity", methods=["GET"])
def api_connectivity():
    """
    Report whether the ceph-ai process is reachable and actively writing.

    This is the endpoint the dashboard should poll first/most frequently --
    it's cheap (single-row query) and distinguishes "never configured" from
    "configured but the process died" from "healthy," which the other
    endpoints don't need to re-derive individually.
    """
    if not config.CEPH_AI_ENABLED:
        return _disabled_response()

    if config.IS_SIMULATION:
        return jsonify({
            "enabled": True,
            "reachable": True,
            "writing": True,
            "last_write_seconds_ago": 1.8,
        }), 200

    try:
        result = get_monitor_connectivity()
        status_code = 200 if result.get("reachable") else 503
        return jsonify({"enabled": True, **result}), status_code
    except Exception as e:
        logger.exception("ai_monitor connectivity error")
        return jsonify({"enabled": True, "error": str(e)}), 500


@ai_monitor_bp.route("/status", methods=["GET"])
def api_status():
    """
    Latest normalized host-layer (v7) + Ceph-semantic-layer (v8) anomaly
    status, as written by ceph_ai_monitor.py's normalize_anomaly_status().

    Returns the anomaly_status row's "data" payload as-is under "status",
    plus timestamp/staleness metadata. If the anomaly_status table doesn't
    exist yet (ceph-ai process not updated to Phase 2's write-side logic),
    this surfaces that explicitly rather than returning an empty/fake
    "no anomaly" result.
    """
    if not config.CEPH_AI_ENABLED:
        return _disabled_response()

    if config.IS_SIMULATION:
        return jsonify({
            "enabled": True,
            **simulation.get_mock_ai_monitor_status(),
        }), 200

    try:
        result = get_latest_anomaly_status()

        if "error" in result:
            # Table missing / DB missing / corrupt row are all real
            # problems worth a non-200, but distinguishable from a query
            # crash via the message itself.
            return jsonify({"enabled": True, **result}), 503

        return jsonify({"enabled": True, **result}), 200

    except Exception as e:
        logger.exception("ai_monitor status error")
        return jsonify({"enabled": True, "error": str(e)}), 500


@ai_monitor_bp.route("/events", methods=["GET"])
def api_events():
    """
    Recent events_log entries (streamed `ceph -w` / journalctl lines
    captured by host_log_streamer.py).

    Query params:
        seconds (default 120) - how far back to look
        limit   (default 15)  - max entries returned
    """
    if not config.CEPH_AI_ENABLED:
        return _disabled_response()

    try:
        seconds = int(request.args.get("seconds", 120))
        limit = int(request.args.get("limit", 15))
    except (TypeError, ValueError):
        return jsonify({"error": "seconds and limit must be integers"}), 400

    if seconds <= 0 or limit <= 0:
        return jsonify({"error": "seconds and limit must be positive"}), 400

    # Cap limit defensively -- this is a dashboard feed, not a log export.
    limit = min(limit, 200)

    if config.IS_SIMULATION:
        return jsonify({
            "enabled": True,
            "events": simulation.get_mock_ai_monitor_events(),
        }), 200

    try:
        result = get_recent_events(seconds=seconds, limit=limit)
        status_code = 200 if "error" not in result else 503
        return jsonify({"enabled": True, **result}), status_code
    except Exception as e:
        logger.exception("ai_monitor events error")
        return jsonify({"enabled": True, "error": str(e)}), 500


@ai_monitor_bp.route("/metrics", methods=["GET"])
def api_metrics():
    """
    Metrics time-series window for charting.

    Query params:
        minutes (default 15) - how far back to look
    """
    if not config.CEPH_AI_ENABLED:
        return _disabled_response()

    try:
        minutes = int(request.args.get("minutes", 15))
    except (TypeError, ValueError):
        return jsonify({"error": "minutes must be an integer"}), 400

    if minutes <= 0:
        return jsonify({"error": "minutes must be positive"}), 400

    # Same reasoning as ai_monitor_db.get_metrics_window()'s own
    # max_points cap: bound how far back the dashboard can ask for, since
    # this is a live-monitoring chart, not a historical export tool.
    minutes = min(minutes, 24 * 60)

    if config.IS_SIMULATION:
        return jsonify({
            "enabled": True,
            **simulation.get_mock_ai_monitor_metrics_window(),
        }), 200

    try:
        result = get_metrics_window(minutes=minutes)
        status_code = 200 if "error" not in result else 503
        return jsonify({"enabled": True, **result}), status_code
    except Exception as e:
        logger.exception("ai_monitor metrics error")
        return jsonify({"enabled": True, "error": str(e)}), 500


@ai_monitor_bp.route("/rca/latest", methods=["GET"])
def api_rca_latest():
    """
    Most recent RCA incident diagnosis, if one has been triggered.

    Reads the rca_incidents table, which does not exist until Phase 3 wires
    up the write side (llm_analyst.diagnose_incident() output persisted
    per-incident, not per-tick like anomaly_status). Until then this
    correctly reports the table-missing state rather than pretending no
    incident has ever occurred.
    """
    if not config.CEPH_AI_ENABLED:
        return _disabled_response()

    if config.IS_SIMULATION:
        return jsonify({
            "enabled": True,
            "incident": simulation.get_mock_ai_monitor_rca_incident(),
        }), 200

    try:
        result = get_latest_rca_incident()

        if "error" in result:
            return jsonify({"enabled": True, **result}), 503

        return jsonify({"enabled": True, **result}), 200

    except Exception as e:
        logger.exception("ai_monitor rca_latest error")
        return jsonify({"enabled": True, "error": str(e)}), 500