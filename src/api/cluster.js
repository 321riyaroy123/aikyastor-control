import { req } from "./client";

export const ClusterAPI = {
  stats: () => req("/stats"),
  health: () => req("/health"),
  version: () => req("/version"),
  info: () => req("/info"),
  activity: () => req("/activity").then(d => d.log || []),
  activityStats: () => req("/activity/stats"),
};
