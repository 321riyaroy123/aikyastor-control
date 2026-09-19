"""Dashboard-facing adapter for the real Ceph Agent.

Phase 1:
- Accept uploaded workloads.
- Pass the server-side workload path to the real ceph-agent classifier.
- Return the authoritative ClassificationResult to the dashboard.

Phase 2A:
- Preview the real workflow recipe (get_workflow_recipe()) for a given
  analysis, without executing anything.

Phase 2B:
- Execute a previously previewed workflow through the real SSHExecutor
  (or MockSSHExecutor in simulation mode), persisting every step via the
  real ExecutionTracker.
- Autonomous LLM self-healing/remediation is intentionally NOT wired in
  yet (Phase 3). A failed step marks the task FAILED and stops; it does
  not retry, diagnose, or apply a fix automatically.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
from threading import Lock, Thread
from uuid import uuid4
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CEPH_AGENT_ROOT = PROJECT_ROOT / "ceph-agent"
ANALYSES_FILE = PROJECT_ROOT / "backend" / "data" / "agent_analyses.json"

if str(CEPH_AGENT_ROOT) not in sys.path:
    sys.path.insert(0, str(CEPH_AGENT_ROOT))

from ceph_classifier.classifier import WorkflowClassifier
from ceph_agent.core.agent import CephSelfHealingAgent
from ceph_agent.core.recipes import get_workflow_recipe
from ceph_agent.core.ssh_executor import SSHExecutor, MockSSHExecutor
from ceph_agent.core.tracker import ExecutionTracker, TaskState


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


# Terminal task states that a poller can stop on.
_TERMINAL_STATES = {"completed", "failed", "cancelled"}


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

            # Phase 2B: real execution tracker. Shares the same
            # agent_traces.db the ceph-agent CLI/agent.py use, so task
            # history persisted here is queryable the same way regardless
            # of whether a run was kicked off via CLI or the dashboard.
            self.tracker = ExecutionTracker()

            self.agent = CephSelfHealingAgent(
                classifier=self.classifier,
                executor=self.executor,
            )

        except Exception as exc:
            self.classifier = None
            self.classifier_available = False
            self.classifier_error = str(exc)
            self.tracker = None

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

    def list_tasks(self):
        """Return all agent tasks, newest first."""
        with self._lock:
            tasks = list(self._tasks.values())

        tasks.sort(
            key=lambda task: task.get("created_at", ""),
            reverse=True,
        )

        return deepcopy(tasks)

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

        tuning = dict(classification.tuning_parameters or {})
        tuning["workload_name"] = (
            analysis.get("source_name")
            or Path(payload_path).name
        )

        recipe = get_workflow_recipe(
            workflow=classification.target_workflow,
            payload_path=payload_path,
            destination=classification.target_destination,
            tuning=tuning,
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
            "executor": {
                "type": "mock" if self.simulation else "ssh",
                # Auth mode is surfaced (not the credentials themselves) so
                # the dashboard can show whether key-based or password auth
                # is configured, without ever exposing secrets.
                "auth_mode": (
                    "n/a"
                    if self.simulation
                    else ("ssh-key" if getattr(self.executor, "key_path", None) else "password")
                ),
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
    # PHASE 2B: REAL WORKFLOW EXECUTION
    #
    # This replaces the old placeholder "fake step names" simulation task
    # path. There is now a single task-creation path (execute_workflow,
    # below) used in both simulation and production mode; the only thing
    # that differs between modes is which executor class runs the real
    # recipe commands (MockSSHExecutor vs SSHExecutor). This avoids having
    # two parallel task-execution implementations.
    # ------------------------------------------------------------------
    def execute_workflow(self, analysis_id, confirm=False):
        """Execute the approved workflow against the Ceph VM."""

        if not confirm:
            raise ValueError("Workflow execution requires confirmation")

        if not self.classifier_available:
            raise RuntimeError(
                f"Ceph Agent classifier unavailable: {self.classifier_error}"
            )

        analysis = self.get_analysis(analysis_id)

        if not analysis:
            raise ValueError("Analysis not found")

        payload_path = analysis.get("payload_path") or analysis.get("item_path")

        if not payload_path:
            raise ValueError("Analysis has no payload path")

        # Re-classify server-side so execution uses the authoritative result.
        classification = self.classifier.classify(
            item_path=payload_path
        )

        # IMPORTANT: define workflow BEFORE using it.
        workflow = classification.target_workflow

        destination = classification.target_destination

        tuning = dict(classification.tuning_parameters or {})
        tuning["workload_name"] = (
            analysis.get("source_name")
            or Path(payload_path).name
        )
        # The uploaded payload currently lives on the backend machine.
        # Copy it to the Ceph VM before executing the recipe.
        remote_payload = f"/tmp/{Path(payload_path).name}"

        if not self.simulation:
            upload_ok = self.executor.upload_path(
                payload_path,
                remote_payload,
            )

            if not upload_ok:
                raise RuntimeError(
                    f"Failed to upload payload to Ceph VM: {remote_payload}"
                )

        else:
            remote_payload = payload_path

        # Build the exact same recipe that was previewed.
        recipe = get_workflow_recipe(
            workflow=workflow,
            payload_path=remote_payload,
            destination=destination,
            tuning=tuning,
        )

        if not recipe:
            raise ValueError(
                f"No workflow recipe available for {workflow}"
            )

        task_id = f"task_{uuid4().hex[:10]}"
        now = self._now()

        steps = [
            {
                "number": index,
                "name": step.name,
                "description": step.description,
                "command": step.command,
                "danger_level": step.danger_level,
                "is_idempotent": step.is_idempotent,
                "timeout_sec": step.timeout_sec,
                "optional": step.optional,
                "status": "pending",
            }
            for index, step in enumerate(recipe, 1)
        ]

        task = {
            "task_id": task_id,
            "analysis_id": analysis_id,
            "upload_id": analysis.get("upload_id"),
            "payload_path": remote_payload,
            "source_name": analysis.get("source_name"),

            "detected_type": classification.item_type,
            "workflow": workflow,
            "confidence": classification.confidence,
            "decision_tier": classification.decision_tier,
            "target": destination,
            "rationale": classification.rationale,

            "status": "queued",
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

        # Persist the execution in the real agent tracker.
        try:
            self.tracker.create_task(
                task_id=task_id,
                payload_path=remote_payload,
                workflow=workflow,
            )
        except Exception as exc:
            with self._lock:
                self._tasks.pop(task_id, None)
            raise RuntimeError(
                f"Failed to initialize execution tracker: {exc}"
            ) from exc

        Thread(
            target=self._run_real_execution,
            args=(task_id, recipe),
            daemon=True,
        ).start()

        return deepcopy(task)

    def _run_real_execution(self, task_id, recipe):
        """Runs the real recipe steps sequentially via self.executor.

        No self-healing: the first failed step marks the task FAILED and
        execution stops immediately. This mirrors agent.py's Stage 3 step
        execution loop minus the diagnose/remediate/retry branch, which is
        intentionally deferred to Phase 3.
        """
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return
            task["status"] = "running"
            task["updated_at"] = self._now()

        self.tracker.update_task_state(task_id, TaskState.RUNNING)

        for index, step in enumerate(recipe):
            with self._lock:
                task = self._tasks.get(task_id)
                if not task or task["status"] == "cancelled":
                    return
                task["step_index"] = index
                task["current_step"] = step.name
                task["steps"][index]["status"] = "running"
                task["updated_at"] = self._now()

            try:
                exec_result = self.executor.execute(
                    cmd=step.command,
                    timeout=step.timeout_sec,
                )
            except Exception as exc:
                # Transport-level failure (SSH connection error, timeout,
                # etc.) is treated the same as a failed command: report
                # clearly and stop, no retry.
                with self._lock:
                    task = self._tasks.get(task_id)
                    if not task:
                        return
                    if task["status"] == "cancelled":
                        return
                    task["steps"][index]["status"] = "failed"
                    task["steps"][index]["stderr"] = str(exc)
                    task["steps"][index]["exit_code"] = -1
                    task["status"] = "failed"
                    task["error"] = f"Step '{step.name}' failed: {exc}"
                    task["current_step"] = None
                    task["updated_at"] = self._now()

                self.tracker.record_step(
                    task_id=task_id,
                    step_name=step.name,
                    state=TaskState.ERROR,
                    command=step.command,
                    stdout="",
                    stderr=str(exc),
                    exit_code=-1,
                    duration_ms=0,
                )
                self.tracker.update_task_state(
                    task_id, TaskState.FAILED,
                    summary=f"Step '{step.name}' failed: {exc}",
                )
                return

            with self._lock:
                task = self._tasks.get(task_id)
                if not task:
                    return
                if task["status"] == "cancelled":
                    return

                task["steps"][index]["exit_code"] = exec_result.exit_code
                task["steps"][index]["stdout"] = exec_result.stdout
                task["steps"][index]["stderr"] = exec_result.stderr
                task["steps"][index]["duration_ms"] = exec_result.duration_ms

                if exec_result.is_success:
                    task["steps"][index]["status"] = "completed"
                    task["updated_at"] = self._now()
                else:
                    # No self-healing (Phase 3). Report the failure clearly
                    # and stop.
                    task["steps"][index]["status"] = "failed"
                    task["status"] = "failed"
                    task["error"] = (
                        f"Step '{step.name}' failed (exit {exec_result.exit_code}): "
                        f"{exec_result.stderr or exec_result.stdout or 'no output'}"
                    )
                    task["current_step"] = None
                    task["updated_at"] = self._now()

            self.tracker.record_step(
                task_id=task_id,
                step_name=step.name,
                state=TaskState.RUNNING if exec_result.is_success else TaskState.ERROR,
                command=step.command,
                stdout=exec_result.stdout,
                stderr=exec_result.stderr,
                exit_code=exec_result.exit_code,
                duration_ms=exec_result.duration_ms,
            )

            if not exec_result.is_success:
                self.tracker.update_task_state(
                    task_id, TaskState.FAILED,
                    summary=task["error"],
                )
                return

        # All steps completed successfully.
        with self._lock:
            task = self._tasks.get(task_id)
            if not task or task["status"] == "cancelled":
                return
            task["status"] = "completed"
            task["current_step"] = None
            task["step_index"] = task["total_steps"]
            task["result"] = {
                "message": f"Workflow completed successfully ({task['total_steps']} steps).",
                "execution": "simulation" if self.simulation else "production",
            }
            task["updated_at"] = self._now()

        self.tracker.update_task_state(
            task_id, TaskState.SUCCESS,
            summary=f"Workflow completed successfully ({len(recipe)} steps).",
        )

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
                    + (f" (exit {step['exit_code']})" if step.get("exit_code") not in (None,) else "")
                    + (f" — {step['stderr']}" if step.get("status") == "failed" and step.get("stderr") else "")
                    for step in task["steps"]
                    if step["status"] != "pending"
                ),
            ],
        }

    @staticmethod
    def _now():
        return datetime.now(
            timezone.utc
        ).isoformat()


manager = None