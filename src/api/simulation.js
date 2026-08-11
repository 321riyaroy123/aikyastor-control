import { req } from "./client";

// Wraps backend/routes/simulation_routes.py (advance mock clock, etc).
// Distinct from client.js's own frontend-side MODE switch — this talks to the
// backend's simulation clock, which only exists when the Flask backend itself
// is running with APP_MODE=simulation. Not wired into any component yet.
export const SimulationAPI = {
  getTime: () => req("/simulation/time"),
  advanceTime: (advance_hours = 0, advance_days = 0) => req("/simulation/time", {
    method: "POST",
    body: JSON.stringify({ advance_hours, advance_days }),
  }),
};
