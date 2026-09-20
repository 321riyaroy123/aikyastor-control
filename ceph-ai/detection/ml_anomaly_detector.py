import os
import re
import json
import sqlite3
import pickle
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from dotenv import load_dotenv
from sklearn.preprocessing import RobustScaler
from sklearn.feature_selection import VarianceThreshold
from sklearn.ensemble import IsolationForest
from sklearn.svm import OneClassSVM
from sklearn.decomposition import PCA
import sklearn

load_dotenv()

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("DB_PATH", os.path.join(ROOT_DIR, "ceph_monitor.db"))
MODEL_STATE_PATH = os.path.join(os.path.dirname(DB_PATH), "ml_model_state.pkl")

# Minimum clean baseline samples required before ensemble trains and locks.
# Rule of thumb: ~10x the number of active (non-constant) features.
MIN_BASELINE_SAMPLES = 60

# Evaluation window: only score telemetry from the last N minutes against the locked model.
EVAL_WINDOW_MINUTES = 30

# Model version tag — bump this string any time sklearn or feature set changes.
MODEL_VERSION = f"sklearn-{sklearn.__version__}-v7"

# Phase state
_phase         = "monitoring"   # "learning" | "monitoring"
_locked_ensemble   = None
_locked_baseline_X = None
_locked_active_features = None
_locked_sentinel_baselines = None
_consecutive_anomalies     = 0


# ── Structural Sentinel Configuration (Solution B: Discrete State-Change Monitor) ──────────
# These features are intentionally EXCLUDED from the ML pipeline (they are constants
# in healthy operation) but are wired as deterministic instant alerts if they change.
STRUCTURAL_SENTINELS = {
    "ceph_threads":          {"alert_if": "min_floor", "min_floor": 1.0, "description": "Ceph daemon worker thread count"},
    "pg_degraded_count":     {"alert_if": "above_zero",       "description": "Degraded Placement Groups"},
    "cluster_health_code":   {"alert_if": "above_zero",       "description": "Cluster health (0=OK, 1=WARN, 2=ERR)"},
    "osd_down_count":        {"alert_if": "above_zero",       "description": "OSDs in DOWN state"},
    "osd_apply_latency_ms":  {"alert_if": "above_thresh", "thresh": 100.0, "description": "OSD apply commit latency"},
    "sys_ram_available_mib": {"alert_if": "capacity_deplete", "description": "Available system RAM capacity"},
    "ceph_ram_mib":          {"alert_if": "capacity_leak",    "description": "Ceph daemon RAM consumption"},
}


def _now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def start_learning(clear_existing=True):
    """
    Enter LEARNING phase. Call this when the cluster is confirmed healthy and
    you want the AI to learn a new operational baseline (e.g., after maintenance,
    after incident resolution, or on first startup).
    
    While in LEARNING phase, every snapshot written to the DB is tagged is_baseline=1.
    Call stop_learning() after MIN_BASELINE_SAMPLES are collected to lock the model.
    """
    global _phase, _locked_ensemble, _locked_baseline_X, _locked_active_features, _locked_sentinel_baselines, _consecutive_anomalies
    _phase = "learning"
    _locked_ensemble = None
    _locked_baseline_X = None
    _locked_active_features = None
    _locked_sentinel_baselines = None
    _consecutive_anomalies = 0

    # Clear any previously persisted model
    if os.path.exists(MODEL_STATE_PATH):
        try:
            os.remove(MODEL_STATE_PATH)
        except Exception as e:
            print(f"[ML] Warning: Could not delete old model state: {e}")

    if clear_existing:
        # Clear old baseline tags in DB so fresh learning starts clean
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.execute("UPDATE metrics_timeseries SET is_baseline = 0")
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[ML] Warning: Could not clear baseline tags: {e}")

    # Persist LEARNING state so the metrics collector can tag new rows.
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.execute("""
            INSERT INTO baseline_control (id, learning)
            VALUES (1, 1)
            ON CONFLICT(id) DO UPDATE SET learning = 1
        """)
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[ML] Warning: Could not enable baseline learning in DB: {e}")
        raise

    print(f"[ML] LEARNING phase started at {_now_iso()}. Collecting healthy baseline telemetry...", flush=True)
    print(f"[ML] Ensure cluster is in known-good state. Collect at least {MIN_BASELINE_SAMPLES} snapshots then stop_learning().", flush=True)


def stop_learning():
    """
    Exit LEARNING phase and lock the model. Call this after enough baseline
    snapshots have been tagged. The model trains immediately on tagged baseline data.
    """
    global _phase
    _phase = "monitoring"
    # Persist MONITORING state so the collector stops tagging baseline rows.
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.execute("""
            INSERT INTO baseline_control (id, learning)
            VALUES (1, 0)
            ON CONFLICT(id) DO UPDATE SET learning = 0
        """)
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[ML] Warning: Could not disable baseline learning in DB: {e}")
        raise
    print(f"[ML] LEARNING phase ended. Transitioning to MONITORING. Model will train on next detect_anomalies() call.", flush=True)


def reset_model():
    """Alias for start_learning(clear_existing=True) — retained for backward compatibility with test harness."""
    start_learning(clear_existing=True)


def _load_persisted_model():
    """Attempt to restore persisted ensemble from disk, rejecting stale versions."""
    global _locked_ensemble, _locked_baseline_X, _locked_active_features, _locked_sentinel_baselines
    if _locked_ensemble is None and os.path.exists(MODEL_STATE_PATH):
        try:
            with open(MODEL_STATE_PATH, "rb") as f:
                saved = pickle.load(f)
            if saved.get("version") != MODEL_VERSION:
                print(f"[ML] Persisted model version mismatch ({saved.get('version')} vs {MODEL_VERSION}). Retraining required.", flush=True)
                os.remove(MODEL_STATE_PATH)
                return
            _locked_ensemble = saved["ensemble"]
            _locked_baseline_X = saved["baseline_X"]
            _locked_active_features = saved["active_features"]
            _locked_sentinel_baselines = saved["sentinel_baselines"]
            print("[ML] Restored persisted AI Ensemble from disk.", flush=True)
        except Exception as e:
            print(f"[ML] Failed to load persisted model: {e}")
            _locked_ensemble = None


def _save_persisted_model():
    """Persist learned ensemble to disk with version metadata."""
    try:
        with open(MODEL_STATE_PATH, "wb") as f:
            pickle.dump({
                "version": MODEL_VERSION,
                "ensemble": _locked_ensemble,
                "baseline_X": _locked_baseline_X,
                "active_features": _locked_active_features,
                "sentinel_baselines": _locked_sentinel_baselines,
            }, f)
        print(f"[ML] Model state persisted to {MODEL_STATE_PATH}.", flush=True)
    except Exception as e:
        print(f"[ML] Warning: Could not persist model: {e}")


# ── Metric name aliasing ────────────────────────────────────────────────────
# metrics_collector.py flattens whatever chart/dimension names the local
# Netdata build reports (parse_netdata_metrics: f"{chart}__{dimension}" with
# non-alnum -> "_"). Older Netdata releases exposed apps.plugin charts as
# apps.cpu / apps.mem / apps.lreads / etc (flattened: "apps_cpu__ceph", ...).
# Netdata v2.x renamed these to the app_group.* naming scheme (e.g.
# app_group.cpu_utilization, app_group.mem_usage, app_group.disk_logical_io),
# which this environment's collector flattens to keys observed in the DB such
# as "usergroup_ceph_cpu_utilization__system" / "usergroup_ceph_mem_usage__rss".
#
# Rather than hardcoding one Netdata version's flattened names into
# extract_features(), each semantic feature below resolves against an
# ordered list of CANDIDATES -- each either an exact column name (str) or a
# regex (re.Pattern) matched against df.columns. The first candidate with a
# real match in the current scrape wins, so this tolerates the old names,
# the new names, and (within reason) future Netdata renames, without ever
# silently substituting 0.0 for a metric that truly isn't being collected.
METRIC_ALIASES = {
    # Pillar 1 -- Storage Workload & Performance
    "lreads":  ["apps_lreads__ceph", re.compile(r"^usergroup_ceph_disk_logical_io__reads$")],
    "lwrites": ["apps_lwrites__ceph", re.compile(r"^usergroup_ceph_disk_logical_io__writes$")],
    "pwrites": ["apps_pwrites__ceph", re.compile(r"^usergroup_ceph_disk_physical_io__writes$")],
    "cpu_iowait_pct": ["system_cpu__iowait", re.compile(r"^system_cpu(_utilization)?__iowait$")],

    # Pillar 2 -- Ceph Memory & Footprint Stability
    "ceph_ram_mib":           ["apps_mem__ceph", re.compile(r"^usergroup_ceph_mem_usage__rss$")],
    "ceph_minor_faults_rate": ["apps_minor_faults__ceph", re.compile(r"^usergroup_ceph_mem_page_faults__minor$")],
    "sys_ram_available_mib":  ["mem_available__MemAvailable", re.compile(r"^(system_)?mem_available__.*avail.*$", re.IGNORECASE)],

    # Pillar 3 -- Compute & Kernel Pressure
    # Netdata's app_group.cpu_utilization chart reports user+system dimensions
    # separately (no single combined "total cpu" dimension like the old
    # apps.cpu chart), so ceph_cpu_pct sums both when only the split form
    # exists -- handled specially in extract_features(), not via a single
    # alias, since it's a sum of two candidates rather than a straight rename.
    "ceph_cpu_pct_user":   ["apps_cpu__ceph", re.compile(r"^usergroup_ceph_cpu_utilization__user$")],
    "ceph_cpu_pct_system": [re.compile(r"^usergroup_ceph_cpu_utilization__system$")],
    # PSI (/proc/pressure) is a kernel feature, off by default on RHEL/Rocky
    # 8/9 (needs psi=1 on the kernel cmdline + reboot). When disabled, Netdata
    # emits no system.cpu_some_pressure chart at all -- not a naming mismatch,
    # a genuinely absent metric, so this correctly stays NaN/rejected until
    # PSI is turned on. Confirmed directly against a live DB dump after
    # enabling PSI: Netdata's dimension name is "some_10" (underscore before
    # the window number), flattening to "system_cpu_some_pressure__some_10" --
    # not "some10" as the generic Netdata docs table implied.
    "kernel_cpu_pressure": ["system_cpu_some_pressure__some_10"],

    # Pillar 4 -- Structural Constants (sentinel-only)
    "ceph_threads": ["apps_threads__ceph", re.compile(r"^usergroup_ceph_threads__threads$")],
}


def _resolve_alias(df, semantic_name):
    """
    Resolves a semantic feature name to the first matching raw column(s) in
    df, per METRIC_ALIASES. Returns (series, matched_column_name) where
    series is NaN-filled (index-aligned) if nothing matched at all.
    """
    candidates = METRIC_ALIASES.get(semantic_name, [])
    for candidate in candidates:
        if isinstance(candidate, str):
            if candidate in df.columns:
                return df[candidate].fillna(0.0), candidate
        else:  # compiled regex
            matches = [c for c in df.columns if candidate.match(c)]
            if matches:
                # Multiple dimension matches (rare) -- sum them rather than
                # picking one arbitrarily, since they represent the same
                # semantic quantity split across sub-dimensions.
                if len(matches) == 1:
                    return df[matches[0]].fillna(0.0), matches[0]
                return df[matches].sum(axis=1, min_count=1), f"sum({matches})"
    return pd.Series(np.nan, index=df.index), None


_alias_miss_logged = set()  # module-level: log each total-miss once per process, not once per scrape


def _get_metric_or_nan(df, col):
    """Returns column if present; NaN if missing from scrape so integrity check rejects it."""
    if col in df.columns:
        return df[col].fillna(0.0)
    return pd.Series(np.nan, index=df.index)


def _get_aliased_metric(df, semantic_name):
    """
    Like _get_metric_or_nan, but resolves through METRIC_ALIASES first so
    features survive Netdata chart/dimension renames. Logs (once per
    process) when a semantic feature can't be resolved against ANY known
    alias, since that's a real telemetry gap -- not just a naming mismatch
    -- and should stay visible rather than silently becoming NaN forever.
    """
    series, matched = _resolve_alias(df, semantic_name)
    if matched is None and semantic_name not in _alias_miss_logged:
        _alias_miss_logged.add(semantic_name)
        tried = METRIC_ALIASES.get(semantic_name, [])
        tried_repr = [t if isinstance(t, str) else t.pattern for t in tried]
        print(
            f"[ML] WARNING: no raw metric found for semantic feature "
            f"'{semantic_name}'. Tried: {tried_repr}. This feature will be "
            f"NaN and rows containing it will fail verify_data_integrity() "
            f"until a matching metric is collected.",
            flush=True,
        )
    return series


def extract_features(df):
    """
    Extracts all candidate features. Features are split into two groups:
    - ML Features: dynamic, variable metrics fed into the ensemble
    - Sentinel Features: structural constants monitored via discrete state-change alerts
    Returns the full feature DataFrame; ML pipeline filters constants automatically.
    """
    features_df = pd.DataFrame(index=df.index)

    # ── Pillar 1: Storage Workload & Performance ─────────────────────────────
    lreads  = _get_aliased_metric(df, 'lreads')
    lwrites = _get_aliased_metric(df, 'lwrites')
    pwrites = _get_aliased_metric(df, 'pwrites')

    total_io = lreads + lwrites + pwrites
    features_df['storage_total_iobps']  = total_io
    # Read/write ratio: 0.0 = pure write, 1.0 = pure read. Bounded [0,1], low natural variance.
    features_df['storage_rw_ratio']     = lreads / (total_io + 1.0)

    backlog_cols = [c for c in df.columns if 'disk_backlog_' in c and '__backlog' in c]
    features_df['disk_queue_depth'] = df[backlog_cols].max(axis=1).fillna(0.0) if backlog_cols else 0.0

    apply_lat_cols = [c for c in df.columns if 'ceph_osd_apply_latency__' in c]
    features_df['osd_apply_latency_ms'] = df[apply_lat_cols].max(axis=1).fillna(0.0) if apply_lat_cols else 0.0

    features_df['cpu_iowait_pct'] = _get_aliased_metric(df, 'cpu_iowait_pct')

    # ── Pillar 2: Ceph Memory & Footprint Stability ──────────────────────────
    features_df['ceph_ram_mib']          = _get_aliased_metric(df, 'ceph_ram_mib')
    features_df['ceph_minor_faults_rate']= _get_aliased_metric(df, 'ceph_minor_faults_rate')
    features_df['sys_ram_available_mib'] = _get_aliased_metric(df, 'sys_ram_available_mib')

    # ── Pillar 3: Compute & Kernel Pressure ──────────────────────────────────
    # The old apps.cpu chart had one combined dimension; app_group.cpu_utilization
    # (current Netdata) splits it into user/system dimensions, so this is a sum
    # of two aliased candidates rather than a single renamed column. If only one
    # side is present, add(fill_value=0.0) still yields a real number, not NaN;
    # if NEITHER side is present both are NaN and the sum correctly stays NaN.
    cpu_user   = _get_aliased_metric(df, 'ceph_cpu_pct_user')
    cpu_system = _get_aliased_metric(df, 'ceph_cpu_pct_system')
    features_df['ceph_cpu_pct'] = cpu_user.add(cpu_system, fill_value=0.0) if not (cpu_user.isna().all() and cpu_system.isna().all()) else cpu_user
    features_df['kernel_cpu_pressure'] = _get_aliased_metric(df, 'kernel_cpu_pressure')

    # ── Pillar 4: Structural Constants (Sentinel-only, auto-filtered from ML) ──
    # These are included in the DataFrame so sentinel checks work, but VarianceThreshold
    # will automatically exclude them from the ML pipeline at training time.
    features_df['ceph_threads']        = _get_aliased_metric(df, 'ceph_threads')
    features_df['pg_degraded_count']   = df.get('ceph_pg_degraded',    pd.Series(0.0, index=df.index)).fillna(0.0)
    # Default 0.0 = HEALTH_OK (not 2.0 = HEALTH_ERR — corrects the inverted encoding default bug)
    features_df['cluster_health_code'] = df.get('ceph_health_status',  pd.Series(0.0, index=df.index)).fillna(0.0)
    num_osds = df.get('ceph_osd_stat_osds', pd.Series(1.0, index=df.index)).fillna(1.0)
    num_up   = df.get('ceph_osd_stat_osds_up', pd.Series(1.0, index=df.index)).fillna(1.0)
    features_df['osd_down_count']      = np.maximum(0.0, num_osds - num_up)

    return features_df


def verify_data_integrity(features_df):
    """
    Rejects structurally broken scrapes before they can pollute the model.
    Checks for NaNs, infinities, and missing vital heartbeats.
    """
    if features_df.empty:
        return pd.Series(False, index=features_df.index)

    no_nans = ~features_df.isna().any(axis=1)
    no_infs = ~np.isinf(features_df.fillna(0).values).any(axis=1)
    valid_heartbeats = (features_df['sys_ram_available_mib'] > 10.0) & (features_df['ceph_threads'] > 0.0)

    return no_nans & no_infs & valid_heartbeats


def check_structural_sentinels(latest_row, sentinel_baselines):
    """
    Solution B: Discrete State-Change Monitor.
    Checks the four structural constants completely independently of the ML pipeline.
    Any deviation from their locked baseline triggers an immediate deterministic alert.
    
    Returns a list of alert strings (empty = all clear).
    """
    alerts = []
    for feature, config in STRUCTURAL_SENTINELS.items():
        current = float(latest_row.get(feature, np.nan))
        if np.isnan(current):
            continue  # Missing scrape — do not false-alarm

        expected_obj = sentinel_baselines.get(feature, None)
        if expected_obj is None:
            continue
        expected = expected_obj.get("median", 0.0)

        if config["alert_if"] == "min_floor":
            floor = config.get("min_floor", 10.0)
            if current < floor:
                alerts.append({
                    "feature": feature,
                    "description": config["description"],
                    "expected": f">= {floor}",
                    "current": current,
                    "alert": f"{config['description']} collapsed below floor: {current} (min: {floor})"
                })
        elif config["alert_if"] == "changes":
            if current != expected:
                alerts.append({
                    "feature": feature,
                    "description": config["description"],
                    "expected": expected,
                    "current": current,
                    "alert": f"{config['description']} changed from {expected} to {current}"
                })
        elif config["alert_if"] == "statistical_tolerance":
            min_val = expected_obj.get("min", expected - 2.0)
            max_val = expected_obj.get("max", expected + 2.0)
            if current < min_val or current > max_val:
                alerts.append({
                    "feature": feature,
                    "description": config["description"],
                    "expected": f"[{min_val} - {max_val}]",
                    "current": current,
                    "alert": f"{config['description']} out of bounds: {current} (allowed: {min_val} to {max_val})"
                })
        elif config["alert_if"] == "above_thresh":
            thresh = config.get("thresh", 100.0)
            if current > thresh:
                alerts.append({
                    "feature": feature,
                    "description": config["description"],
                    "expected": f"<= {thresh}",
                    "current": current,
                    "alert": f"{config['description']} = {current} ms (limit: {thresh} ms)"
                })
        elif config["alert_if"] == "above_zero":
            if current > 0:
                alerts.append({
                    "feature": feature,
                    "description": config["description"],
                    "expected": 0.0,
                    "current": current,
                    "alert": f"{config['description']} = {current} (expected 0)"
                })
        elif config["alert_if"] == "capacity_deplete":
            deplete_thresh = expected_obj.get("deplete_thresh", expected * 0.60)
            if current < deplete_thresh:
                alerts.append({
                    "feature": feature,
                    "description": config["description"],
                    "expected": round(expected, 1),
                    "current": current,
                    "alert": f"{config['description']} critically depleted: {current:.1f} (thresh: {deplete_thresh:.1f})"
                })
        elif config["alert_if"] == "capacity_leak":
            leak_thresh = expected_obj.get("leak_thresh", expected * 2.0)
            if current > leak_thresh:
                alerts.append({
                    "feature": feature,
                    "description": config["description"],
                    "expected": round(expected, 1),
                    "current": current,
                    "alert": f"{config['description']} leak warning: {current:.1f} (thresh: {leak_thresh:.1f})"
                })
    return alerts


def _attribute_feature_deviations(latest_row, baseline_X, active_features):
    """
    Feature attribution: explains WHY the ensemble triggered, using Z-score
    divergence against the locked baseline — purely for operational visibility.
    Z-score is NOT used as a detection trigger; that job belongs to the ML models.
    """
    deviated = {}
    for col in active_features:
        if col not in baseline_X.columns:
            continue
        mean = baseline_X[col].mean()
        std  = baseline_X[col].std()
        curr = float(latest_row[col])

        if std < 1e-6:
            if abs(curr - mean) > 1e-4:
                deviated[col] = {"current": curr, "baseline_mean": float(mean), "z_score": 99.9}
        else:
            z = abs(curr - mean) / std
            if z >= 3.0:
                deviated[col] = {"current": curr, "baseline_mean": float(mean), "z_score": round(float(z), 2)}

    # If no single feature hit 3σ, surface the top 3 most divergent for operational context
    if not deviated:
        z_scores = []
        for col in active_features:
            if col not in baseline_X.columns:
                continue
            mean = baseline_X[col].mean()
            std  = baseline_X[col].std() + 1e-9
            z_scores.append((col, abs(float(latest_row[col]) - mean) / std))
        z_scores.sort(key=lambda x: x[1], reverse=True)
        for col, z in z_scores[:3]:
            deviated[col] = {
                "current": float(latest_row[col]),
                "baseline_mean": float(baseline_X[col].mean()),
                "z_score": round(float(z), 2)
            }
    return deviated


def detect_anomalies():
    """
    Main detection function. Behaviour depends on phase:
    
    LEARNING phase:  Returns status="learning", no anomaly scoring.
    MONITORING phase: Trains model on tagged baseline rows (once), then evaluates
                      each call against the most recent data within EVAL_WINDOW_MINUTES.
    
    Detection uses an Unsupervised Ensemble with Majority Vote (2 of 3 models):
    - RobustScaler (median/IQR normalization — resistant to cross-session throughput spikes)
    - VarianceThreshold (auto-removes constant features from ML pipeline)
    - Scaled Isolation Forest
    - One-Class SVM (gamma='scale', adapts to actual feature variance)
    - PCA Reconstruction Error (P95-based threshold)
    
    Structural sentinel checks run independently and always return discrete alerts.
    """
    global _locked_ensemble, _locked_baseline_X, _locked_active_features, _locked_sentinel_baselines

    if not os.path.exists(DB_PATH):
        return None

    if _phase == "learning":
        return {"status": "learning", "is_anomaly": False, "detection_method": None,
                "timestamp": _now_iso(), "deviated_features": {}, "sentinel_alerts": []}

    _load_persisted_model()

    try:
        conn = sqlite3.connect(DB_PATH)

        # ── Training data: ONLY rows explicitly tagged as baseline ──────────────
        df_base_raw = pd.read_sql_query(
            "SELECT timestamp, data FROM metrics_timeseries WHERE is_baseline = 1 ORDER BY timestamp ASC",
            conn
        )

        # ── Evaluation data: most recent row within the rolling eval window ─────
        df_eval_raw = pd.read_sql_query(
            f"SELECT timestamp, data FROM metrics_timeseries "
            f"WHERE is_baseline = 0 AND timestamp >= datetime('now', '-{EVAL_WINDOW_MINUTES} minutes') "
            f"ORDER BY timestamp DESC LIMIT 1",
            conn
        )
        # Fallback: if no monitoring row in eval window, just take the latest overall
        if df_eval_raw.empty:
            df_eval_raw = pd.read_sql_query(
                "SELECT timestamp, data FROM metrics_timeseries WHERE is_baseline = 0 ORDER BY timestamp DESC LIMIT 1",
                conn
            )
        conn.close()
    except Exception as e:
        print(f"[ML] DB read error: {e}")
        return None

    # ── Parse baseline JSON ────────────────────────────────────────────────────
    base_rows, base_timestamps = [], []
    for _, row in df_base_raw.iterrows():
        try:
            base_rows.append(json.loads(row['data']))
            base_timestamps.append(row['timestamp'])
        except Exception:
            continue

    if not base_rows:
        return {"status": "no_baseline_data", "is_anomaly": False, "detection_method": None,
                "timestamp": _now_iso(), "deviated_features": {}, "sentinel_alerts": [],
                "message": "No baseline rows found. Call start_learning() to begin collecting baseline."}

    df_base = pd.DataFrame(base_rows)
    df_base['timestamp'] = base_timestamps
    X_base_all = extract_features(df_base)
    base_valid = verify_data_integrity(X_base_all)
    X_base_clean = X_base_all[base_valid].copy()
    base_clean_count = len(X_base_clean)

    if base_clean_count < MIN_BASELINE_SAMPLES:
        return {
            "status": "collecting_baseline",
            "is_anomaly": False,
            "detection_method": None,
            "timestamp": _now_iso(),
            "deviated_features": {},
            "sentinel_alerts": [],
            "samples_collected": base_clean_count,
            "samples_required": MIN_BASELINE_SAMPLES
        }

    # ── Train and lock ensemble once ──────────────────────────────────────────
    if _locked_ensemble is None:
        baseline_X = X_base_clean.copy()
        print(f"[ML] Training Unsupervised Ensemble on {len(baseline_X)} verified baseline samples...", flush=True)

        # Step 1: Exclude structural sentinels & capacity levels from unsupervised behavioral AI matrix
        candidate_ml_features = [c for c in baseline_X.columns if c not in STRUCTURAL_SENTINELS]
        X_candidates = baseline_X[candidate_ml_features].copy()

        selector = VarianceThreshold(threshold=0.01)
        try:
            selector.fit(X_candidates)
        except Exception:
            selector = None

        if selector is not None:
            active_mask = selector.get_support()
            active_features = X_candidates.columns[active_mask].tolist()
            removed = X_candidates.columns[~active_mask].tolist()
            if removed:
                print(f"[ML] Auto-removed {len(removed)} near-zero variance rate features from ML pipeline: {removed}", flush=True)
                # Audit trail for dropped features
                dropped_dict = {}
                for idx, col in enumerate(X_candidates.columns):
                    if not active_mask[idx]:
                        dropped_dict[col] = float(selector.variances_[idx])
                
                dropped_log_path = os.path.join(os.path.dirname(MODEL_STATE_PATH), "dropped_features.json")
                try:
                    with open(dropped_log_path, "w") as df_file:
                        json.dump({
                            "timestamp": _now_iso(), 
                            "dropped_features_variance": dropped_dict, 
                            "threshold_used": 0.01
                        }, df_file, indent=2)
                except Exception as e:
                    print(f"[ML] Warning: Could not save dropped_features.json: {e}")
        else:
            active_features = list(X_candidates.columns)

        baseline_ml = X_candidates[active_features].copy()

        # Step 2: Record sentinel and capacity baseline medians & bounds (Solution B - discrete & capacity monitor)
        sentinel_baselines = {}
        for feature, config in STRUCTURAL_SENTINELS.items():
            if feature in baseline_X.columns:
                series = baseline_X[feature]
                median_val = float(series.median())
                if config["alert_if"] == "capacity_deplete":
                    # Depletion threshold: 70% of baseline capacity (with 3-std statistical floor)
                    stat_thresh = float(np.percentile(series, 1)) - 3 * float(series.std())
                    deplete_thresh = min(stat_thresh, median_val * 0.70)
                    sentinel_baselines[feature] = {"median": median_val, "deplete_thresh": max(deplete_thresh, 100.0)}
                elif config["alert_if"] == "capacity_leak":
                    # Leak threshold: 130% of baseline consumption (with 3-std statistical ceiling)
                    stat_thresh = float(np.percentile(series, 99)) + 3 * float(series.std())
                    leak_thresh = max(stat_thresh, median_val * 1.30)
                    sentinel_baselines[feature] = {"median": median_val, "leak_thresh": leak_thresh}
                elif config["alert_if"] == "statistical_tolerance":
                    min_val = float(series.min()) - 2.0
                    max_val = float(series.max()) + 2.0
                    sentinel_baselines[feature] = {"median": median_val, "min": min_val, "max": max_val}
                else:
                    sentinel_baselines[feature] = {"median": median_val}

        # Step 3: RobustScaler with 25% operational allowance floor (prevents normal memory drift false alarms)
        scaler = RobustScaler(quantile_range=(10.0, 90.0))
        scaler.fit(baseline_ml)
        min_scales = np.maximum(0.25 * np.abs(scaler.center_), 1.0)
        for idx, col in enumerate(active_features):
            if 'minor_faults' in col:
                min_scales[idx] = max(min_scales[idx], 50.0)
            elif 'cpu' in col:
                min_scales[idx] = max(min_scales[idx], 5.0)
            elif 'mem' in col or 'ram' in col:
                min_scales[idx] = max(min_scales[idx], 100.0)
            elif 'pressure' in col or 'iowait' in col:
                min_scales[idx] = max(min_scales[idx], 2.0)
        scaler.scale_ = np.maximum(scaler.scale_, min_scales)
        baseline_scaled = scaler.transform(baseline_ml)

        # Step 4: Scaled Isolation Forest
        iso_forest = IsolationForest(contamination=0.03, n_estimators=150, random_state=42)
        iso_forest.fit(baseline_scaled)

        # Step 5: One-Class SVM with auto-scaled gamma
        # Guardrail: Ensure n_samples >= 10 * n_features
        svm_input = baseline_scaled
        pca_pre_svm = None
        if len(baseline_scaled) < 10 * baseline_scaled.shape[1] and baseline_scaled.shape[1] > 0:
            target_dim = max(1, len(baseline_scaled) // 10)
            print(f"[ML] SVM guardrail active: Reducing features from {baseline_scaled.shape[1]} to {target_dim} via PCA.", flush=True)
            pca_pre_svm = PCA(n_components=target_dim)
            svm_input = pca_pre_svm.fit_transform(baseline_scaled)

        oc_svm = OneClassSVM(kernel='rbf', gamma='scale', nu=0.03)
        oc_svm.fit(svm_input)

        # Step 6: PCA Reconstruction with moving-block bootstrap threshold
        pca = PCA(n_components=0.90)
        pca.fit(baseline_scaled)
        recon = pca.inverse_transform(pca.transform(baseline_scaled))
        base_errors = np.mean((baseline_scaled - recon)**2, axis=1)
        
        # Moving-block bootstrap for stable threshold estimation
        n_samples = len(base_errors)
        block_size = max(5, n_samples // 10)
        n_bootstraps = 100
        bootstrap_p95s = []
        for _ in range(n_bootstraps):
            start_indices = np.random.randint(0, max(1, n_samples - block_size + 1), size=max(1, (n_samples // block_size) + 1))
            resampled_errors = []
            for idx in start_indices:
                resampled_errors.extend(base_errors[idx : idx + block_size])
            bootstrap_p95s.append(np.percentile(resampled_errors[:n_samples], 95))
            
        pca_threshold = max(float(np.median(bootstrap_p95s)) * 5.0, 0.10)

        _locked_ensemble = {
            "scaler": scaler, "selector": selector,
            "iso_forest": iso_forest, "one_class_svm": oc_svm,
            "pca": pca, "pca_threshold": pca_threshold,
            "pca_pre_svm": pca_pre_svm
        }
        _locked_baseline_X = baseline_X
        _locked_active_features = active_features
        _locked_sentinel_baselines = sentinel_baselines
        _save_persisted_model()
        print(f"[ML] Ensemble locked. Active ML features ({len(active_features)}): {active_features}", flush=True)
        print(f"[ML] Structural sentinels ({len(sentinel_baselines)}): {list(sentinel_baselines.keys())}", flush=True)

    # ── Parse and validate evaluation point ───────────────────────────────────
    if df_eval_raw.empty:
        return {"status": "no_eval_data", "is_anomaly": False, "detection_method": None,
                "timestamp": _now_iso(), "deviated_features": {}, "sentinel_alerts": []}

    try:
        eval_flat = json.loads(df_eval_raw.iloc[0]['data'])
        eval_ts   = df_eval_raw.iloc[0]['timestamp']
    except Exception:
        return None

    df_eval = pd.DataFrame([eval_flat])
    df_eval['timestamp'] = eval_ts
    X_eval = extract_features(df_eval)

    if not verify_data_integrity(X_eval).iloc[0]:
        return {
            "status": "invalid_eval_scrape",
            "is_anomaly": False,
            "detection_method": None,
            "timestamp": eval_ts,
            "deviated_features": {},
            "sentinel_alerts": []
        }

    latest_row = X_eval.iloc[0]

    # ── Structural Sentinel Check (runs always, independent of ML models) ──────
    sentinel_alerts = check_structural_sentinels(latest_row, _locked_sentinel_baselines)
    if sentinel_alerts:
        for s in sentinel_alerts:
            print(f"[SENTINEL ALERT] {s['alert']}", flush=True)

    # ── ML Ensemble Evaluation ─────────────────────────────────────────────────
    eval_ml = X_eval[_locked_active_features].copy()
    x_scaled = _locked_ensemble["scaler"].transform(eval_ml)

    if_score  = float(_locked_ensemble["iso_forest"].decision_function(x_scaled)[0])
    if_anom   = bool(_locked_ensemble["iso_forest"].predict(x_scaled)[0] == -1)

    svm_eval_input = x_scaled
    if _locked_ensemble.get("pca_pre_svm") is not None:
        svm_eval_input = _locked_ensemble["pca_pre_svm"].transform(x_scaled)
    svm_anom  = bool(_locked_ensemble["one_class_svm"].predict(svm_eval_input)[0] == -1)

    recon_i   = _locked_ensemble["pca"].inverse_transform(_locked_ensemble["pca"].transform(x_scaled))
    pca_err   = float(np.mean((x_scaled - recon_i)**2))
    pca_anom  = bool(pca_err > _locked_ensemble["pca_threshold"])

    # Majority Vote: at least 2 of 3 models must agree
    triggered = []
    if if_anom:  triggered.append("Scaled-IsolationForest")
    if svm_anom: triggered.append("OneClassSVM")
    if pca_anom: triggered.append("PCA-Reconstruction")

    raw_consensus = len(triggered) >= 2
    global _consecutive_anomalies
    if raw_consensus:
        _consecutive_anomalies += 1
    else:
        _consecutive_anomalies = 0

    # Temporal persistence: require 2 consecutive consensus anomalies to filter out 1-second OS disk flushes
    has_sentinel_alert = bool(sentinel_alerts)
    is_anomaly = (raw_consensus and (_consecutive_anomalies >= 2)) or has_sentinel_alert

    if has_sentinel_alert:
        detection_method = f"Structural Sentinel Alert ({sentinel_alerts[0]['alert']})"
    elif is_anomaly:
        detection_method = f"AI Majority Consensus ({', '.join(triggered)})"
    else:
        detection_method = None

    deviated = _attribute_feature_deviations(latest_row, _locked_baseline_X, _locked_active_features) if is_anomaly else {}

    return {
        "is_anomaly":        is_anomaly,
        "decision_score":    round(if_score, 4),
        "pca_reconstruct":   round(pca_err, 4),
        "detection_method":  detection_method,
        "timestamp":         eval_ts,
        "deviated_features": deviated,
        "sentinel_alerts":   sentinel_alerts,
        "status":            "ready",
        "baseline_samples":  base_clean_count,
        "active_ml_features": len(_locked_active_features) if _locked_active_features else 0,
        "phase":             _phase,
    }


if __name__ == "__main__":
    res = detect_anomalies()
    print(json.dumps(res, indent=2, default=str))