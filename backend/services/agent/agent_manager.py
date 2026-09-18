"""Safe dashboard-facing adapter for the Ceph Agent.

The dashboard supplies a workload through the upload endpoint. The adapter
then analyzes the resulting server-side path and determines the storage
workflow. This implementation is intentionally simulation-only until
ceph-agent is ready to be connected. No Ceph or SSH commands are executed.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock, Thread
from uuid import uuid4
import mimetypes
import time


class AgentManager:
    def __init__(self, simulation=True):
        self.simulation = simulation
        self._tasks = {}
        self._analyses = {}
        self._uploads = {}
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

    def register_upload(self, payload_path, original_name, file_count=1, total_size=0):
        """Register a server-side uploaded workload for later analysis."""
        upload_id = f"upload_{uuid4().hex[:10]}"
        record = {
            "upload_id": upload_id,
            "payload_path": str(payload_path),
            "original_name": original_name,
            "file_count": file_count,
            "total_size": total_size,
            "created_at": self._now(),
        }
        with self._lock:
            self._uploads[upload_id] = deepcopy(record)
        return deepcopy(record)

    def get_upload(self, upload_id):
        with self._lock:
            upload = self._uploads.get(upload_id)
            return deepcopy(upload) if upload else None

    def analyze(self, payload):
        upload_id = str(payload.get("upload_id") or "").strip()
        if upload_id:
            upload = self.get_upload(upload_id)
            if not upload:
                raise ValueError("Upload not found")
            payload_path = upload["payload_path"]
            source_name = upload["original_name"]
        else:
            # Retained for backend-side testing. The browser UI uses upload_id.
            payload_path = str(payload.get("payload_path") or "").strip()
            source_name = Path(payload_path).name if payload_path else "workload"

        if not payload_path:
            raise ValueError("Workload upload is required")

        result = self._classify_simulated(payload_path, source_name=source_name)
        analysis_id = f"analysis_{uuid4().hex[:10]}"
        result.update({
            "analysis_id": analysis_id,
            "upload_id": upload_id or None,
            "payload_path": payload_path,
            "source_name": source_name,
            "created_at": self._now(),
        })
        with self._lock:
            self._analyses[analysis_id] = deepcopy(result)
        return deepcopy(result)

    def create_task(self, payload):
        if not self.simulation:
            raise RuntimeError("Production agent adapter is not connected yet")

        analysis_id = str(payload.get("analysis_id") or "").strip()
        if analysis_id:
            with self._lock:
                analysis = deepcopy(self._analyses.get(analysis_id))
            if not analysis:
                raise ValueError("Analysis not found")
        else:
            analysis = self.analyze(payload)

        steps = [dict(step) for step in analysis["steps"]]
        now = self._now()
        task_id = f"task_{uuid4().hex[:10]}"
        task = {
            "task_id": task_id,
            "status": "queued",
            "payload_path": analysis["payload_path"],
            "source_name": analysis.get("source_name"),
            "upload_id": analysis.get("upload_id"),
            "detected_type": analysis["detected_type"],
            "workflow": analysis["workflow"],
            "confidence": analysis["confidence"],
            "decision_tier": analysis["decision_tier"],
            "target": analysis["target"],
            "rationale": analysis["rationale"],
            "analysis_id": analysis["analysis_id"],
            "current_step": steps[0]["name"] if steps else None,
            "step_index": 0,
            "total_steps": len(steps),
            "steps": steps,
            "created_at": now,
            "updated_at": now,
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
        return {
            "task_id": task_id,
            "logs": [
                f"Task {task_id} created",
                f"Payload: {task['source_name'] or task['payload_path']}",
                f"Detected: {task['detected_type']}",
                f"Workflow: {task['workflow']}",
                f"Confidence: {task['confidence']:.2f}",
                *(f"{s['status'].upper()}: {s['name']}" for s in task["steps"] if s["status"] != "pending"),
            ],
        }

    def _classify_simulated(self, payload_path, source_name=None):
        """Mirror the current ceph-agent classifier's main routing rules safely."""
        path = Path(payload_path)
        name = source_name or path.name or "workload"
        suffix = Path(name).suffix.lower()
        lower = name.lower()
        is_dir = path.is_dir()
        mime = mimetypes.guess_type(name)[0] or "application/octet-stream"

        if suffix in {".qcow2", ".vmdk", ".vdi", ".vhdx", ".vhd", ".iso"}:
            return self._analysis(
                detected_type="virtual_disk_image", workflow="RBD", confidence=0.98,
                decision_tier="tier1_deterministic", target=f"joel/{name}",
                rationale=f"Virtual disk image format `{suffix}` detected. RBD is the mapped block-storage workflow.",
                steps=["verify_pool", "validate_image", "provision_rbd", "verify_result"],
            )

        archive_project = suffix in {".tar", ".gz", ".zip", ".7z", ".tgz", ".bz2", ".xz"} and any(
            x in lower for x in ["project", "repo", "code", "source"]
        )
        if is_dir or archive_project:
            target_name = name
            for ext in [".tar.gz", ".tar.bz2", ".tar.xz", ".tgz", ".zip", ".tar", ".7z"]:
                if target_name.lower().endswith(ext):
                    target_name = target_name[:-len(ext)]
                    break
            return self._analysis(
                detected_type="hierarchical_directory", workflow="CephFS", confidence=0.96,
                decision_tier="tier1_deterministic", target=f"/mnt/cephfs/{target_name}",
                rationale="Directory/project structure is best represented by a POSIX filesystem workflow; CephFS preserves hierarchy and permissions.",
                steps=["verify_mds_health", "ensure_cephfs_volume", "setup_mountpoint", "load_ceph_module", "mount_cephfs", "verify_result"],
            )

        if suffix in {".omap", ".kv", ".rados"}:
            return self._analysis(
                detected_type="raw_key_value_shard", workflow="RADOS", confidence=0.92,
                decision_tier="tier1_deterministic", target=f"test_data_pool/{name}",
                rationale="Raw key-value/object-shard format detected. The workload maps to native RADOS storage.",
                steps=["verify_cluster", "validate_pool", "write_rados_object", "verify_result"],
            )

        if suffix in {".parquet", ".pdf", ".png", ".jpg", ".jpeg", ".mp4", ".zip", ".gz", ".bz2", ".xz", ".7z"}:
            return self._analysis(
                detected_type="flat_object", workflow="RGW", confidence=0.95,
                decision_tier="tier1_deterministic", target=f"s3://default-bucket/{name}",
                rationale=f"Standalone object format detected ({mime}). The workload maps to RGW/S3 object storage.",
                steps=["verify_rgw", "validate_bucket", "upload_object", "verify_result"],
            )

        return self._analysis(
            detected_type="generic_stream", workflow="RGW", confidence=0.88,
            decision_tier="fallback_default", target=f"s3://default-bucket/{name}",
            rationale="No higher-confidence storage signature was matched. The safe default mapping is RGW/S3 object storage.",
            steps=["verify_rgw", "validate_bucket", "upload_object", "verify_result"],
        )

    @staticmethod
    def _analysis(detected_type, workflow, confidence, decision_tier, target, rationale, steps):
        return {
            "detected_type": detected_type,
            "workflow": workflow,
            "confidence": confidence,
            "decision_tier": decision_tier,
            "target": target,
            "rationale": rationale,
            "steps": [{"name": name, "status": "pending"} for name in steps],
        }

    def _run_simulation(self, task_id):
        for index in range(999):
            with self._lock:
                task = self._tasks.get(task_id)
                if not task or task["status"] == "cancelled":
                    return
                if index >= len(task["steps"]):
                    task["status"] = "completed"
                    task["current_step"] = None
                    task["step_index"] = task["total_steps"]
                    task["result"] = {"message": "Workflow completed successfully", "execution": "simulation"}
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
