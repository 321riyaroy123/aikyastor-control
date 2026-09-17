import { useCallback, useEffect, useState } from "react";
import { AIAgentAPI } from "../api/aiAgent";

export function useAgent(pollMs = 1500) {
  const [status, setStatus] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([AIAgentAPI.status(), AIAgentAPI.tasks()]);
      setStatus(s);
      setTasks(t.tasks || []);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to reach AI Agent");
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  const submit = useCallback(async (payload) => {
    const task = await AIAgentAPI.createTask(payload);
    await refresh();
    return task;
  }, [refresh]);

  const cancel = useCallback(async (taskId) => {
    const task = await AIAgentAPI.cancelTask(taskId);
    await refresh();
    return task;
  }, [refresh]);

  return { status, tasks, error, refresh, submit, cancel };
}
