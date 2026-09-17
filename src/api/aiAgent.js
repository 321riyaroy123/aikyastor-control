import { req } from "./client";

export const AIAgentAPI = {
  status: () => req("/agent/status"),
  tasks: () => req("/agent/tasks"),
  task: (taskId) => req(`/agent/tasks/${encodeURIComponent(taskId)}`),
  logs: (taskId) => req(`/agent/tasks/${encodeURIComponent(taskId)}/logs`),
  createTask: (payload) => req("/agent/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }),
  cancelTask: (taskId) => req(`/agent/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
  }),
};
