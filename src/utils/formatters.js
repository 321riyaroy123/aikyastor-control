// formatters.js - consolidated from utils.js (deduplicates the inline fmt/pct
// helpers that were redefined at the top of AiKyaStorCONTROL.jsx)

export function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, index)).toFixed(index > 1 ? 1 : 0) + " " + units[index];
}

export function calculatePercentage(used, total) {
  return total ? Math.round((used / total) * 100) : 0;
}

export function formatDateTime(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString("en-IN", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch (e) {
    return String(timestamp);
  }
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => { clearTimeout(timeout); func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

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

export function unique(arr, key) {
  return [...new Map(arr.map(item => [key ? item[key] : item, item])).values()];
}

export function parseJSON(str, fallback = {}) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}
