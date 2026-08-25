"""
RGW multisite replication routes.
"""

from flask import Blueprint, jsonify, request
 
from core.logger import logger
from services.object.replication import (
    get_replication_status,
    get_replicated_buckets,
    configure_replication,
    provision_secondary,
    reset_replication_circuit_breaker,
)
 
 
replication_bp = Blueprint(
    "replication",
    __name__,
    url_prefix="/api/replication"
)
 
 
@replication_bp.route("/status", methods=["GET"])
def api_replication_status():
    """Get RGW multisite configuration and synchronization status."""
 
    try:
        result = get_replication_status()
 
        # Do not expose raw Ceph output to the browser.
        result.pop("raw_sync", None)
 
        if not result.get("enabled", False) and "error" in result:
            # Only true when get_replication_status()'s outer except fired
            # (misconfiguration, primary-side Ceph error, etc.) -- a real
            # 500, not just "secondary is down".
            return jsonify(result), 500
 
        if result.get("reachable") is False:
            return jsonify(result), 503
 
        return jsonify(result), 200
 
    except Exception as e:
        logger.exception("replication_status error")
        return jsonify({"error": str(e)}), 500
 
 
@replication_bp.route("/buckets", methods=["GET"])
def api_replicated_buckets():
    """List buckets present in the secondary zone."""
 
    try:
        result = get_replicated_buckets()
 
        if "error" in result:
            return jsonify(result), 500
 
        if result.get("status") == "loading":
            return jsonify(result), 202
 
        if result.get("secondary_reachable") is False:
            return jsonify(result), 503
 
        return jsonify(result), 200
 
    except Exception as e:
        logger.exception("replicated_buckets error")
        return jsonify({"error": str(e)}), 500
 
 
@replication_bp.route("/breaker/reset", methods=["POST"])
def api_reset_circuit_breaker():
    """
    Manually clear the replication circuit breaker (e.g. a "Retry now"
    button on the dashboard once the secondary connection is fixed), so
    the next status/buckets call re-attempts SSH immediately instead of
    waiting out the cooldown window.
    """
    try:
        result = reset_replication_circuit_breaker()
        return jsonify(result), 200
    except Exception as e:
        logger.exception("reset_circuit_breaker error")
        return jsonify({"error": str(e)}), 500
 
 
@replication_bp.route("/configure", methods=["POST"])
def api_configure_replication():
    """Configure an existing RGW secondary zone."""
 
    try:
        data = request.get_json(silent=True) or {}
 
        secondary_zone = data.get("secondary_zone")
        secondary_endpoint = data.get("secondary_endpoint")
        read_only = bool(data.get("read_only", False))
 
        if not secondary_zone:
            return jsonify({
                "error": "secondary_zone is required"
            }), 400
 
        if not secondary_endpoint:
            return jsonify({
                "error": "secondary_endpoint is required"
            }), 400
 
        result = configure_replication(
            secondary_zone=secondary_zone,
            secondary_endpoint=secondary_endpoint,
            read_only=read_only,
        )
 
        if not result.get("success"):
            return jsonify(result), 500
 
        return jsonify(result), 200
 
    except Exception as e:
        logger.exception("configure_replication route error")
 
        return jsonify({
            "error": str(e)
        }), 500
        
@replication_bp.route("/provision", methods=["POST"])
def api_provision_replication():
 
    try:
        data = request.get_json(silent=True) or {}
 
        required = [
            "secondary_host",
            "secondary_user",
            "secondary_zone",
            "secondary_endpoint",
        ]
 
        missing = [
            field
            for field in required
            if not data.get(field)
        ]
 
        if missing:
            return jsonify({
                "error": (
                    "Missing required fields: "
                    + ", ".join(missing)
                )
            }), 400
 
        result = provision_secondary(
            secondary_host=data["secondary_host"],
            secondary_user=data["secondary_user"],
            secondary_zone=data["secondary_zone"],
            secondary_endpoint=data["secondary_endpoint"],
            secondary_port=int(
                data.get("secondary_port", 7480)
            ),
            read_only=bool(
                data.get("read_only", False)
            ),
        )
 
        return jsonify(result), 200
 
    except Exception as e:
        logger.exception(
            "replication provisioning error"
        )
 
        return jsonify({
            "success": False,
            "error": str(e),
        }), 500
 