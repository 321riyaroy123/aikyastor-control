from flask import Blueprint, jsonify, request

from services.agent.agent_manager import manager

agent_bp = Blueprint("agent", __name__, url_prefix="/api/agent")


def _manager():
    # Import lazily so app startup can initialize the singleton first.
    from services.agent import agent_manager
    return agent_manager.manager


@agent_bp.get("/status")
def agent_status():
    return jsonify(_manager().status())


@agent_bp.post("/tasks")
def create_task():
    try:
        task = _manager().create_task(request.get_json(silent=True) or {})
        return jsonify(task), 202
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@agent_bp.get("/tasks")
def list_tasks():
    return jsonify({"tasks": _manager().list_tasks()})


@agent_bp.get("/tasks/<task_id>")
def get_task(task_id):
    task = _manager().get_task(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(task)


@agent_bp.get("/tasks/<task_id>/logs")
def task_logs(task_id):
    logs = _manager().logs(task_id)
    if not logs:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(logs)


@agent_bp.post("/tasks/<task_id>/cancel")
def cancel_task(task_id):
    task = _manager().cancel_task(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(task)
