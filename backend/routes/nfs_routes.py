"""
routes/nfs_routes.py

HTTP API for Ceph NFS management.

Routes:
    GET    /api/nfs/clusters
    GET    /api/nfs/clusters/<cluster_id>
    GET    /api/nfs/clusters/<cluster_id>/exports
    GET    /api/nfs/clusters/<cluster_id>/exports/<path:pseudo_path>
    POST   /api/nfs/exports
    DELETE /api/nfs/clusters/<cluster_id>/exports/<path:pseudo_path>

This layer only handles HTTP validation and responses.
Actual Ceph operations live in services/nfs/nfs_ops.py.
"""

import re

from flask import Blueprint, request, jsonify

from core.logger import logger
from services.nfs.nfs_ops import (
    list_nfs_clusters,
    get_nfs_cluster_info,
    list_nfs_exports,
    get_nfs_export,
    create_rgw_export,
    delete_nfs_export,
)

nfs_bp = Blueprint("nfs", __name__, url_prefix="/api/nfs")


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def valid_identifier(value: str) -> bool:
    """
    Validate a Ceph identifier such as a cluster ID or bucket name.

    Allows letters, numbers, '.', '_' and '-'.
    """
    return bool(
        value and re.fullmatch(r"[A-Za-z0-9._-]+", value)
    )


def valid_pseudo_path(value: str) -> bool:
    """
    Validate an NFS pseudo path.

    Example:
        /meow
    """
    return bool(
        value
        and value.startswith("/")
        and not value.startswith("//")
        and ".." not in value
        and re.fullmatch(r"/[A-Za-z0-9._/-]*", value)
    )


# ---------------------------------------------------------------------------
# Cluster operations
# ---------------------------------------------------------------------------

@nfs_bp.route("/clusters", methods=["GET"])
def api_list_nfs_clusters():
    """List Ceph NFS clusters."""
    try:
        result = list_nfs_clusters()

        if "error" in result:
            return jsonify(result), 500

        return jsonify(result), 200

    except Exception as e:
        logger.exception("list_nfs_clusters API error")
        return jsonify({"error": str(e)}), 500


@nfs_bp.route("/clusters/<cluster_id>", methods=["GET"])
def api_get_nfs_cluster_info(cluster_id):
    """Get information about an NFS cluster."""

    if not valid_identifier(cluster_id):
        return jsonify({"error": "Invalid NFS cluster ID"}), 400

    try:
        result = get_nfs_cluster_info(cluster_id)

        if "error" in result:
            return jsonify(result), 500

        return jsonify(result), 200

    except Exception as e:
        logger.exception(
            f"get_nfs_cluster_info API error for {cluster_id}"
        )
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Export operations
# ---------------------------------------------------------------------------

@nfs_bp.route("/clusters/<cluster_id>/exports", methods=["GET"])
def api_list_nfs_exports(cluster_id):
    """List exports belonging to an NFS cluster."""

    if not valid_identifier(cluster_id):
        return jsonify({"error": "Invalid NFS cluster ID"}), 400

    try:
        result = list_nfs_exports(cluster_id)

        if "error" in result:
            return jsonify(result), 500

        return jsonify(result), 200

    except Exception as e:
        logger.exception(
            f"list_nfs_exports API error for {cluster_id}"
        )
        return jsonify({"error": str(e)}), 500


@nfs_bp.route(
    "/clusters/<cluster_id>/exports/<path:pseudo_path>",
    methods=["GET"]
)
def api_get_nfs_export(cluster_id, pseudo_path):
    """Get detailed information about an NFS export."""

    pseudo_path = "/" + pseudo_path.lstrip("/")

    if not valid_identifier(cluster_id):
        return jsonify({"error": "Invalid NFS cluster ID"}), 400

    if not valid_pseudo_path(pseudo_path):
        return jsonify({"error": "Invalid NFS pseudo path"}), 400

    try:
        result = get_nfs_export(
            cluster_id,
            pseudo_path
        )

        if "error" in result:
            return jsonify(result), 500

        # Never expose RGW credentials to the frontend.
        if isinstance(result.get("fsal"), dict):
            result["fsal"].pop("access_key_id", None)
            result["fsal"].pop("secret_access_key", None)

        return jsonify(result), 200

    except Exception as e:
        logger.exception(
            f"get_nfs_export API error for "
            f"{cluster_id}:{pseudo_path}"
        )
        return jsonify({"error": str(e)}), 500


@nfs_bp.route("/exports", methods=["POST"])
def api_create_rgw_export():
    """Expose an RGW bucket through NFS."""

    try:
        data = request.get_json(silent=True) or {}

        cluster_id = str(
            data.get("cluster_id", "")
        ).strip()

        pseudo_path = str(
            data.get("pseudo_path", "")
        ).strip()

        bucket = str(
            data.get("bucket", "")
        ).strip()

        if not valid_identifier(cluster_id):
            return jsonify({
                "error": "Valid cluster_id is required"
            }), 400

        if not valid_identifier(bucket):
            return jsonify({
                "error": "Valid bucket is required"
            }), 400

        if not valid_pseudo_path(pseudo_path):
            return jsonify({
                "error": "Valid pseudo_path is required"
            }), 400

        result = create_rgw_export(
            cluster_id,
            pseudo_path,
            bucket
        )

        if "error" in result:
            return jsonify(result), 500

        return jsonify(result), 201

    except Exception as e:
        logger.exception("create_rgw_export API error")
        return jsonify({"error": str(e)}), 500


@nfs_bp.route(
    "/clusters/<cluster_id>/exports/<path:pseudo_path>",
    methods=["DELETE"]
)
def api_delete_nfs_export(cluster_id, pseudo_path):
    """Delete an NFS export without deleting the RGW bucket."""

    pseudo_path = "/" + pseudo_path.lstrip("/")

    if not valid_identifier(cluster_id):
        return jsonify({"error": "Invalid NFS cluster ID"}), 400

    if not valid_pseudo_path(pseudo_path):
        return jsonify({"error": "Invalid NFS pseudo path"}), 400

    try:
        result = delete_nfs_export(
            cluster_id,
            pseudo_path
        )

        if "error" in result:
            return jsonify(result), 500

        return jsonify(result), 200

    except Exception as e:
        logger.exception(
            f"delete_nfs_export API error for "
            f"{cluster_id}:{pseudo_path}"
        )
        return jsonify({"error": str(e)}), 500