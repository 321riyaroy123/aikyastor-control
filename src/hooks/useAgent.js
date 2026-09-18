import { useCallback, useEffect, useRef, useState } from "react";
import { AIAgentAPI } from "../api/aiAgent";

export function useAgent() {
  const [status, setStatus] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [analysis, setAnalysis] = useState(null);
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
    if (mounted.current) setAnalysis(result);
    return result;
  }, []);

  const submit = useCallback(async (analysisId) => {
    setError(null);
    const result = await AIAgentAPI.createTask(analysisId);
    await refresh();
    return result;
  }, [refresh]);

  const cancel = useCallback(async (taskId) => {
    const result = await AIAgentAPI.cancelTask(taskId);
    await refresh();
    return result;
  }, [refresh]);

  return { status, tasks, analysis, error, setAnalysis, refresh, upload, analyze, submit, cancel };
}
