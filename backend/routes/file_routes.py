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

from flask import Blueprint, request, jsonify, send_file
import config.config as config
from core.logger import logger
from core.activity import log_activity
from services.file.file_storage import (
    browse_directory, upload_file, download_file, delete_file_or_dir,
    create_directory, get_directory_stats
)
import simulation.simulation as simulation

file_bp = Blueprint("file", __name__, url_prefix="/api/file")


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