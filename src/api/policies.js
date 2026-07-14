import { req } from "./client";

// NOTE: the original frontend never called these routes (no PolicyAPI existed).
// This wraps backend/routes/policy_routes.py for future policy UI work.
// Not wired into any component yet, and not covered by client.js's simRequest
// mock — these calls only succeed against the real backend (MODE=production).
export const PolicyAPI = {
  list: () => req("/policies"),
  create: (payload) => req("/policies", {
      method:"POST",
      body:JSON.stringify(payload)
  }),
  delete: (policyId) => req(`/policies/${policyId}`, { method: "DELETE" }),
  usage: (policyId) => req(`/policies/${policyId}/usage`),
  run: () => req("/policies/run", { method: "POST" }),
};
