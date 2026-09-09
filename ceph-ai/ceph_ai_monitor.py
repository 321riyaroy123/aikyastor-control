import json
import os
import sys
import time
import sqlite3
import threading
from datetime import datetime, timedelta
import pandas as pd

from ssh import metrics_collector, host_log_streamer
from detection import ml_anomaly_detector, ceph_semantic_baseline
from analysis import llm_analyst, diagnostic_engine
from alerts import alert_engine

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("DB_PATH", os.path.join(ROOT_DIR, "ceph_monitor.db"))

# Prevent identical ML alerts from flooding the terminal
_last_anomaly_alert_ts = None
ANOMALY_COOLDOWN_SEC   = 120  # seconds between repeated ML alerts


def start_thread(target_func, name):
    t = threading.Thread(target=target_func, name=name, daemon=True)
    t.start()
    return t


def get_recent_logs(seconds=60):
    if not os.path.exists(DB_PATH):
        return []
    try:
        conn   = sqlite3.connect(DB_PATH)
        cutoff = (datetime.utcnow() - timedelta(seconds=seconds)).isoformat() + "Z"
        df_logs = pd.read_sql_query(
            "SELECT timestamp, source, severity, component, message "
            "FROM events_log WHERE timestamp >= ? ORDER BY timestamp ASC",
            conn, params=(cutoff,)
        )
        conn.close()
        return [
            f"[{r['timestamp']}] {r['source']} | {r['severity']} | {r['component']} | {r['message']}"
            for _, r in df_logs.iterrows()
        ]
    except Exception as e:
        print(f"[orchestrator] Log query error: {e}", file=sys.stderr)
        return []

def handle_ml_anomaly(result, v8_result=None, snap=None):
    global _last_anomaly_alert_ts
    deviated = result.get("deviated_features", {})
    if not deviated:
        return
 
    now = datetime.now()
    if _last_anomaly_alert_ts:
        if (now - _last_anomaly_alert_ts).total_seconds() < ANOMALY_COOLDOWN_SEC:
            return
    _last_anomaly_alert_ts = now
 
    score = result.get("decision_score", 0)
    method = result.get("detection_method", "ML")
    print(
        f"\n[!] ML anomaly detected via [{method}] (score={score:.4f}). "
        f"Deviations: {list(deviated.keys())}. Running RCA diagnosis...",
        flush=True
    )
 
    # Build the full incident context and diagnose -- this is the same
    # validated pattern demo_live.py and run_live_rca_validation.py use.
    # diagnose_incident() ALWAYS returns a usable dict (falls back to
    # dynamic_algorithmic_diagnosis() internally if Ollama is unavailable
    # or returns something unparseable), so there is no "else: generic
    # fallback" branch needed here the way the old explain_anomaly()-based
    # code had one.
    ctx = diagnostic_engine.build_incident_context(
        v7_result=result,
        v8_result=v8_result,
        raw_snapshot=snap,
    )
    diagnosis = llm_analyst.diagnose_incident(ctx)
    diagnosis_with_ts = {**diagnosis, "timestamp": ctx["timestamp"]}
 
    write_rca_incident(diagnosis_with_ts)
 
    alert_engine.print_alert(
        alert_type=f"ML Anomaly Detector [{method}] + RCA Engine",
        title=diagnosis.get("root_cause_summary", "Metric Anomaly Detected"),
        explanation=diagnosis.get(
            "detailed_explanation",
            "Metrics deviated significantly from the locked baseline."
        ),
        recommended_action=(
            "; ".join(diagnosis.get("remediation_steps", []))
            or "Inspect Ceph cluster with 'ceph status'."
        ),
            severity=diagnosis.get("severity", "WARNING"),
        timestamp=result.get("timestamp"),
    )

# ─── 1. Table setup (call once at startup, e.g. right after
#        metrics_collector.init_db() in main()) ─────────────────────────────
 
def init_anomaly_status_table():
    """
    Idempotently ensure the anomaly_status table exists.
 
    Schema:
        timestamp TEXT PRIMARY KEY  -- ISO-8601 UTC, same format as
                                        metrics_timeseries.timestamp
        data TEXT                   -- JSON blob, see normalize_anomaly_status()
    """
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS anomaly_status (
            timestamp TEXT PRIMARY KEY,
            data TEXT
        )
        """
    )
    conn.commit()
    conn.close()
 
 
# ─── 2. Normalization ────────────────────────────────────────────────────────
 
def _now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
 
 
def normalize_anomaly_status(v7_result, v8_result):
    """
    Reconcile v7 (ml_anomaly_detector) and v8 (ceph_semantic_baseline)
    results into one canonical dict for the anomaly_status table.
 
    Handles None for either input (DB not yet initialized, or the detector
    itself returned None because ceph_monitor.db didn't exist at call
    time -- both are legitimate, non-error states early in the process
    lifetime, not failures).
 
    Returns a dict shaped:
        {
            "timestamp": str,                # this function's own call time,
                                               # NOT copied from v7/v8, since
                                               # they can have different or
                                               # missing timestamps
            "is_anomaly": bool,               # True if EITHER layer flags it
            "host_layer": {
                "available": bool,            # False if v7_result is None
                "status": str | None,         # v7's own "status" field
                "is_anomaly": bool,
                "decision_score": float | None,
                "pca_reconstruction_error": float | None,  # renamed from
                                                            # v7's "pca_reconstruct"
                "detection_method": str | None,
                "deviated_features": dict,
                "sentinel_alerts": list,
                "phase": str | None,          # "learning" | "monitoring" | None
                "baseline_samples": int | None,
                "message": str | None,        # present on some non-ready statuses
                "samples_collected": int | None,
                "samples_required": int | None,
            },
            "ceph_layer": {
                "available": bool,            # False if v8_result is None
                "status": str | None,
                "is_anomaly": bool,
                "decision_score": float | None,
                "pca_reconstruction_error": float | None,  # renamed from
                                                            # v8's "pca_reconstruct_err"
                "pca_threshold": float | None,
                "detection_method": str | None,
                "triggered_models": list,
                "deviated_features": dict,
                "message": str | None,
            },
        }
 
    Deliberate design choices:
    - "pca_reconstruct" and "pca_reconstruct_err" both become
      "pca_reconstruction_error" in the normalized output -- this is the
      one genuine naming collision between the two detectors and the whole
      reason this function exists rather than the Flask side just merging
      dicts.
    - sentinel_alerts only exists on v7 (structural sentinels are a v7-only
      concept per ml_anomaly_detector.py's own docstring) -- ceph_layer has
      no sentinel_alerts key at all, rather than a fake empty list dressed
      up as equivalent to v7's.
    - triggered_models only exists on v8 (ceph_semantic_baseline's ensemble
      reports which of its 3 models fired) -- host_layer has no
      triggered_models key, for the same reason.
    - Every non-"ready" status is preserved as-is in the "status" field
      rather than collapsed to a generic "not ready" -- the dashboard can
      distinguish "still learning" from "no baseline data" from "invalid
      scrape" if it wants to, rather than everything looking like a blank
      "not anomalous" state.
    """
    host_layer = {
        "available": v7_result is not None,
        "status": None,
        "is_anomaly": False,
        "decision_score": None,
        "pca_reconstruction_error": None,
        "detection_method": None,
        "deviated_features": {},
        "sentinel_alerts": [],
        "phase": None,
        "baseline_samples": None,
        "message": None,
        "samples_collected": None,
        "samples_required": None,
    }
 
    if v7_result is not None:
        host_layer.update({
            "status": v7_result.get("status"),
            "is_anomaly": bool(v7_result.get("is_anomaly", False)),
            "decision_score": v7_result.get("decision_score"),
            "pca_reconstruction_error": v7_result.get("pca_reconstruct"),
            "detection_method": v7_result.get("detection_method"),
            "deviated_features": v7_result.get("deviated_features", {}) or {},
            "sentinel_alerts": v7_result.get("sentinel_alerts", []) or [],
            "phase": v7_result.get("phase"),
            "baseline_samples": v7_result.get("baseline_samples"),
            "message": v7_result.get("message"),
            "samples_collected": v7_result.get("samples_collected"),
            "samples_required": v7_result.get("samples_required"),
        })
 
    ceph_layer = {
        "available": v8_result is not None,
        "status": None,
        "is_anomaly": False,
        "decision_score": None,
        "pca_reconstruction_error": None,
        "pca_threshold": None,
        "detection_method": None,
        "triggered_models": [],
        "deviated_features": {},
        "message": None,
    }
 
    if v8_result is not None:
        ceph_layer.update({
            "status": v8_result.get("status"),
            "is_anomaly": bool(v8_result.get("is_anomaly", False)),
            "decision_score": v8_result.get("decision_score"),
            "pca_reconstruction_error": v8_result.get("pca_reconstruct_err"),
            "pca_threshold": v8_result.get("pca_threshold"),
            "detection_method": v8_result.get("detection_method"),
            "triggered_models": v8_result.get("triggered_models", []) or [],
            "deviated_features": v8_result.get("deviated_features", {}) or {},
            "message": v8_result.get("message"),
        })
 
    return {
        "timestamp": _now_iso(),
        "is_anomaly": bool(host_layer["is_anomaly"] or ceph_layer["is_anomaly"]),
        "host_layer": host_layer,
        "ceph_layer": ceph_layer,
    }
 
 
# ─── 3. Write side ────────────────────────────────────────────────────────
 
def write_anomaly_status(normalized: dict) -> None:
    """
    Persist one normalized status row. Never raises -- a failed write here
    should not crash the monitoring loop; log and move on, matching this
    module's existing try/except-around-everything style in main()'s loop.
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            "INSERT OR REPLACE INTO anomaly_status (timestamp, data) VALUES (?, ?)",
            (normalized["timestamp"], json.dumps(normalized)),
        )
        # Match metrics_collector.py's own retention discipline -- don't
        # let this table grow forever either.
        conn.execute(
            "DELETE FROM anomaly_status WHERE timestamp < datetime('now', '-7 days')"
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[orchestrator] anomaly_status write error: {e}", flush=True)

# ─── 1. Table setup (call once at startup, alongside Phase 2's
#        init_anomaly_status_table()) ────────────────────────────────────
 
def init_rca_incidents_table():
    """
    Idempotently ensure the rca_incidents table exists.
 
    Schema:
        id INTEGER PRIMARY KEY AUTOINCREMENT  -- one row per triggered
                                                  incident, not per tick
        timestamp TEXT                        -- ISO-8601 UTC, when the
                                                  diagnosis was produced
        data TEXT                             -- JSON blob: the full
                                                  diagnose_incident() dict
    """
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rca_incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            data TEXT
        )
        """
    )
    conn.commit()
    conn.close()
 
 
# ─── 2. Write side ────────────────────────────────────────────────────────
 
def write_rca_incident(diagnosis: dict) -> None:
    """
    Persist one RCA incident. Never raises -- matches
    write_anomaly_status()'s discipline of logging and continuing rather
    than crashing the monitoring loop over a DB write failure.
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            "INSERT INTO rca_incidents (timestamp, data) VALUES (?, ?)",
            (
                diagnosis.get("timestamp", _now_iso()),
                json.dumps(diagnosis),
            ),
        )
        # Incidents are lower-volume than per-tick tables (one per
        # confirmed anomaly, gated by the same 120s cooldown
        # handle_ml_anomaly() already enforces), but still apply the same
        # 7-day retention discipline as metrics_timeseries/anomaly_status
        # rather than letting this grow forever.
        conn.execute(
            "DELETE FROM rca_incidents WHERE timestamp < datetime('now', '-7 days')"
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[orchestrator] rca_incidents write error: {e}", flush=True)

def _read_latest_snapshot_for_rca():
    """
    Read the most recently persisted metrics snapshot back out of
    metrics_timeseries, for feeding into
    diagnostic_engine.build_incident_context()'s raw_snapshot parameter.
 
    This deliberately reads the collector thread's own output rather than
    scraping again -- avoids a duplicate SSH round-trip against the
    primary host on every anomaly tick. Returns {} (not None) on any
    failure, since build_incident_context() already handles an empty/
    missing raw_snapshot dict gracefully (see its own `if raw_snapshot and
    isinstance(raw_snapshot, dict):` guard).
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute(
            "SELECT data FROM metrics_timeseries ORDER BY timestamp DESC LIMIT 1"
        ).fetchone()
        conn.close()
        if row is None:
            return {}
        return json.loads(row[0])
    except Exception as e:
        print(f"[orchestrator] _read_latest_snapshot_for_rca error: {e}", flush=True)
        return {}

def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

    print("=" * 72, flush=True)
    print("      CEPH AI FAULT MONITORING SYSTEM  —  ML + LLM EDITION           ", flush=True)
    print("=" * 72, flush=True)

    metrics_collector.init_db()
    init_anomaly_status_table()
    init_rca_incidents_table()

    print("Starting Metrics Collector thread...", flush=True)
    start_thread(metrics_collector.main, "metrics_collector")

    print("Starting Log Streamer thread...", flush=True)
    start_thread(host_log_streamer.main, "log_streamer")

    target = ml_anomaly_detector.MIN_BASELINE_SAMPLES
    print(
        f"\nSystem running.  ML baseline requires {target} samples "
        f"({target * 15 // 60}m {target * 15 % 60}s).",
        flush=True,
    )

    time.sleep(20)  # let the first metric scrape land

    last_log_check   = datetime.now()
    log_check_interval = 60

    try:
        while True:
            # ── ML Anomaly Detection (every 15 s) ──────────────────────────
            result = ml_anomaly_detector.detect_anomalies()
            v8_result = ceph_semantic_baseline.detect_anomalies()
            normalized = normalize_anomaly_status(result, v8_result)
            write_anomaly_status(normalized)

            if result:
                status  = result.get("status")
                samples = result.get("samples_collected", 0)

                if status == "collecting_data":
                    pct = int((samples / target) * 30)
                    bar = "█" * pct + "░" * (30 - pct)
                    print(
                        f"\r  Baseline [{bar}] {samples}/{target}", end="", flush=True
                    )
                elif result.get("is_anomaly"):
                    snap = _read_latest_snapshot_for_rca()
                    handle_ml_anomaly(result, v8_result=v8_result, snap=snap)

            # ── LLM Log Trend Analysis (every 60 s) ────────────────────────
            if (datetime.now() - last_log_check).total_seconds() >= log_check_interval:
                last_log_check = datetime.now()
                recent_logs    = get_recent_logs(seconds=log_check_interval)
                if recent_logs:
                    log_analysis = llm_analyst.analyze_log_window(recent_logs)
                    if log_analysis and log_analysis.get("health_issue_detected"):
                        alert_engine.print_alert(
                            alert_type="Gemma Log Sequence Analyst",
                            title=log_analysis.get("title", "Health Pattern in Logs"),
                            explanation=log_analysis.get("explanation", ""),
                            recommended_action=log_analysis.get("recommended_action", ""),
                            severity=log_analysis.get("severity", "INFO"),
                        )

            time.sleep(15)

    except KeyboardInterrupt:
        print("\nStopping. Goodbye!", flush=True)


if __name__ == "__main__":
    main()
