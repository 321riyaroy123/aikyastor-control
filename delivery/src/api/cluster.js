import { req } from "./client";

export const ClusterAPI = {
  stats: () => req("/stats"),
  health: () => req("/health"),
  version: () => req("/version"),
  info: () => req("/info"),
  activity: () => req("/activity").then(d => d.log || []),
  activityStats: () => req("/activity/stats"),
  // Phase 1 of the Dashboard redesign: aggregate endpoint, currently
  // returns only { health }. Later phases add capacity/services/osds/
  // pools/performance/prometheus to the same response server-side.
  dashboard: () => req("/dashboard"),
};
