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
import os
from flask import send_file, after_this_request
from flask import Blueprint, Response, stream_with_context, request, jsonify
import config.config as config
from core.logger import logger
from core.activity import log_activity
from services.block.block_storage import (
    list_rbd_images, create_rbd_image, delete_rbd_image,
    map_rbd_image, unmap_rbd_image, list_mapped_images,
    create_snapshot, list_snapshots, export_snapshot, delete_snapshot,
    list_rbd_pools, create_rbd_pool, stream_snapshot_export
)
import simulation.simulation as simulation

block_bp = Blueprint("block", __name__, url_prefix="/api/block")

@block_bp.route("/pools", methods=["GET"])
def api_list_rbd_pools():
    """List RBD pools."""

    try:
        if config.IS_SIMULATION:
            return jsonify({
                "pools": ["rbd"]
            })

        result = list_rbd_pools()

        return jsonify(result), (
            200 if "error" not in result else 500
        )

    except Exception as e:
        logger.exception("list_rbd_pools error")

        return jsonify({
            "error": str(e)
        }), 500

@block_bp.route("/pools", methods=["POST"])
def api_create_rbd_pool():
    """Create and initialize an RBD pool."""

    try:
        data = request.json or {}

        name = data.get("name", "")

        if config.IS_SIMULATION:
            name = name.strip()

            if not name:
                return jsonify({
                    "error": "Pool name is required"
                }), 400

            log_activity(
                "CREATE RBD POOL",
                name,
                "success",
                "Simulation mode"
            )

            return jsonify({
                "message": (
                    f"RBD pool '{name}' "
                    "created and initialized"
                )
            }), 201

        result = create_rbd_pool(name)

        return jsonify(result), (
            201 if "error" not in result else 500
        )

    except Exception as e:
        logger.exception("create_rbd_pool error")

        return jsonify({
            "error": str(e)
        }), 500

@block_bp.route("/images", methods=["GET"])
def api_list_images():
    try:
        pool = request.args.get("pool") or config.RBD_POOL

        if config.IS_SIMULATION:
            return jsonify({
                "images": simulation.get_mock_rbd_images()
            })

        result = list_rbd_images(pool)

        return jsonify(result), (
            200 if "error" not in result else 500
        )

    except Exception as e:
        logger.exception("list_rbd_images error")

        return jsonify({
            "error": str(e)
        }), 500

@block_bp.route("/images", methods=["POST"])
def api_create_image():
    try:
        data = request.json or {}

        name = data.get("name", "new-image")
        size = data.get("size", 100)
        pool = data.get("pool") or config.RBD_POOL

        if config.IS_SIMULATION:
            log_activity(
                "CREATE IMAGE",
                f"{pool}/{name}",
                "success",
                f"{size}MB created",
                vault=False,
            )

            return jsonify({
                "message": (
                    f"Image '{name}' created "
                    f"in pool '{pool}'"
                )
            }), 201

        result = create_rbd_image(
            name,
            size,
            pool,
        )

        return jsonify(result), (
            201 if "error" not in result else 500
        )

    except Exception as e:
        logger.exception("create_rbd_image error")

        return jsonify({
            "error": str(e)
        }), 500

@block_bp.route("/images/<name>", methods=["DELETE"])
def api_delete_image(name):
    """Delete an RBD image"""
    pool = request.args.get("pool") or config.RBD_POOL
    if config.IS_SIMULATION:
        log_activity("DELETE IMAGE", f"{pool}/{name}", "success", "Simulation mode")
        return jsonify({"message": f"Image '{name}' deleted"})

    try:
        result = delete_rbd_image(name, pool)
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception(f"delete_rbd_image error for {name}")
        return jsonify({"error": str(e)}), 500


@block_bp.route("/images/<name>/map", methods=["POST"])
def api_map_image(name):
    """Map an RBD image"""
    pool = request.args.get("pool") or config.RBD_POOL
    if config.IS_SIMULATION:
        log_activity("MAP IMAGE", f"{pool}/{name}", "success", "Device: /dev/rbd0")
        return jsonify({"message": f"'{name}' mapped to /dev/rbd0", "device": "/dev/rbd0"})

    try:
        result = map_rbd_image(name, pool)
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception(f"map_rbd_image error for {name}")
        return jsonify({"error": str(e)}), 500


@block_bp.route("/images/<name>/unmap", methods=["POST"])
def api_unmap_image(name):
    """Unmap an RBD image"""
    pool = request.args.get("pool") or config.RBD_POOL
    if config.IS_SIMULATION:
        log_activity("UNMAP IMAGE", f"{pool}/{name}", "success", "Simulation mode")
        return jsonify({"message": f"'{name}' unmapped"})

    try:
        result = unmap_rbd_image(name, pool)
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
    data = request.json or {}
    snap_name = data.get("snap_name", f"snap-{name}")
    pool = data.get("pool") or config.RBD_POOL
    if config.IS_SIMULATION:
        log_activity("SNAPSHOT", f"{pool}/{name}@{snap_name}", "success", "Simulation mode")
        return jsonify({"message": f"Snapshot '{snap_name}' created for '{name}'"})

    try:
        result = create_snapshot(name, snap_name, pool)
        return jsonify(result), 201 if "error" not in result else 500
    except Exception as e:
        logger.exception(f"create_snapshot error for {name}")
        return jsonify({"error": str(e)}), 500

@block_bp.route(
    "/images/<image_name>/snapshots/<snapshot_name>",
    methods=["DELETE"],
)
def api_delete_snapshot(image_name, snapshot_name):
    try:
        pool = request.args.get("pool") or config.RBD_POOL

        result = delete_snapshot(
            image_name,
            snapshot_name,
            pool,
        )

        return jsonify(result), (
            200 if "error" not in result else 500
        )

    except Exception as e:
        logger.exception("delete_snapshot error")

        return jsonify({
            "error": str(e)
        }), 500

@block_bp.route("/images/<name>/snapshots", methods=["GET"])
def api_list_snapshots(name):
    """List snapshots for an RBD image"""
    try:
        pool = request.args.get("pool") or config.RBD_POOL
        if config.IS_SIMULATION:
            return jsonify({"snapshots": []})
        result = list_snapshots(name, pool)
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception(f"list_snapshots error for {name}")
        return jsonify({"error": str(e)}), 500

@block_bp.route(
    "/images/<image_name>/snapshots/<snapshot_name>/download",
    methods=["GET"]
)
def api_download_snapshot(image_name, snapshot_name):
    """
    Stream an RBD snapshot directly to the browser.
    """

    if config.IS_SIMULATION:
        return jsonify({
            "error": (
                "Snapshot download is not available "
                "in simulation mode"
            )
        }), 400

    try:
        pool = (
            request.args.get("pool")
            or config.RBD_POOL
        )

        process = stream_snapshot_export(
            image_name,
            snapshot_name,
            pool,
        )

        def generate():
            try:
                while True:
                    chunk = process.stdout.read(
                        1024 * 1024
                    )

                    if not chunk:
                        break

                    yield chunk

            finally:
                if process.stdout:
                    process.stdout.close()

                if process.poll() is None:
                    process.terminate()

                process.wait()

        filename = (
            f"{image_name}-{snapshot_name}.img"
        )

        response = Response(
            stream_with_context(generate()),
            mimetype="application/octet-stream",
        )

        response.headers[
            "Content-Disposition"
        ] = (
            f'attachment; filename="{filename}"'
        )

        return response

    except Exception as e:
        logger.exception(
            f"download_snapshot error for "
            f"{image_name}@{snapshot_name}"
        )

        return jsonify({
            "error": str(e)
        }), 500