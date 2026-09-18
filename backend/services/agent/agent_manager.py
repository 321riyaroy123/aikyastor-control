"""Dashboard-facing adapter for the real Ceph Agent.

Phase 1:
- Accept uploaded workloads.
- Pass the server-side workload path to the real ceph-agent classifier.
- Return the authoritative ClassificationResult to the dashboard.

Execution remains simulation-only and is intentionally not connected to
CephSelfHealingAgent/SSHExecutor yet.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
from threading import Lock, Thread
from uuid import uuid4
import sys
import time

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CEPH_AGENT_ROOT = PROJECT_ROOT / "ceph-agent"
ANALYSES_FILE = PROJECT_ROOT / "backend" / "data" / "agent_analyses.json"

if str(CEPH_AGENT_ROOT) not in sys.path:
    sys.path.insert(0, str(CEPH_AGENT_ROOT))

from ceph_classifier.classifier import WorkflowClassifier
from ceph_agent.core.agent import CephSelfHealingAgent
from ceph_agent.core.recipes import get_workflow_recipe
from ceph_agent.core.ssh_executor import SSHExecutor, MockSSHExecutor


# ---------------------------------------------------------------------------
# Make the sibling ceph-agent repository importable.
#
# Repository layout:
#
# aikyastor-control/
# ├── backend/
# ├── src/
# └── ceph-agent/
#
# agent_manager.py lives at:
# backend/services/agent/agent_manager.py
#
# parents[3] = aikyastor-control/
# ---------------------------------------------------------------------------


class AgentManager:
    """Dashboard adapter around the Ceph Agent."""

    def __init__(self, simulation=True):
        self.simulation = simulation

        self._tasks = {}
        self._uploads = {}
        self._lock = Lock()
        self._analyses = self._load_analyses()

        # Phase 1: real workload classifier.
        #
        # The classifier itself is deterministic-first and only uses the
        # LLM fallback when its own logic determines that fallback is needed.
        try:
            from ceph_classifier.classifier import WorkflowClassifier

            self.classifier = WorkflowClassifier(enable_llm_fallback=True)
            self.classifier_available = True
            self.classifier_error = None

            if simulation:
                self.executor = MockSSHExecutor()
            else:
                self.executor = SSHExecutor()

            self.agent = CephSelfHealingAgent(
                classifier=self.classifier,
                executor=self.executor,
            )

        except Exception as exc:
            self.classifier = None
            self.classifier_available = False
            self.classifier_error = str(exc)

    # ------------------------------------------------------------------
    # ANALYSIS PERSISTENCE
    # ------------------------------------------------------------------

    @staticmethod
    def _load_analyses():
        """Restore workflow previews created before a backend restart."""
        try:
            with ANALYSES_FILE.open("r", encoding="utf-8") as file:
                analyses = json.load(file)
            return analyses if isinstance(analyses, dict) else {}
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return {}

    def _save_analyses(self):
        """Atomically persist analysis metadata used by workflow endpoints."""
        ANALYSES_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary_file = ANALYSES_FILE.with_suffix(".tmp")
        with temporary_file.open("w", encoding="utf-8") as file:
            json.dump(self._analyses, file, indent=2)
        temporary_file.replace(ANALYSES_FILE)

    # ------------------------------------------------------------------
    # STATUS
    # ------------------------------------------------------------------

    def preview_workflow(self, analysis_id):
        analysis = self._analyses.get(analysis_id)

        if not analysis:
            raise ValueError("Analysis not found")

        payload_path = analysis.get("payload_path") or analysis.get("item_path")

        if not payload_path:
            raise ValueError("Analysis has no payload path")

        classification = self.classifier.classify(
            item_path=payload_path
        )

        recipe = get_workflow_recipe(
            workflow=classification.target_workflow,
            payload_path=payload_path,
            destination=classification.target_destination,
            tuning=classification.tuning_parameters,
        )

        return {
            "analysis_id": analysis_id,
            "classification": classification.to_dict(),
            "workflow": {
                "name": classification.target_workflow,
                "steps_total": len(recipe),
                "steps": [
                    {
                        "number": i,
                        "name": step.name,
                        "description": step.description,
                        "command": step.command,
                        "danger_level": step.danger_level,
                        "is_idempotent": step.is_idempotent,
                        "timeout_sec": step.timeout_sec,
                        "optional": step.optional,
                    }
                    for i, step in enumerate(recipe, 1)
                ],
            },
        }

    def status(self):
        with self._lock:
            active = sum(
                t["status"] in {"queued", "running"}
                for t in self._tasks.values()
            )

        return {
            "available": self.classifier_available,
            "connected": self.classifier_available,
            "mode": "simulation" if self.simulation else "production",
            "adapter": "ceph-agent-classifier"
                if self.classifier_available
                else "unavailable",
            "active_tasks": active,
            "classifier": {
                "available": self.classifier_available,
                "error": self.classifier_error,
            },
        }

    # ------------------------------------------------------------------
    # UPLOAD REGISTRATION
    # ------------------------------------------------------------------

    def register_upload(
        self,
        payload_path,
        original_name,
        file_count=1,
        total_size=0,
    ):
        """Register a server-side uploaded workload."""

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

    # ------------------------------------------------------------------
    # REAL AGENT CLASSIFICATION
    # ------------------------------------------------------------------

    def analyze(self, payload):
        """Analyze a workload using the real ceph-agent classifier.

        No Ceph commands are executed here.
        """

        if not self.classifier_available:
            raise RuntimeError(
                f"Ceph Agent classifier unavailable: "
                f"{self.classifier_error}"
            )

        upload_id = str(
            payload.get("upload_id") or ""
        ).strip()

        if upload_id:
            upload = self.get_upload(upload_id)

            if not upload:
                raise ValueError("Upload not found")

            payload_path = upload["payload_path"]
            source_name = upload["original_name"]

        else:
            # Backend-side testing support.
            payload_path = str(
                payload.get("payload_path") or ""
            ).strip()

            source_name = (
                Path(payload_path).name
                if payload_path
                else "workload"
            )

        if not payload_path:
            raise ValueError("Workload upload is required")

        path = Path(payload_path)

        if not path.exists():
            raise ValueError(
                f"Workload path does not exist: {payload_path}"
            )

        # --------------------------------------------------------------
        # THIS IS THE IMPORTANT PART.
        #
        # We are now using the actual classifier from ceph-agent.
        # --------------------------------------------------------------

        classification = self.classifier.classify(
            item_path=str(path)
        )

        analysis_id = f"analysis_{uuid4().hex[:10]}"

        result = classification.to_dict()

        result.update(
            {
                "analysis_id": analysis_id,
                "upload_id": upload_id or None,
                "payload_path": str(path),
                "source_name": source_name,
                "created_at": self._now(),
            }
        )

        with self._lock:
            self._analyses[analysis_id] = deepcopy(result)
            self._save_analyses()

        return deepcopy(result)

    # ------------------------------------------------------------------
    # ANALYSIS LOOKUP
    # ------------------------------------------------------------------

    def get_analysis(self, analysis_id):
        with self._lock:
            analysis = self._analyses.get(analysis_id)

        return deepcopy(analysis) if analysis else None

    # ------------------------------------------------------------------
    # EXISTING SIMULATION TASK SUPPORT
    #
    # We leave this here for now.
    # Phase 2 will replace the fake workflow steps with the real recipes.
    # ------------------------------------------------------------------

    def create_task(self, payload):
        if not self.simulation:
            raise RuntimeError(
                "Production execution is not connected yet"
            )

        analysis_id = str(
            payload.get("analysis_id") or ""
        ).strip()

        if not analysis_id:
            raise ValueError(
                "analysis_id is required"
            )

        analysis = self.get_analysis(analysis_id)

        if not analysis:
            raise ValueError("Analysis not found")

        workflow = analysis["target_workflow"]

        steps = self._simulation_steps(workflow)

        now = self._now()
        task_id = f"task_{uuid4().hex[:10]}"

        task = {
            "task_id": task_id,
            "status": "queued",
            "payload_path": analysis["payload_path"],
            "source_name": analysis.get("source_name"),
            "upload_id": analysis.get("upload_id"),

            "detected_type": analysis["item_type"],
            "workflow": workflow,
            "confidence": analysis["confidence"],
            "decision_tier": analysis["decision_tier"],
            "target": analysis["target_destination"],
            "rationale": analysis["rationale"],

            "analysis_id": analysis_id,

            "current_step": (
                steps[0]["name"]
                if steps
                else None
            ),

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

        Thread(
            target=self._run_simulation,
            args=(task_id,),
            daemon=True,
        ).start()

        return deepcopy(task)

    def list_tasks(self):
        with self._lock:
            tasks = [
                deepcopy(task)
                for task in self._tasks.values()
            ]

        return sorted(
            tasks,
            key=lambda task: task["created_at"],
            reverse=True,
        )

    def get_task(self, task_id):
        with self._lock:
            task = self._tasks.get(task_id)

        return deepcopy(task) if task else None

    def cancel_task(self, task_id):
        with self._lock:
            task = self._tasks.get(task_id)

            if not task:
                return None

            if task["status"] in {
                "completed",
                "failed",
                "cancelled",
            }:
                return deepcopy(task)

            task["status"] = "cancelled"
            task["updated_at"] = self._now()

            if task["current_step"]:
                for step in task["steps"]:
                    if (
                        step["name"] == task["current_step"]
                        and step["status"] == "running"
                    ):
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
                *(
                    f"{step['status'].upper()}: {step['name']}"
                    for step in task["steps"]
                    if step["status"] != "pending"
                ),
            ],
        }

    # ------------------------------------------------------------------
    # TEMPORARY SIMULATION STEPS
    # ------------------------------------------------------------------

    @staticmethod
    def _simulation_steps(workflow):
        templates = {
            "CephFS": [
                "verify_mds_health",
                "ensure_cephfs_volume",
                "setup_mountpoint",
                "mount_cephfs",
                "sync_payload",
                "verify_result",
            ],
            "RBD": [
                "verify_rbd_pool",
                "validate_image",
                "provision_rbd",
                "verify_result",
            ],
            "RGW": [
                "verify_rgw",
                "validate_bucket",
                "upload_object",
                "verify_result",
            ],
            "RADOS": [
                "verify_cluster",
                "validate_pool",
                "write_rados_object",
                "verify_result",
            ],
        }

        return [
            {
                "name": name,
                "status": "pending",
            }
            for name in templates.get(workflow, [])
        ]

    # ------------------------------------------------------------------
    # TEMPORARY SIMULATION EXECUTION
    # ------------------------------------------------------------------

    def _run_simulation(self, task_id):
        for index in range(999):
            with self._lock:
                task = self._tasks.get(task_id)

                if (
                    not task
                    or task["status"] == "cancelled"
                ):
                    return

                if index >= len(task["steps"]):
                    task["status"] = "completed"
                    task["current_step"] = None
                    task["step_index"] = task["total_steps"]

                    task["result"] = {
                        "message": "Workflow completed successfully",
                        "execution": "simulation",
                    }

                    task["updated_at"] = self._now()

                    return

                task["status"] = "running"
                task["step_index"] = index
                task["current_step"] = (
                    task["steps"][index]["name"]
                )

                task["steps"][index]["status"] = "running"
                task["updated_at"] = self._now()

            time.sleep(0.8)

            with self._lock:
                task = self._tasks.get(task_id)

                if (
                    not task
                    or task["status"] == "cancelled"
                ):
                    return

                task["steps"][index]["status"] = "completed"
                task["updated_at"] = self._now()

    @staticmethod
    def _now():
        return datetime.now(
            timezone.utc
        ).isoformat()


manager = None
