from pathlib import Path
from uuid import uuid4

from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename

agent_bp = Blueprint("agent", __name__, url_prefix="/api/agent")
UPLOAD_ROOT = Path("/tmp/aikyastor-agent-workloads")


def _manager():
    from services.agent import agent_manager
    return agent_manager.manager


@agent_bp.get("/status")
def agent_status():
    return jsonify(_manager().status())


@agent_bp.post("/upload")
def upload_workload():
    """Store browser-uploaded workload(s) where the backend can inspect them."""
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No workload files were uploaded"}), 400

    upload_id = f"upload_{uuid4().hex[:10]}"
    upload_dir = UPLOAD_ROOT / upload_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    saved = []
    total_size = 0
    try:
        for index, file in enumerate(files):
            if not file or not file.filename:
                continue
            relative = getattr(file, "filename", "") or ""
            # Browsers may supply a relative directory path. Strip unsafe path
            # components while preserving the uploaded directory structure.
            parts = [secure_filename(p) for p in Path(relative).parts if p not in {"", ".", ".."}]
            if not parts:
                parts = [f"workload_{index}"]
            destination = upload_dir.joinpath(*parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            file.save(destination)
            size = destination.stat().st_size
            total_size += size
            saved.append({"name": relative, "path": str(destination), "size": size})

        if not saved:
            raise ValueError("No valid workload files were uploaded")

        # A directory upload is represented by its root directory; a single
        # file is represented directly so the classifier can inspect either.
        payload_path = str(upload_dir if len(saved) > 1 else Path(saved[0]["path"]))
        original_name = Path(saved[0]["name"]).name
        record = _manager().register_upload(
            payload_path=payload_path,
            original_name=original_name if len(saved) == 1 else upload_id,
            file_count=len(saved),
            total_size=total_size,
        )
        record["files"] = saved
        return jsonify(record), 201
    except Exception as exc:
        import shutil
        shutil.rmtree(upload_dir, ignore_errors=True)
        return jsonify({"error": str(exc)}), 400


@agent_bp.post("/analyze")
def analyze_workload():
    try:
        analysis = _manager().analyze(request.get_json(silent=True) or {})
        return jsonify(analysis), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


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
