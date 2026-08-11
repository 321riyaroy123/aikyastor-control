"""
routes/lifecycle_policy_routes.py - Lifecycle / Retention Policy Blueprint

Renamed from routes/policy_routes.py (blueprint policy_bp -> 
lifecycle_policy_bp) to make explicit that every route here concerns
LIFECYCLE (retention/expiration) policies — bucket ACCESS policies live in
routes/object_routes.py (/api/object/buckets/<bucket>/policy, backed by
services/object/bucket_policy.py).

Moved from: app.py
    - GET    /api/policies
    - GET    /api/object/buckets/<bucket>/lifecycle
    - PUT    /api/object/buckets/<bucket>/lifecycle
    - DELETE /api/object/buckets/<bucket>/lifecycle
    - POST   /api/policies
    - DELETE /api/policies/<policy_id>
    - GET    /api/policies/<policy_id>/usage
    - POST   /api/policies/run

Responsibility:
    Thin HTTP layer for the lifecycle-policy system. In simulation mode,
    delegates to simulation.simulation (which owns MOCK_BUCKET_SETTINGS /
    MOCK_LIFECYCLE_POLICIES and the mock lifecycle engine). In production
    mode, delegates to
    services.object.lifecycle_policy_manager.get_all_lifecycle_policies().
"""

from flask import Blueprint, request, jsonify
import config.config as config
from services.object.lifecycle_engine import run_lifecycle_engine
from services.object.lifecycle_policy_manager import (
    get_all_lifecycle_policies, create_lifecycle_policy,
    delete_lifecycle_policy, get_lifecycle_policy_usage
)
from services.object.object_storage import get_bucket_lifecycle, assign_bucket_lifecycle, delete_bucket_lifecycle
import simulation.simulation as simulation

lifecycle_policy_bp = Blueprint("lifecycle_policy", __name__, url_prefix="/api")

@lifecycle_policy_bp.route("/policies")
def api_policies():
    if config.IS_SIMULATION:
        return jsonify({
            "policies": simulation.get_lifecycle_policies()
        })

    return jsonify({
        "policies": get_all_lifecycle_policies()
    })

@lifecycle_policy_bp.route(
    "/object/buckets/<bucket>/lifecycle",
    methods=["GET"]
)
def api_bucket_lifecycle(bucket):
    if config.IS_SIMULATION:
        return jsonify(
            simulation.get_bucket_lifecycle(bucket)
        )

    result = get_bucket_lifecycle(bucket)

    return jsonify(result), (
        200 if "error" not in result else 500
    )
    
@lifecycle_policy_bp.route(
    "/object/buckets/<bucket>/lifecycle",
    methods=["PUT"]
)
def api_update_bucket_lifecycle(bucket):
    data = request.get_json(silent=True) or {}

    lifecycle = data.get("lifecycle")

    if not lifecycle:
        return jsonify({
            "error": "Lifecycle policy is required."
        }), 400

    if config.IS_SIMULATION:
        result = simulation.assign_bucket_lifecycle(
            bucket,
            lifecycle
        )
    else:
        result = assign_bucket_lifecycle(
            bucket,
            lifecycle
        )

    return jsonify(result), (
        200 if "error" not in result else 400
    )

@lifecycle_policy_bp.route(
    "/object/buckets/<bucket>/lifecycle",
    methods=["DELETE"]
)
def api_delete_bucket_lifecycle(bucket):

    if config.IS_SIMULATION:
        result = simulation.assign_bucket_lifecycle(
            bucket,
            "none"
        )
    else:
        result = delete_bucket_lifecycle(bucket)

    return jsonify(result), (
        200 if "error" not in result else 500
    )

@lifecycle_policy_bp.route("/policies", methods=["POST"])
def api_create_lifecycle_policy():
    data = request.get_json()

    if config.IS_SIMULATION:
        result = simulation.create_lifecycle_policy(
                name=data["name"],
                expire_days=data.get("expire_days"),
            )
    else:
        result = create_lifecycle_policy(
            name=data["name"],
            expire_days=data.get("expire_days"),
        )

    if "error" in result:
        return jsonify(result), 400

    return jsonify(result), 201

@lifecycle_policy_bp.route("/policies/<policy_id>", methods=["DELETE"])
def api_delete_lifecycle_policy(policy_id):
    if config.IS_SIMULATION:
        return jsonify(
            simulation.delete_lifecycle_policy(policy_id)
        )
    else:
        result = delete_lifecycle_policy(policy_id)

    if "error" in result:
        return jsonify(result), 400

    return jsonify(result)

@lifecycle_policy_bp.route("/policies/<policy_id>/usage")
def lifecycle_policy_usage(policy_id):
    if config.IS_SIMULATION:
        return jsonify(
            simulation.get_lifecycle_policy_usage(policy_id)
        )
    return jsonify(get_lifecycle_policy_usage(policy_id))


@lifecycle_policy_bp.route("/policies/run", methods=["POST"])
def run_lifecycle_policy_engine():
    if config.IS_SIMULATION:
        return jsonify(
            simulation.run_lifecycle_engine()
        )

    return jsonify({
        "message": (
            "Native Ceph RGW lifecycle processing is enabled. "
            "No application-side lifecycle engine is required."
        )
    })