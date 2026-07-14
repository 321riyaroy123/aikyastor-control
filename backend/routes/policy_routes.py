"""
routes/policy_routes.py - Retention / Lifecycle Policy Blueprint

Moved from: app.py
    - GET    /api/policies
    - GET    /api/object/buckets/<bucket>/policy
    - PUT    /api/object/buckets/<bucket>/policy
    - POST   /api/policies
    - DELETE /api/policies/<policy_id>
    - GET    /api/policies/<policy_id>/usage
    - POST   /api/policies/run

Responsibility:
    Thin HTTP layer for the lifecycle-policy system. In simulation mode,
    delegates to simulation.simulation (which owns MOCK_BUCKET_SETTINGS /
    MOCK_POLICIES and the mock lifecycle engine). In production mode,
    delegates to services.object.policy_manager.get_all_policies().
    
"""

from flask import Blueprint, request, jsonify
import config.config as config
from services.object.lifecycle_engine import run_lifecycle_engine
from services.object.policy_manager import get_all_policies, create_policy, delete_policy, get_policy_usage
from services.object.object_storage import get_bucket_policy, assign_bucket_policy
import simulation.simulation as simulation

policy_bp = Blueprint("policy", __name__, url_prefix="/api")

@policy_bp.route("/policies")
def api_policies():
    if config.IS_SIMULATION:
        return jsonify({
            "policies": simulation.get_policies()
        })

    return jsonify({
        "policies": get_all_policies()
    })


@policy_bp.route("/object/buckets/<bucket>/policy")
def api_bucket_policy(bucket):
    if config.IS_SIMULATION:
        return jsonify(
            simulation.get_bucket_policy(bucket)
        )
    return jsonify(get_bucket_policy(bucket))
    
@policy_bp.route("/object/buckets/<bucket>/policy", methods=["PUT"])
def api_update_bucket_policy(bucket):
    data = request.json or {}
    lifecycle = data.get("lifecycle")

    if config.IS_SIMULATION:
        return jsonify(
            simulation.assign_bucket_policy(
                bucket,
                lifecycle
            )
        )

    return jsonify(
        assign_bucket_policy(
            bucket,
            lifecycle
        )
    )

@policy_bp.route("/policies", methods=["POST"])
def api_create_policy():
    data = request.get_json()

    if config.IS_SIMULATION:
        result = simulation.create_policy(
                name=data["name"],
                expire_days=data.get("expire_days"),
                expire_hours=data.get("expire_hours")
            )
    else:
        result = create_policy(
            name=data["name"],
            expire_days=data.get("expire_days"),
            expire_hours=data.get("expire_hours")
        )

    if "error" in result:
        return jsonify(result), 400

    return jsonify(result), 201

@policy_bp.route("/policies/<policy_id>", methods=["DELETE"])
def api_delete_policy(policy_id):
    if config.IS_SIMULATION:
        return jsonify(
            simulation.delete_policy(policy_id)
        )
    else:
        result = delete_policy(policy_id)

    if "error" in result:
        return jsonify(result), 400

    return jsonify(result)

@policy_bp.route("/policies/<policy_id>/usage")
def policy_usage(policy_id):
    if config.IS_SIMULATION:
        return jsonify(
            simulation.get_policy_usage(policy_id)
        )
    return jsonify(get_policy_usage(policy_id))


@policy_bp.route("/policies/run", methods=["POST"])
def run_policy_engine():
    if config.IS_SIMULATION:
        return jsonify(simulation.run_lifecycle_engine())

    return jsonify(run_lifecycle_engine())