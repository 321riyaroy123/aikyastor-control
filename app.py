"""
app.py - AiKyaStor CONTROL Backend
Refactored with modular functionality and simulation mode support
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import io
from dotenv import load_dotenv

load_dotenv()  # ensure environment vars from .env are available

# ─── Configuration & Setup ────────────────────────────────────────────────────
import config
from logger import logger
from activity import log_activity, get_activity_log, get_activity_stats
from ceph_ops import get_cluster_stats, get_cluster_health, get_ceph_version
from object_storage import (
    list_buckets, list_bucket_objects, create_bucket, delete_bucket,
    upload_object, delete_object, list_rgw_users, get_object
)
from block_storage import (
    list_rbd_images, create_rbd_image, delete_rbd_image, 
    map_rbd_image, unmap_rbd_image, list_mapped_images,
    create_snapshot, list_snapshots
)
from file_storage import (
    browse_directory, upload_file, download_file, delete_file_or_dir,
    create_directory, get_directory_stats
)
from vault_ops import (
    get_vault_status, start_bucket_sync_background, start_rbd_export_background,
    start_cephfs_sync_background
)
import simulation

# ─── Initialize Flask App ─────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

logger.info(f"Starting AiKyaStor CONTROL in {config.get_app_mode()} mode")

# ═════════════════════════════════════════════════════════════════════════════
# ACTIVITY LOG ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/api/activity", methods=["GET"])
def get_activity():
    """Get activity log"""
    try:
        log_data = get_activity_log()
        return jsonify({"log": log_data})
    except Exception as e:
        logger.exception("get_activity error")
        return jsonify({"error": str(e)}), 500

@app.route("/api/activity/stats", methods=["GET"])
def activity_stats():
    """Get activity statistics"""
    try:
        stats = get_activity_stats()
        return jsonify(stats)
    except Exception as e:
        logger.exception("activity_stats error")
        return jsonify({"error": str(e)}), 500

# ═════════════════════════════════════════════════════════════════════════════
# CLUSTER STATS & HEALTH
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/api/stats", methods=["GET"])
def cluster_stats():
    """Get cluster statistics"""
    try:
        if config.IS_SIMULATION:
            return jsonify(simulation.get_mock_stats())
        return jsonify(get_cluster_stats())
    except Exception as e:
        logger.exception("cluster_stats error")
        return jsonify({"error": str(e)}), 500

@app.route("/api/health", methods=["GET"])
def cluster_health():
    """Get cluster health status"""
    try:
        if config.IS_SIMULATION:
            return jsonify(simulation.get_mock_health())
        return jsonify(get_cluster_health())
    except Exception as e:
        logger.exception("cluster_health error")
        return jsonify({"error": str(e)}), 500

@app.route("/api/version", methods=["GET"])
def ceph_version():
    """Get Ceph version"""
    try:
        if config.IS_SIMULATION:
            return jsonify({"version": "17.2.5 (quincy)"})
        return jsonify({"version": get_ceph_version()})
    except Exception as e:
        logger.exception("ceph_version error")
        return jsonify({"error": str(e)}), 500

# ═════════════════════════════════════════════════════════════════════════════
# VAULT STATUS
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/api/vault/status", methods=["GET"])
def vault_status():
    """Get vault status"""
    try:
        if config.IS_SIMULATION:
            return jsonify(simulation.get_mock_vault())
        return jsonify(get_vault_status())
    except Exception as e:
        logger.exception("vault_status error")
        return jsonify({"error": str(e)}), 500

# ═════════════════════════════════════════════════════════════════════════════
# OBJECT STORAGE (RGW / S3)
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/api/object/buckets", methods=["GET"])
def api_list_buckets():
    """List all S3 buckets"""
    try:
        if config.IS_SIMULATION:
            return jsonify({"buckets": simulation.get_mock_buckets()})
        result = list_buckets()
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception("list_buckets error")
        return jsonify({"error": str(e)}), 500

@app.route("/api/object/buckets/<bucket>/objects", methods=["GET"])
def api_list_objects(bucket):
    """List objects in a bucket"""
    try:
        if config.IS_SIMULATION:
            return jsonify({"bucket": bucket, "objects": simulation.get_mock_objects(bucket)})
        result = list_bucket_objects(bucket)
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception(f"list_objects error for {bucket}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/object/buckets/<bucket>/upload", methods=["POST"])
def api_upload_object(bucket):
    """Upload an object to a bucket"""
    if config.IS_SIMULATION:
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400
        f = request.files["file"]
        to_vault = request.form.get("vault") == "true"
        log_activity("UPLOAD", f"{bucket}/{f.filename}", "success", "Simulation mode")
        message = f"'{f.filename}' uploaded to '{bucket}'"
        if to_vault:
            log_activity("VAULT SYNC", f"{bucket}/{f.filename}", "success",
                         f"Copied to /vault/object/{bucket}/", vault=True)
            message += " (Vault sync started in background)"
        return jsonify({"message": message}), 201

    try:
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400
        f = request.files["file"]
        to_vault = request.form.get("vault") == "true"
        file_content = f.read()
        result = upload_object(bucket, f.filename, file_content, to_vault)
        return jsonify(result), 201 if "error" not in result else 500
    except Exception as e:
        logger.exception(f"upload_object error for {bucket}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/object/buckets/<bucket>/objects/<path:key>", methods=["DELETE"])
def api_delete_object(bucket, key):
    """Delete an object from a bucket"""
    if config.IS_SIMULATION:
        log_activity("DELETE OBJECT", f"{bucket}/{key}", "success", "Simulation mode")
        return jsonify({"message": f"'{key}' deleted from '{bucket}'"})

    try:
        result = delete_object(bucket, key)
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception(f"delete_object error for {bucket}/{key}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/object/buckets/<bucket>/objects/<path:key>", methods=["GET"])
def api_download_object(bucket, key):
    """Download an object (streamed), matching original app's behavior"""
    if config.IS_SIMULATION:
        return jsonify({"error": "Download not available in simulation mode"}), 501

    try:
        result = get_object(bucket, key)
        if "error" in result:
            return jsonify({"error": result["error"]}), 500
        return send_file(
            io.BytesIO(result["body"].read()),
            download_name=key,
            as_attachment=True,
            mimetype=result.get("content_type")
        )
    except Exception as e:
        logger.exception(f"download_object error for {bucket}/{key}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/object/buckets", methods=["POST"])
def api_create_bucket():
    """Create a new bucket"""
    if config.IS_SIMULATION:
        data = request.json or {}
        bucket = data.get("bucket", "new-bucket")
        log_activity("CREATE BUCKET", bucket, "success", "Simulation mode")
        return jsonify({"message": f"Bucket '{bucket}' created"}), 201
    
    try:
        data = request.json or {}
        bucket = data.get("bucket", "").strip()
        if not bucket:
            return jsonify({"error": "Bucket name is required"}), 400

        result = create_bucket(
            bucket,
            data.get("owner", "").strip(),
            data.get("acl", "private"),
            data.get("versioning", False),
            data.get("object_locking", data.get("obj_lock", False))
        )
        if "error" in result:
            status = 409 if "already exists" in result["error"] else 500
            return jsonify(result), status
        return jsonify(result), 201
    except Exception as e:
        logger.exception("create_bucket error")
        return jsonify({"error": str(e)}), 500

@app.route("/api/object/buckets/<bucket>", methods=["DELETE"])
def api_delete_bucket(bucket):
    """Delete a bucket"""
    if config.IS_SIMULATION:
        log_activity("DELETE BUCKET", bucket, "success", "Simulation mode")
        return jsonify({"message": f"Bucket '{bucket}' deleted"})
    
    try:
        result = delete_bucket(bucket)
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception(f"delete_bucket error for {bucket}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/object/users", methods=["GET"])
def api_list_rgw_users():
    """List RGW users"""
    try:
        if config.IS_SIMULATION:
            return jsonify({"users": simulation.get_mock_rgw_users()})
        result = list_rgw_users()
        return jsonify(result), 200 if "error" not in result else 500
    except Exception as e:
        logger.exception("list_rgw_users error")
        return jsonify({"error": str(e)}), 500

# ═════════════════════════════════════════════════════════════════════════════
# BLOCK STORAGE (RBD)
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/api/block/images", methods=["GET"])
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

@app.route("/api/block/images", methods=["POST"])
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

@app.route("/api/block/images/<name>", methods=["DELETE"])
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

@app.route("/api/block/images/<name>/map", methods=["POST"])
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

@app.route("/api/block/images/<name>/unmap", methods=["POST"])
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

@app.route("/api/block/mapped", methods=["GET"])
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

@app.route("/api/block/images/<name>/snapshot", methods=["POST"])
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

@app.route("/api/block/images/<name>/snapshots", methods=["GET"])
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

# ═════════════════════════════════════════════════════════════════════════════
# FILE STORAGE (CephFS)
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/api/file/browse", methods=["GET"])
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

@app.route("/api/file/upload", methods=["POST"])
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

@app.route("/api/file/download", methods=["GET"])
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

@app.route("/api/file/delete", methods=["DELETE"])
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

@app.route("/api/file/mkdir", methods=["POST"])
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

@app.route("/api/file/stats", methods=["GET"])
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

# ═════════════════════════════════════════════════════════════════════════════
# VAULT OPERATIONS
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/api/object/buckets/<bucket>/sync-vault", methods=["POST"])
def api_sync_bucket(bucket):
    """Sync bucket to vault"""
    if config.IS_SIMULATION:
        log_activity("VAULT SYNC (Bucket)", bucket, "info", "Simulation mode", vault=True)
        return jsonify({"message": f"Bucket '{bucket}' → Vault sync started"})
    
    try:
        result = start_bucket_sync_background(
            bucket,
            config.CEPH_ACCESS_KEY,
            config.CEPH_SECRET_KEY,
            config.CEPH_RGW_ENDPOINT,
            config.CEPH_REGION
        )
        return jsonify(result)
    except Exception as e:
        logger.exception(f"sync_bucket error for {bucket}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/block/images/<name>/export-vault", methods=["POST"])
def api_export_rbd(name):
    """Export RBD image to vault"""
    if config.IS_SIMULATION:
        log_activity("VAULT EXPORT (RBD)", name, "info", "Simulation mode", vault=True)
        return jsonify({"message": f"RBD export of '{name}' to Vault started"})
    
    try:
        result = start_rbd_export_background(name, config.RBD_POOL)
        return jsonify(result)
    except Exception as e:
        logger.exception(f"export_rbd error for {name}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/file/sync-vault", methods=["POST"])
def api_sync_cephfs():
    """Sync CephFS to vault"""
    if config.IS_SIMULATION:
        log_activity("VAULT SYNC (CephFS)", "entire mount", "info", "Simulation mode", vault=True)
        return jsonify({"message": "CephFS → Vault sync started"})
    
    try:
        result = start_cephfs_sync_background(config.CEPHFS_MOUNT)
        return jsonify(result)
    except Exception as e:
        logger.exception("sync_cephfs error")
        return jsonify({"error": str(e)}), 500

# ═════════════════════════════════════════════════════════════════════════════
# INFO & STATUS
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/api/info", methods=["GET"])
def app_info():
    """Get application info"""
    return jsonify({
        "app": "AiKyaStor CONTROL",
        "version": "1.0.0",
        "mode": config.get_app_mode(),
        "ceph_version": get_ceph_version() if not config.IS_SIMULATION else "17.2.5 (quincy)"
    })

@app.route("/", methods=["GET"])
def serve_frontend():
    """Serve frontend"""
    frontend_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'index.html')
    if os.path.exists(frontend_path):
        return send_file(frontend_path)
    return jsonify({"message": "AiKyaStor CONTROL Backend API"}), 200

# ═════════════════════════════════════════════════════════════════════════════
# ERROR HANDLERS
# ═════════════════════════════════════════════════════════════════════════════

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({"error": "Not found"}), 404

@app.errorhandler(500)
def server_error(error):
    """Handle 500 errors"""
    logger.exception("Server error")
    return jsonify({"error": "Internal server error"}), 500

# ═════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    app.run(
        host=config.FLASK_HOST,
        port=config.FLASK_PORT,
        debug=config.FLASK_DEBUG
    )
