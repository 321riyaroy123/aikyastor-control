"""Dashboard-facing adapter for the Ceph Agent.

The dashboard talks to this adapter instead of importing ceph-agent internals.
For now it provides a safe simulation executor. Real ceph-agent execution can
be plugged in later without changing the dashboard API.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from threading import Lock, Thread
from uuid import uuid4
import time


class AgentManager:
    def __init__(self, simulation=True):
        self.simulation = simulation
        self._tasks = {}
        self._lock = Lock()

    def status(self):
        with self._lock:
            active = sum(t["status"] in {"queued", "running"} for t in self._tasks.values())
        return {
            "available": True,
            "connected": True,
            "mode": "simulation" if self.simulation else "production",
            "adapter": "simulation" if self.simulation else "ceph-agent",
            "active_tasks": active,
        }

    def create_task(self, payload):
        workload = str(payload.get("workload", "")).upper()
        operation = str(payload.get("operation", "")).lower()
        target = str(payload.get("target", "")).strip()
        allowed = {"CEPHFS", "RBD", "RGW", "RADOS"}
        if workload not in allowed:
            raise ValueError(f"Unsupported workload: {workload or 'missing'}")
        if not operation:
            raise ValueError("Operation is required")
        if not target:
            raise ValueError("Target is required")
        if not self.simulation:
            raise RuntimeError("Production agent adapter is not connected yet")

        task_id = f"task_{uuid4().hex[:10]}"
        steps = self._steps(workload, operation)
        task = {
            "task_id": task_id,
            "status": "queued",
            "workload": workload,
            "operation": operation,
            "target": target,
            "confidence": 0.96,
            "current_step": steps[0]["name"] if steps else None,
            "step_index": 0,
            "total_steps": len(steps),
            "steps": steps,
            "created_at": self._now(),
            "updated_at": self._now(),
            "result": None,
            "error": None,
        }
        with self._lock:
            self._tasks[task_id] = task
        Thread(target=self._run_simulation, args=(task_id,), daemon=True).start()
        return deepcopy(task)

    def list_tasks(self):
        with self._lock:
            tasks = [deepcopy(t) for t in self._tasks.values()]
        return sorted(tasks, key=lambda t: t["created_at"], reverse=True)

    def get_task(self, task_id):
        with self._lock:
            task = self._tasks.get(task_id)
            return deepcopy(task) if task else None

    def cancel_task(self, task_id):
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return None
            if task["status"] in {"completed", "failed", "cancelled"}:
                return deepcopy(task)
            task["status"] = "cancelled"
            task["updated_at"] = self._now()
            if task["current_step"]:
                for step in task["steps"]:
                    if step["name"] == task["current_step"] and step["status"] == "running":
                        step["status"] = "cancelled"
            return deepcopy(task)

    def logs(self, task_id):
        task = self.get_task(task_id)
        if not task:
            return None
        return {"task_id": task_id, "logs": [
            f"Task {task_id} created",
            f"Workflow: {task['workload']} / {task['operation']}",
            *(f"{s['status'].upper()}: {s['name']}" for s in task["steps"] if s["status"] != "pending"),
        ]}

    def _steps(self, workload, operation):
        templates = {
            "CEPHFS": ["verify_mds_health", "ensure_cephfs_volume", "setup_mountpoint", "load_ceph_module", operation, "verify_result"],
            "RBD": ["verify_pool", "validate_image", operation, "verify_result"],
            "RGW": ["verify_rgw", "validate_bucket", operation, "verify_result"],
            "RADOS": ["verify_cluster", "validate_pool", operation, "verify_result"],
        }
        names = templates[workload]
        return [{"name": n, "status": "pending"} for n in names]

    def _run_simulation(self, task_id):
        for index in range(0, 999):
            with self._lock:
                task = self._tasks.get(task_id)
                if not task or task["status"] == "cancelled":
                    return
                if index >= len(task["steps"]):
                    task["status"] = "completed"
                    task["current_step"] = None
                    task["step_index"] = task["total_steps"]
                    task["result"] = {"message": "Workflow completed successfully"}
                    task["updated_at"] = self._now()
                    return
                task["status"] = "running"
                task["step_index"] = index
                task["current_step"] = task["steps"][index]["name"]
                task["steps"][index]["status"] = "running"
                task["updated_at"] = self._now()
            time.sleep(0.8)
            with self._lock:
                task = self._tasks.get(task_id)
                if not task or task["status"] == "cancelled":
                    return
                task["steps"][index]["status"] = "completed"
                task["updated_at"] = self._now()

    @staticmethod
    def _now():
        return datetime.now(timezone.utc).isoformat()


manager = None
