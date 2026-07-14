// constants.js - lookup tables extracted from utils.js

export function getStatusColor(status) {
  const colors = {
    success: "#4ade80",
    error: "#f87171",
    warning: "#facc15",
    info: "#38bdf8",
  };
  return colors[status] || colors.info;
}

export function getActionIcon(action) {
  const icons = {
    UPLOAD: "⬆️",
    DELETE: "🗑️",
    CREATE: "➕",
    BACKUP: "💾",
    SNAPSHOT: "📸",
    SYNC: "🔄",
    VAULT: "🔒",
  };
  for (const [key, icon] of Object.entries(icons)) {
    if (action.includes(key)) return icon;
  }
  return "•";
}

export function isSimulationMode() {
  return import.meta.env.VITE_APP_MODE === "simulation" || window.__SIMULATION_MODE__ === true;
}
