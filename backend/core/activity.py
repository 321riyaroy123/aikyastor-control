"""
core/activity.py - Activity logging and tracking
Manages in-memory activity log with thread-safe operations

Moved from: activity.py (project root)
Responsibility: unchanged — thread-safe in-memory activity log used by
every service module to record UPLOAD/DELETE/CREATE/VAULT SYNC/etc. events,
and by cluster_routes.py to serve GET /api/activity and /api/activity/stats.
"""

import threading
from datetime import datetime
from typing import List, Dict, Any
from core.logger import logger

# Thread-safe activity log management
activity_log: List[Dict[str, Any]] = []
activity_lock = threading.Lock()
MAX_LOG_ENTRIES = 100

def log_activity(
    action: str,
    target: str,
    status: str = "info",
    detail: str = "",
    vault: bool = False
) -> None:
    """
    Log an activity entry

    Args:
        action: Action type (e.g., "UPLOAD", "DELETE")
        target: Target resource name
        status: Status (success | error | info)
        detail: Additional detail message
        vault: Whether this is vault-related
    """
    entry = {
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "action": action,
        "target": target,
        "status": status,
        "detail": detail,
        "vault": vault,
    }

    with activity_lock:
        activity_log.insert(0, entry)
        if len(activity_log) > MAX_LOG_ENTRIES:
            activity_log.pop()

    logger.info(f"[{status.upper()}] {action} → {target} | {detail}")

def get_activity_log(limit: int = 100, vault_only: bool = False) -> List[Dict[str, Any]]:
    """
    Retrieve activity log

    Args:
        limit: Maximum number of entries to return
        vault_only: If True, return only vault-related entries

    Returns:
        List of activity entries
    """
    with activity_lock:
        log = list(activity_log)

    if vault_only:
        log = [entry for entry in log if entry["vault"]]

    return log[:limit]

def clear_activity_log() -> None:
    """Clear all activity log entries"""
    with activity_lock:
        activity_log.clear()
    logger.info("Activity log cleared")

def get_activity_stats() -> Dict[str, int]:
    """
    Get activity statistics

    Returns:
        Dictionary with counts by status and action type
    """
    with activity_lock:
        log = list(activity_log)

    stats = {
        "total": len(log),
        "success": sum(1 for e in log if e["status"] == "success"),
        "error": sum(1 for e in log if e["status"] == "error"),
        "info": sum(1 for e in log if e["status"] == "info"),
        "vault": sum(1 for e in log if e["vault"]),
    }

    return stats