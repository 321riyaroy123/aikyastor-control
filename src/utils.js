/**
 * utils.js - Frontend utility functions
 * Formatting, calculations, and helper functions
 */

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, index)).toFixed(index > 1 ? 1 : 0) + " " + units[index];
}

/**
 * Calculate percentage
 */
export function calculatePercentage(used, total) {
  return total ? Math.round((used / total) * 100) : 0;
}

/**
 * Format date/time string
 */
export function formatDateTime(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (e) {
    return String(timestamp);
  }
}

/**
 * Capitalize first letter
 */
export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Get color for status badge
 */
export function getStatusColor(status) {
  const colors = {
    success: "#4ade80",
    error: "#f87171",
    warning: "#facc15",
    info: "#38bdf8",
  };
  return colors[status] || colors.info;
}

/**
 * Get icon for action type
 */
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

/**
 * Debounce function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Get unique items from array
 */
export function unique(arr, key) {
  return [...new Map(arr.map(item => [key ? item[key] : item, item])).values()];
}

/**
 * Safe JSON parse
 */
export function parseJSON(str, fallback = {}) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

/**
 * Check if running in simulation mode (check for flag or env variable)
 */
export function isSimulationMode() {
  return process.env.REACT_APP_SIMULATION === "true" || window.__SIMULATION_MODE__ === true;
}
