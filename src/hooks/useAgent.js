import { useCallback, useEffect, useRef, useState } from "react";
import { AIAgentAPI } from "../api/aiAgent";

// Normalizes a raw /analyze classification response (item_type,
// target_workflow, target_destination — the ceph_classifier field names)
// into the detected_type/workflow/target shape the rest of the dashboard
// (task objects, StepList, Metric cards) already uses. Keeping the wire
// shape from the classifier untouched and normalizing once here, rather
// than changing the backend response, avoids breaking any other consumer
// of the raw /analyze payload.
function normalizeAnalysis(raw) {
  if (!raw) return raw;
  return {
    ...raw,
    detected_type: raw.detected_type ?? raw.item_type,
    workflow: raw.workflow ?? raw.target_workflow,
    target: raw.target ?? raw.target_destination,
  };
}

// Normalizes a /analyses/:id/workflow preview response's step list into
// the shape StepList expects ({ name, status, ... }) — the preview
// endpoint's steps use "number" instead of a running "status", since no
// execution has happened yet.
function normalizePreviewSteps(steps) {
  return (steps || []).map((step) => ({ ...step, status: "pending" }));
}

export function useAgent() {
  const [status, setStatus] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextTasks] = await Promise.all([
        AIAgentAPI.status(),
        AIAgentAPI.tasks(),
      ]);
      if (!mounted.current) return;
      setStatus(nextStatus);
      setTasks(nextTasks.tasks || []);
      setError(null);
    } catch (err) {
      if (mounted.current) setError(err?.message || "Unable to reach AI Agent");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const timer = setInterval(refresh, 1500);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  const upload = useCallback(async (files) => {
    setError(null);
    return AIAgentAPI.upload(files);
  }, []);

  const analyze = useCallback(async (uploadId) => {
    setError(null);
    const result = await AIAgentAPI.analyze(uploadId);
    const normalized = normalizeAnalysis(result);
    if (mounted.current) {
      setAnalysis(normalized);
      setPreview(null);
    }
    return normalized;
  }, []);

  // Phase 2A: fetch the real proposed workflow (recipe steps) for a given
  // analysis, without executing anything. This is a read-only call — the
  // backend's preview endpoint never runs commands.
  const previewWorkflow = useCallback(async (analysisId) => {
    setError(null);
    const result = await AIAgentAPI.workflow(analysisId);
    const normalized = {
      ...result,
      steps: normalizePreviewSteps(result?.workflow?.steps),
    };
    if (mounted.current) setPreview(normalized);
    return normalized;
  }, []);

  // Phase 2B: explicit confirm-and-execute action. Only call this after the
  // user has reviewed the preview and confirmed — AIAgentAPI.execute()
  // always sends confirm:true, so this function itself IS the confirmation
  // step from the UI's point of view.
  const execute = useCallback(async (analysisId) => {
    setError(null);
    const result = await AIAgentAPI.execute(analysisId);
    await refresh();
    return result;
  }, [refresh]);

  const cancel = useCallback(async (taskId) => {
    const result = await AIAgentAPI.cancelTask(taskId);
    await refresh();
    return result;
  }, [refresh]);

  return {
    status, tasks, analysis, preview, error,
    setAnalysis, setPreview, refresh,
    upload, analyze, previewWorkflow, execute, cancel,
  };
}