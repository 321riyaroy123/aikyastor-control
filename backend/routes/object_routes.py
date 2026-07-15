"""
routes/object_routes.py - Object Storage (RGW/S3) Blueprint

    - GET    /api/object/buckets
    - POST   /api/object/buckets
    - GET    /api/object/buckets/<bucket>/objects
    - POST   /api/object/buckets/<bucket>/upload
    - DELETE /api/object/buckets/<bucket>
    - GET    /api/object/buckets/<bucket>/objects/<key>
    - DELETE /api/object/buckets/<bucket>/objects/<key>
    - GET    /api/object/users
    - POST   /api/object/buckets/<bucket>/sync-vault

Responsibility:
    Thin HTTP layer only — parse request body/form/files, branch on
    config.IS_SIMULATION, call the object-storage and vault services,
    return JSON (or a streamed file for downloads). No boto3/S3 calls or
    business logic live here.
"""

import io
from flask import Blueprint, request, jsonify, send_file
import config.config as config
from core.logger import logger
from core.activity import log_activity
from services.object.object_storage import (
    list_buckets, list_bucket_objects, create_bucket, delete_bucket,
    upload_object, delete_object, list_rgw_users, get_object
)
from services.object.bucket_policy import get_bucket_policy, put_bucket_policy, delete_bucket_policy
from services.vault.vault_ops import start_bucket_sync_background
import simulation.simulation as simulation

object_bp = Blueprint("object", __name__, url_prefix="/api/object")

@object_bp.route("/buckets", methods=["GET"])
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
    
@object_bp.route("/buckets", methods=["POST"])
def api_create_bucket():
    """Create a new bucket"""
    if config.IS_SIMULATION:
        data = request.json or {}
        bucket = data.get("bucket", "new-bucket")
        lifecycle = data.get("lifecycle", "none")
        simulation.create_mock_bucket(bucket, lifecycle)
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
            data.get("object_locking", data.get("obj_lock", False)),
            data.get("lifecycle", None)
        )
        if "error" in result:
            status = 409 if "already exists" in result["error"] else 500
            return jsonify(result), status
        return jsonify(result), 201
    except Exception as e:
        logger.exception("create_bucket error")
        return jsonify({"error": str(e)}), 500

@object_bp.route("/buckets/<bucket>/objects", methods=["GET"])
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


@object_bp.route("/buckets/<bucket>/upload", methods=["POST"])
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

@object_bp.route("/buckets/<bucket>/objects/<path:key>", methods=["GET"])
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


@object_bp.route("/buckets/<bucket>/objects/<path:key>", methods=["DELETE"])
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
  

@object_bp.route("/buckets/<bucket>", methods=["DELETE"])
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


@object_bp.route("/users", methods=["GET"])
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


@object_bp.route("/buckets/<bucket>/sync-vault", methods=["POST"])
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
    
@object_bp.route("/buckets/<bucket>/policy", methods=["GET"])
def api_get_bucket_policy(bucket):
    """
    Retrieve the AWS S3 bucket policy attached to a bucket.
    """

    if config.IS_SIMULATION:
        policy = simulation.get_mock_bucket_policy(bucket)

        return jsonify({
            "bucket": bucket,
            "policy": policy
        })

    try:
        result = get_bucket_policy(bucket)
        return jsonify(result), 200 if "error" not in result else 500

    except Exception as e:
        logger.exception(
            f"get_bucket_policy error for {bucket}"
        )

        return jsonify({
            "error": str(e)
        }), 500
    
@object_bp.route("/buckets/<bucket>/policy", methods=["PUT"])
def api_put_bucket_policy(bucket):
    """
    Create or replace a bucket policy.
    """

    if config.IS_SIMULATION:
        data = request.json or {}

        simulation.set_mock_bucket_policy(
            bucket,
            data.get("policy")
        )

        log_activity(
            "BUCKET POLICY",
            bucket,
            "success",
            "Simulation mode"
        )

        return jsonify({
            "message": f"Bucket policy updated for '{bucket}'."
        })

    try:
        data = request.json or {}
        policy = data.get("policy")

        if not policy:
            return jsonify({
                "error": "Policy document is required."
            }), 400

        result = put_bucket_policy(bucket, policy)

        return jsonify(result), 200 if "error" not in result else 500

    except Exception as e:
        logger.exception(
            f"put_bucket_policy error for {bucket}"
        )

        return jsonify({
            "error": str(e)
        }), 500
    
@object_bp.route("/buckets/<bucket>/policy", methods=["DELETE"])
def api_delete_bucket_policy(bucket):
    """
    Remove a bucket policy.
    """

    if config.IS_SIMULATION:
        simulation.delete_mock_bucket_policy(bucket)

        log_activity(
            "DELETE BUCKET POLICY",
            bucket,
            "success",
            "Simulation mode"
        )

        return jsonify({
            "message": f"Bucket policy removed from '{bucket}'."
        })

    try:
        result = delete_bucket_policy(bucket)

        return jsonify(result), 200 if "error" not in result else 500

    except Exception as e:
        logger.exception(
            f"delete_bucket_policy error for {bucket}"
        )

        return jsonify({
            "error": str(e)
        }), 500