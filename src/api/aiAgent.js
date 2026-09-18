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
  workflow: (analysisId) => req(`/agent/analyses/${encodeURIComponent(analysisId)}/workflow`),
  // Phase 2B: explicit confirm-and-execute action. Separate from workflow()
  // above so that fetching a preview never has side effects — this call
  // requires { confirm: true } and is only made after the user reviews the
  // proposed workflow and clicks "Start Workflow".
  execute: (analysisId) => req(`/agent/analyses/${encodeURIComponent(analysisId)}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: true }),
  }),
  tasks: () => req("/agent/tasks"),
  task: (taskId) => req(`/agent/tasks/${encodeURIComponent(taskId)}`),
  logs: (taskId) => req(`/agent/tasks/${encodeURIComponent(taskId)}/logs`),
  cancelTask: (taskId) => req(`/agent/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
  }),
};