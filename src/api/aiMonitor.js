import { req } from "./client";

export const AIMonitorAPI = {
  connectivity: () => req("/ai-monitor/connectivity"),

  status: () => req("/ai-monitor/status"),

  events: (seconds = 120, limit = 15) =>
    req(`/ai-monitor/events?seconds=${seconds}&limit=${limit}`),

  metrics: (minutes = 15) =>
    req(`/ai-monitor/metrics?minutes=${minutes}`),

  rcaLatest: () => req("/ai-monitor/rca/latest"),
};