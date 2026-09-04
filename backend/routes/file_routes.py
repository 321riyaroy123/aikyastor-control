"""
routes/file_routes.py - File Storage (CephFS) Blueprint

Moved from: app.py
    - GET    /api/file/browse
    - POST   /api/file/upload
    - GET    /api/file/download
    - DELETE /api/file/delete
    - POST   /api/file/mkdir
    - GET    /api/file/stats

Responsibility:
    Thin HTTP layer only — validate input, branch on
    config.IS_SIMULATION, call services.file.file_storage, return JSON
    (or a streamed file for downloads). File-to-vault sync-on-upload is
    triggered inside file_storage.upload_file(); the bulk
    /api/file/sync-vault endpoint lives in vault_routes.py.
"""

import re
from flask import Blueprint, request, jsonify, send_file
import config.config as config
from core.logger import logger
from core.activity import log_activity
from services.file.file_storage import (
    browse_directory, upload_file, download_file, delete_file_or_dir,
    create_directory, get_directory_stats
)
from services.file.cephfs_mount import get_mount_status, get_saved_config, test_connection, mount_cephfs, unmount_cephfs, list_filesystems
import simulation.simulation as simulation

file_bp = Blueprint("file", __name__, url_prefix="/api/file")

_CEPHFS_NAME_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
_CEPHFS_USER_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
_MONITOR_RE = re.compile(r"^[A-Za-z0-9_.:\[\],/-]+$")
_MOUNT_POINT_RE = re.compile(r"^/[^/].*$")

def _get_cephfs_config():
    data = request.get_json(silent=True) or {}

    filesystem = str(data.get("filesystem", "")).strip()
    user = str(data.get("user", "")).strip()
    monitors = str(data.get("monitors", "")).strip()
    mount_point = str(data.get("mount_point", "")).strip()

    if not filesystem or not _CEPHFS_NAME_RE.fullmatch(filesystem):
        return None, "Invalid filesystem"

    if not user or not _CEPHFS_USER_RE.fullmatch(user):
        return None, "Invalid user"

    if not monitors or not _MONITOR_RE.fullmatch(monitors):
        return None, "Invalid monitor addresses"

    if not mount_point or not _MOUNT_POINT_RE.fullmatch(mount_point):
        return None, "Invalid mount point"

    if mount_point == "/":
        return None, "Mount point cannot be /"

    return {
        "filesystem": filesystem,
        "user": user,
        "monitors": monitors,
        "mount_point": mount_point,
    }, None

# ─── CephFS Mount Management ──────────────────────────────────────────────────

@file_bp.route("/cephfs/filesystems", methods=["GET"])
def api_cephfs_filesystems():
    """Return the CephFS filesystems visible to the configured user."""
    try:
        result = list_filesystems()

        if not result.get("success"):
            return jsonify(result), 500

        return jsonify(result), 200

    except Exception as e:
        logger.exception("cephfs_filesystems error")
        return jsonify({"error": str(e)}), 500

@file_bp.route("/cephfs/status", methods=["GET"])
def api_cephfs_status():
    """Return CephFS configuration and current mount status."""
    try:
        result = get_mount_status()
        return jsonify(result), 200
    except Exception as e:
        logger.exception("cephfs_status error")
        return jsonify({"error": str(e)}), 500

@file_bp.route("/cephfs/config", methods=["GET"])
def api_cephfs_config():
    """Return saved non-sensitive CephFS configuration."""
    try:
        filesystem = request.args.get("filesystem", "").strip()

        if filesystem:
            result = get_saved_config(filesystem)

            if result is None:
                return jsonify({
                    "configured": False,
                    "filesystem": filesystem,
                }), 404

            return jsonify({
                "configured": True,
                **result,
            }), 200

        result = get_mount_status()

        return jsonify({
            "configured": result["configured"],
            "filesystem": result["filesystem"],
            "user": result["user"],
            "monitors": result["monitors"],
            "mount_point": result["mount_point"],
            "mounted": result["mounted"],
        }), 200

    except Exception as e:
        logger.exception("cephfs_config error")
        return jsonify({"error": str(e)}), 500
    
@file_bp.route("/cephfs/test", methods=["POST"])
def api_cephfs_test():
    """Test the supplied CephFS configuration."""

    if config.IS_SIMULATION:
        return jsonify({
            "success": False,
            "error": "CephFS mount management is unavailable in simulation mode",
        }), 409

    try:
        cephfs_config, error = _get_cephfs_config()

        if error:
            return jsonify({
                "success": False,
                "error": error,
            }), 400

        result = test_connection(
            filesystem=cephfs_config["filesystem"],
            user=cephfs_config["user"],
            monitors=cephfs_config["monitors"],
        )

        return jsonify(result), 200 if result.get("success") else 500

    except Exception as e:
        logger.exception("cephfs_test error")
        return jsonify({"error": str(e)}), 500

@file_bp.route("/cephfs/mount", methods=["POST"])
def api_cephfs_mount():
    """Mount CephFS using the supplied configuration."""
    if config.IS_SIMULATION:
        return jsonify({
            "success": False,
            "error": "CephFS mount management is unavailable in simulation mode",
        }), 409

    try:
        cephfs_config, error = _get_cephfs_config()

        if error:
            return jsonify({
                "success": False,
                "error": error,
            }), 400

        result = mount_cephfs(
            filesystem=cephfs_config["filesystem"],
            user=cephfs_config["user"],
            monitors=cephfs_config["monitors"],
            mount_point=cephfs_config["mount_point"],
        )

        return jsonify(result), 200 if result.get("success") else 500

    except Exception as e:
        logger.exception("cephfs_mount error")
        return jsonify({"error": str(e)}), 500

@file_bp.route("/cephfs/unmount", methods=["POST"])
def api_cephfs_unmount():
    try:
        result = unmount_cephfs()

        if not result.get("success"):
            return jsonify(result), 500

        return jsonify(result), 200

    except Exception as e:
        logger.exception("cephfs_unmount error")
        return jsonify({"error": str(e)}), 500
        
@file_bp.route("/browse", methods=["GET"])
def api_browse():
    """Browse CephFS directory"""
    try:
        rel_path = request.args.get("path", "")
        if config.IS_SIMULATION:
            return jsonify({
                "path": rel_path,
                "entries": simulation.get_mock_cephfs_directory(rel_path)
            })
        result = browse_directory(rel_path)
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception("browse_directory error")
        return jsonify({"error": str(e)}), 500


@file_bp.route("/upload", methods=["POST"])
def api_upload():
    """Upload a file to CephFS"""
    if config.IS_SIMULATION:
        rel_path = request.form.get("path", "")
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400
        f = request.files["file"]
        to_vault = request.form.get("vault") == "true"
        log_activity("UPLOAD (CephFS)", f"{rel_path or '/'}/{f.filename}", "success", "Simulation mode")
        message = f"'{f.filename}' uploaded to CephFS:{rel_path or '/'}"
        if to_vault:
            log_activity("VAULT SYNC (CephFS)", f.filename, "success",
                         f"rsync → /vault/file/{rel_path or 'root'}/", vault=True)
            message += " (Vault sync started in background)"
        return jsonify({"message": message})

    try:
        rel_path = request.form.get("path", "")
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400
        f = request.files["file"]
        to_vault = request.form.get("vault") == "true"
        result = upload_file(rel_path, f.filename, f.read(), to_vault)
        return jsonify(result), 201 if "error" not in result else 500
    except Exception as e:
        logger.exception("upload_file error")
        return jsonify({"error": str(e)}), 500


@file_bp.route("/download", methods=["GET"])
def api_download():
    """Download a file from CephFS"""
    try:
        rel_path = request.args.get("path", "")
        result = download_file(rel_path)
        if "error" in result:
            return jsonify(result), 404
        return send_file(result["file_path"], as_attachment=True, download_name=result["filename"])
    except Exception as e:
        logger.exception("download_file error")
        return jsonify({"error": str(e)}), 500


@file_bp.route("/delete", methods=["DELETE"])
def api_delete_file():
    """Delete a file or directory"""
    if config.IS_SIMULATION:
        rel_path = request.args.get("path", "")
        log_activity("DELETE (CephFS)", rel_path, "success", "Simulation mode")
        return jsonify({"message": f"'{rel_path}' deleted from CephFS"})

    try:
        rel_path = request.args.get("path", "")
        result = delete_file_or_dir(rel_path)
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception("delete_file_or_dir error")
        return jsonify({"error": str(e)}), 500


@file_bp.route("/mkdir", methods=["POST"])
def api_mkdir():
    """Create a directory"""
    if config.IS_SIMULATION:
        data = request.json or {}
        rel_path = data.get("path", "")
        log_activity("MKDIR (CephFS)", rel_path, "success", "Simulation mode")
        return jsonify({"message": f"Directory '{rel_path}' created"})

    try:
        data = request.json or {}
        rel_path = data.get("path", "")
        result = create_directory(rel_path)
        return jsonify(result), 201 if "error" not in result else 500
    except Exception as e:
        logger.exception("create_directory error")
        return jsonify({"error": str(e)}), 500


@file_bp.route("/stats", methods=["GET"])
def api_file_stats():
    """Get directory statistics"""
    try:
        rel_path = request.args.get("path", "")
        if config.IS_SIMULATION:
            return jsonify({"path": rel_path, "total_size": 0, "file_count": 0, "dir_count": 0})
        result = get_directory_stats(rel_path)
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception("get_directory_stats error")
        return jsonify({"error": str(e)}), 500