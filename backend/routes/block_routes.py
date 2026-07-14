"""
routes/block_routes.py - Block Storage (RBD) Blueprint

Moved from: app.py
    - GET    /api/block/images
    - POST   /api/block/images
    - DELETE /api/block/images/<name>
    - POST   /api/block/images/<name>/map
    - POST   /api/block/images/<name>/unmap
    - GET    /api/block/mapped
    - POST   /api/block/images/<name>/snapshot
    - GET    /api/block/images/<name>/snapshots

Responsibility:
    Thin HTTP layer only — validate input, branch on
    config.IS_SIMULATION, call services.block.block_storage, return JSON.
    (export-vault for RBD images is namespaced under /api/block/ in the
    URL but lives in vault_routes.py since it's a vault operation —
    URL unchanged either way.)
"""

from flask import Blueprint, request, jsonify
import config.config as config
from core.logger import logger
from core.activity import log_activity
from services.block.block_storage import (
    list_rbd_images, create_rbd_image, delete_rbd_image,
    map_rbd_image, unmap_rbd_image, list_mapped_images,
    create_snapshot, list_snapshots
)
import simulation.simulation as simulation

block_bp = Blueprint("block", __name__, url_prefix="/api/block")


@block_bp.route("/images", methods=["GET"])
def api_list_images():
    """List RBD images"""
    try:
        if config.IS_SIMULATION:
            return jsonify({"images": simulation.get_mock_rbd_images()})
        result = list_rbd_images()
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception("list_rbd_images error")
        return jsonify({"error": str(e)}), 500


@block_bp.route("/images", methods=["POST"])
def api_create_image():
    """Create a new RBD image"""
    if config.IS_SIMULATION:
        data = request.json or {}
        name = data.get("name", "new-image")
        size = data.get("size", 100)
        log_activity("CREATE IMAGE", name, "success", f"{size}MB created", vault=False)
        return jsonify({"message": f"Image '{name}' ({size}MB) created"}), 201

    try:
        data = request.json or {}
        result = create_rbd_image(data.get("name", "new-image"), data.get("size", 100))
        return jsonify(result), 201 if "error" not in result else 500
    except Exception as e:
        logger.exception("create_rbd_image error")
        return jsonify({"error": str(e)}), 500


@block_bp.route("/images/<name>", methods=["DELETE"])
def api_delete_image(name):
    """Delete an RBD image"""
    if config.IS_SIMULATION:
        log_activity("DELETE IMAGE", name, "success", "Simulation mode")
        return jsonify({"message": f"Image '{name}' deleted"})

    try:
        result = delete_rbd_image(name)
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception(f"delete_rbd_image error for {name}")
        return jsonify({"error": str(e)}), 500


@block_bp.route("/images/<name>/map", methods=["POST"])
def api_map_image(name):
    """Map an RBD image"""
    if config.IS_SIMULATION:
        log_activity("MAP IMAGE", name, "success", "Device: /dev/rbd0")
        return jsonify({"message": f"'{name}' mapped to /dev/rbd0", "device": "/dev/rbd0"})

    try:
        result = map_rbd_image(name)
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception(f"map_rbd_image error for {name}")
        return jsonify({"error": str(e)}), 500


@block_bp.route("/images/<name>/unmap", methods=["POST"])
def api_unmap_image(name):
    """Unmap an RBD image"""
    if config.IS_SIMULATION:
        log_activity("UNMAP IMAGE", name, "success", "Simulation mode")
        return jsonify({"message": f"'{name}' unmapped"})

    try:
        result = unmap_rbd_image(name)
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception(f"unmap_rbd_image error for {name}")
        return jsonify({"error": str(e)}), 500


@block_bp.route("/mapped", methods=["GET"])
def api_list_mapped():
    """List mapped RBD images"""
    try:
        if config.IS_SIMULATION:
            return jsonify({"mapped": simulation.get_mock_mapped_images()})
        result = list_mapped_images()
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception("list_mapped_images error")
        return jsonify({"error": str(e)}), 500


@block_bp.route("/images/<name>/snapshot", methods=["POST"])
def api_create_snapshot(name):
    """Create an RBD snapshot"""
    if config.IS_SIMULATION:
        data = request.json or {}
        snap_name = data.get("snap_name", f"snap-{name}")
        log_activity("SNAPSHOT", f"{name}@{snap_name}", "success", "Simulation mode")
        return jsonify({"message": f"Snapshot '{snap_name}' created for '{name}'"})

    try:
        data = request.json or {}
        snap_name = data.get("snap_name", f"snap-{name}")
        result = create_snapshot(name, snap_name)
        return jsonify(result), 201 if "error" not in result else 500
    except Exception as e:
        logger.exception(f"create_snapshot error for {name}")
        return jsonify({"error": str(e)}), 500


@block_bp.route("/images/<name>/snapshots", methods=["GET"])
def api_list_snapshots(name):
    """List snapshots for an RBD image"""
    try:
        if config.IS_SIMULATION:
            return jsonify({"snapshots": []})
        result = list_snapshots(name)
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception(f"list_snapshots error for {name}")
        return jsonify({"error": str(e)}), 500