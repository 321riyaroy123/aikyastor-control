import { req } from "./client";

export const AIAgentAPI = {
  status: () => req("/agent/status"),
  upload: (files) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file, file.webkitRelativePath || file.name));
    return req("/agent/upload", {
      method: "POST",
      body: form,
    });
  },
  analyze: (uploadId) => req("/agent/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upload_id: uploadId }),
  }),
  tasks: () => req("/agent/tasks"),
  task: (taskId) => req(`/agent/tasks/${encodeURIComponent(taskId)}`),
  logs: (taskId) => req(`/agent/tasks/${encodeURIComponent(taskId)}/logs`),
  createTask: (analysisId) => req("/agent/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis_id: analysisId }),
  }),
  cancelTask: (taskId) => req(`/agent/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
  }),
};
