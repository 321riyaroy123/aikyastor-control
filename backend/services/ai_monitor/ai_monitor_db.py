"""
services/ai_monitor/ai_monitor_db.py

Read-only access to the ceph-ai monitoring database.

Responsibility
--------------
ceph-ai (metrics_collector.py, host_log_streamer.py, ml_anomaly_detector.py,
ceph_semantic_baseline.py) runs as a separate, independent process and owns
ceph_monitor.db. This module is the ONLY place in the Flask backend that
touches that database, and it only ever reads from it (Phase 1/2/3 scope).

This is intentionally a thin read layer, not a port of ceph-ai's logic:
- No sklearn, no model loading, no anomaly detection happens here.
- Every function returns a plain dict and never raises -- callers (routes)
  can jsonify the result directly, matching the rest of this codebase's
  service-layer convention (see services/cluster/ceph_ops.py,
  services/object/object_storage.py).
- A missing DB file, a locked DB, or a stale/never-written table are all
  DISTINCT, explicitly-reported states. None of them collapse into a
  silently-empty 200 response -- see the "Silent HTTP 200 errors" lesson
  already documented elsewhere in this codebase's service modules.

Expected ceph-ai schema (owned by metrics_collector.py / ceph_ai_monitor.py):
    metrics_timeseries(timestamp TEXT PRIMARY KEY, data TEXT, is_baseline INTEGER)
    events_log(id INTEGER PK, timestamp, source, severity, component, message, raw_line)
    anomaly_status(timestamp TEXT PRIMARY KEY, data TEXT)   -- added in Phase 2,
        one row per detection tick, data = JSON blob of the normalized
        v7+v8 status (see normalize_anomaly_status() in this module).
    rca_incidents(id INTEGER PK, timestamp TEXT, data TEXT) -- added in Phase 3,
        one row per RCA diagnosis actually triggered (not every tick).
"""

import os
import json
import sqlite3
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from core.logger import logger
from config.config import (
    CEPH_AI_DB_PATH,
    CEPH_AI_DB_TIMEOUT,
    CEPH_AI_STALE_AFTER_SECONDS,
)


def _connect() -> sqlite3.Connection:
    """
    Open a short-timeout, read-only-intent connection to the ceph-ai DB.

    Raises:
        FileNotFoundError: if the DB file does not exist at all (ceph-ai
            has never run, or CEPH_AI_DB_PATH is misconfigured).
        sqlite3.Error: on any other connection failure (e.g. locked file
            after CEPH_AI_DB_TIMEOUT).
    """
    if not os.path.exists(CEPH_AI_DB_PATH):
        raise FileNotFoundError(
            f"ceph-ai database not found at {CEPH_AI_DB_PATH}"
        )

    # `mode=ro` avoids ever accidentally creating tables/writing from the
    # Flask side in this phase, and uri=True is required to use query
    # params on the sqlite3:// style path.
    uri = f"file:{CEPH_AI_DB_PATH}?mode=ro"
    conn = sqlite3.connect(uri, uri=True, timeout=CEPH_AI_DB_TIMEOUT)
    conn.row_factory = sqlite3.Row
    return conn


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    )
    return cur.fetchone() is not None


def _seconds_since(timestamp_str: str) -> Optional[float]:
    """
    Parse a ceph-ai ISO-8601 UTC timestamp (format: '...+00:00' replaced
    with 'Z', per metrics_collector.py's own convention) and return how
    many seconds old it is. Returns None if unparseable.
    """
    try:
        ts = timestamp_str.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(ts)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - parsed).total_seconds()
    except Exception:
        return None


def get_monitor_connectivity() -> Dict[str, Any]:
    """
    Report whether the ceph-ai process appears to be alive and writing,
    independent of any specific table's content.

    This is the first thing the dashboard should check -- distinguishes
    "ceph-ai has never run / DB missing" from "ceph-ai crashed and stopped
    writing" from "ceph-ai is running fine."

    Returns:
        {
            "reachable": bool,       # DB file opened successfully
            "writing": bool | None,  # latest row is fresher than
                                     # CEPH_AI_STALE_AFTER_SECONDS (None if
                                     # reachable but no rows yet)
            "last_write_seconds_ago": float | None,
            "error": str  (only present on failure)
        }
    """
    try:
        conn = _connect()
    except FileNotFoundError as e:
        return {
            "reachable": False,
            "writing": False,
            "last_write_seconds_ago": None,
            "error": str(e),
        }
    except sqlite3.Error as e:
        logger.warning(f"ceph-ai DB connect error: {e}")
        return {
            "reachable": False,
            "writing": False,
            "last_write_seconds_ago": None,
            "error": f"Could not open ceph-ai database: {e}",
        }

    try:
        if not _table_exists(conn, "metrics_timeseries"):
            return {
                "reachable": True,
                "writing": None,
                "last_write_seconds_ago": None,
                "error": "metrics_timeseries table not found -- has ceph-ai been initialized?",
            }

        row = conn.execute(
            "SELECT timestamp FROM metrics_timeseries ORDER BY timestamp DESC LIMIT 1"
        ).fetchone()

        if row is None:
            return {
                "reachable": True,
                "writing": None,
                "last_write_seconds_ago": None,
            }

        age = _seconds_since(row["timestamp"])

        return {
            "reachable": True,
            "writing": (age is not None and age <= CEPH_AI_STALE_AFTER_SECONDS),
            "last_write_seconds_ago": (
                round(age, 1) if age is not None else None
            ),
        }

    except sqlite3.Error as e:
        logger.exception("get_monitor_connectivity query error")
        return {
            "reachable": True,
            "writing": False,
            "last_write_seconds_ago": None,
            "error": f"Query against ceph-ai database failed: {e}",
        }
    finally:
        conn.close()


def get_latest_metrics_snapshot() -> Dict[str, Any]:
    """
    Return the most recent raw metrics snapshot written by
    metrics_collector.py, plus its timestamp and staleness.

    Returns:
        {
            "timestamp": str | None,
            "seconds_ago": float | None,
            "metrics": dict,   # flat key/value metric map, {} if none
            "error": str  (only present on failure)
        }
    """
    try:
        conn = _connect()
    except (FileNotFoundError, sqlite3.Error) as e:
        return {"timestamp": None, "seconds_ago": None, "metrics": {}, "error": str(e)}

    try:
        if not _table_exists(conn, "metrics_timeseries"):
            return {
                "timestamp": None,
                "seconds_ago": None,
                "metrics": {},
                "error": "metrics_timeseries table not found",
            }

        row = conn.execute(
            "SELECT timestamp, data FROM metrics_timeseries "
            "ORDER BY timestamp DESC LIMIT 1"
        ).fetchone()

        if row is None:
            return {"timestamp": None, "seconds_ago": None, "metrics": {}}

        try:
            metrics = json.loads(row["data"])
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"get_latest_metrics_snapshot: corrupt row data: {e}")
            return {
                "timestamp": row["timestamp"],
                "seconds_ago": _seconds_since(row["timestamp"]),
                "metrics": {},
                "error": f"Latest metrics row is not valid JSON: {e}",
            }

        return {
            "timestamp": row["timestamp"],
            "seconds_ago": _seconds_since(row["timestamp"]),
            "metrics": metrics,
        }

    except sqlite3.Error as e:
        logger.exception("get_latest_metrics_snapshot query error")
        return {"timestamp": None, "seconds_ago": None, "metrics": {}, "error": str(e)}
    finally:
        conn.close()


def get_metrics_window(minutes: int = 15, max_points: int = 300) -> Dict[str, Any]:
    """
    Return a time-series window of raw metrics for charting.

    Args:
        minutes: how far back to look
        max_points: hard cap on rows returned (protects the response size
            and the frontend chart from a huge window at 2s granularity --
            15 minutes at 2s intervals is already ~450 rows)

    Returns:
        {
            "points": [ {"timestamp": str, "metrics": dict}, ... ],
            "truncated": bool,
            "error": str  (only present on failure)
        }
    """
    try:
        conn = _connect()
    except (FileNotFoundError, sqlite3.Error) as e:
        return {"points": [], "truncated": False, "error": str(e)}

    try:
        if not _table_exists(conn, "metrics_timeseries"):
            return {
                "points": [],
                "truncated": False,
                "error": "metrics_timeseries table not found",
            }

        rows = conn.execute(
            "SELECT timestamp, data FROM metrics_timeseries "
            "WHERE is_baseline = 0 AND timestamp >= datetime('now', ?) "
            "ORDER BY timestamp ASC",
            (f"-{int(minutes)} minutes",),
        ).fetchall()

        truncated = False
        if len(rows) > max_points:
            # Keep the most recent max_points rather than downsampling --
            # simpler, and recency is what matters most for "is this
            # actively degrading right now" dashboard use.
            rows = rows[-max_points:]
            truncated = True

        points = []
        for row in rows:
            try:
                points.append({
                    "timestamp": row["timestamp"],
                    "metrics": json.loads(row["data"]),
                })
            except (json.JSONDecodeError, TypeError):
                continue  # skip corrupt individual rows, don't fail the whole window

        return {"points": points, "truncated": truncated}

    except sqlite3.Error as e:
        logger.exception("get_metrics_window query error")
        return {"points": [], "truncated": False, "error": str(e)}
    finally:
        conn.close()


def get_recent_events(seconds: int = 120, limit: int = 15) -> Dict[str, Any]:
    """
    Return recent entries from events_log (streamed `ceph -w` / journalctl
    lines captured by host_log_streamer.py).

    Mirrors diagnostic_engine.get_recent_events_log()'s query shape, but
    returns structured rows instead of pre-formatted strings so the
    frontend can render/filter/color by severity.

    Returns:
        {
            "events": [
                {"timestamp": str, "source": str, "severity": str,
                 "component": str, "message": str},
                ...
            ],
            "error": str  (only present on failure)
        }
    """
    try:
        conn = _connect()
    except (FileNotFoundError, sqlite3.Error) as e:
        return {"events": [], "error": str(e)}

    try:
        if not _table_exists(conn, "events_log"):
            return {"events": [], "error": "events_log table not found"}

        rows = conn.execute(
            "SELECT timestamp, source, severity, component, message "
            "FROM events_log WHERE timestamp >= datetime('now', ?) "
            "ORDER BY timestamp DESC LIMIT ?",
            (f"-{int(seconds)} seconds", int(limit)),
        ).fetchall()

        events = [
            {
                "timestamp": row["timestamp"],
                "source": row["source"],
                "severity": row["severity"],
                "component": row["component"],
                "message": row["message"],
            }
            for row in rows
        ]

        return {"events": events}

    except sqlite3.Error as e:
        logger.exception("get_recent_events query error")
        return {"events": [], "error": str(e)}
    finally:
        conn.close()


def get_latest_anomaly_status() -> Dict[str, Any]:
    """
    Return the most recent normalized v7+v8 anomaly status row.

    This table (anomaly_status) does not exist until Phase 2 wires up
    ceph_ai_monitor.py to write it. Until then this cleanly reports
    "table not found" rather than pretending there's no anomaly.

    Returns:
        {
            "timestamp": str | None,
            "seconds_ago": float | None,
            "status": dict | None,   # normalized status payload, see
                                      # normalize_anomaly_status()
            "error": str  (only present on failure)
        }
    """
    try:
        conn = _connect()
    except (FileNotFoundError, sqlite3.Error) as e:
        return {"timestamp": None, "seconds_ago": None, "status": None, "error": str(e)}

    try:
        if not _table_exists(conn, "anomaly_status"):
            return {
                "timestamp": None,
                "seconds_ago": None,
                "status": None,
                "error": "anomaly_status table not found (Phase 2 not yet wired up)",
            }

        row = conn.execute(
            "SELECT timestamp, data FROM anomaly_status "
            "ORDER BY timestamp DESC LIMIT 1"
        ).fetchone()

        if row is None:
            return {"timestamp": None, "seconds_ago": None, "status": None}

        try:
            status = json.loads(row["data"])
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"get_latest_anomaly_status: corrupt row data: {e}")
            return {
                "timestamp": row["timestamp"],
                "seconds_ago": _seconds_since(row["timestamp"]),
                "status": None,
                "error": f"Latest anomaly_status row is not valid JSON: {e}",
            }

        return {
            "timestamp": row["timestamp"],
            "seconds_ago": _seconds_since(row["timestamp"]),
            "status": status,
        }

    except sqlite3.Error as e:
        logger.exception("get_latest_anomaly_status query error")
        return {"timestamp": None, "seconds_ago": None, "status": None, "error": str(e)}
    finally:
        conn.close()


def get_latest_rca_incident() -> Dict[str, Any]:
    """
    Return the most recent RCA incident diagnosis, if any exist.

    This table (rca_incidents) does not exist until Phase 3.

    Returns:
        {
            "incident": dict | None,  # the diagnosis dict as produced by
                                       # llm_analyst.diagnose_incident()
            "error": str  (only present on failure)
        }
    """
    try:
        conn = _connect()
    except (FileNotFoundError, sqlite3.Error) as e:
        return {"incident": None, "error": str(e)}

    try:
        if not _table_exists(conn, "rca_incidents"):
            return {
                "incident": None,
                "error": "rca_incidents table not found (Phase 3 not yet wired up)",
            }

        row = conn.execute(
            "SELECT timestamp, data FROM rca_incidents "
            "ORDER BY timestamp DESC LIMIT 1"
        ).fetchone()

        if row is None:
            return {"incident": None}

        try:
            incident = json.loads(row["data"])
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"get_latest_rca_incident: corrupt row data: {e}")
            return {"incident": None, "error": f"Latest RCA row is not valid JSON: {e}"}

        return {"incident": incident}

    except sqlite3.Error as e:
        logger.exception("get_latest_rca_incident query error")
        return {"incident": None, "error": str(e)}
    finally:
        conn.close()