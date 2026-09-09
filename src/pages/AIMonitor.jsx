import { useState, useEffect, useCallback } from "react";

import { AIMonitorAPI } from "../api/aiMonitor";
import { C, styles } from "../styles/theme";

/*
 * AIMonitor.jsx -- "Cluster Intelligence" dashboard tab
 *
 * Surfaces the ceph-ai monitoring subsystem: connectivity/health of the
 * separate ceph-ai process, the normalized host-layer (v7) + Ceph-semantic
 * (v8) anomaly status, a recent metrics trend, a live events feed, and the
 * most recent RCA incident diagnosis if one has fired.
 *
 * This is a self-contained page (no separate hook file, unlike
 * ObjectStorage.jsx's useObjects) since Phase 5 doesn't have an existing
 * hooks/useAIMonitor.js pattern to mirror faithfully -- if the codebase
 * later wants data-loading pulled out into a hook (matching the
 * useObjects.js precedent), that refactor is straightforward from here
 * without changing the API surface this component exposes to its parent.
 *
 * All five endpoints degrade gracefully:
 *   - enabled:false (CEPH_AI_ENABLED=false)  -> "not configured" panel
 *   - reachable:false                        -> "process offline" banner
 *   - writing:false (stale)                  -> "stalled" banner
 *   - table-not-found errors (503, pre-Phase-3-write for rca_incidents,
 *     or pre-Phase-2-write for anomaly_status on a fresh deploy)
 *                                             -> section-level empty states,
 *                                                not a page-level crash
 */

const POLL_INTERVAL_MS = 10000;

function formatSecondsAgo(seconds) {
    if (seconds == null) return "unknown";
    if (seconds < 60) return `${Math.round(seconds)}s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    return `${Math.round(seconds / 3600)}h ago`;
}

function severityBadgeStyle(severity) {
    switch ((severity || "").toUpperCase()) {
        case "CRITICAL": return styles.aiMonitorRcaSeverityCritical;
        case "HIGH": return styles.aiMonitorRcaSeverityHigh;
        case "WARNING": return styles.aiMonitorRcaSeverityWarning;
        default: return styles.aiMonitorRcaSeverityInfo;
    }
}

function eventSeverityStyle(severity) {
    switch ((severity || "").toUpperCase()) {
        case "CRITICAL": return styles.aiMonitorEventSeverityCritical;
        case "ERROR": return styles.aiMonitorEventSeverityError;
        case "WARNING": return styles.aiMonitorEventSeverityWarning;
        default: return styles.aiMonitorEventSeverityInfo;
    }
}

function LayerCard({ title, layer }) {
    const available = layer?.available;
    const isAnomaly = layer?.is_anomaly;

    const badgeStyle = !available
        ? styles.aiMonitorLayerBadgeUnavailable
        : isAnomaly
            ? styles.aiMonitorLayerBadgeAnomaly
            : styles.aiMonitorLayerBadgeOk;

    const badgeText = !available ? "UNAVAILABLE" : isAnomaly ? "ANOMALY" : "OK";

    const deviated = layer?.deviated_features || {};
    const deviatedEntries = Object.entries(deviated);

    return (
        <div style={{
            ...styles.aiMonitorLayerCard,
            ...(isAnomaly ? styles.aiMonitorLayerCardAnomaly : {})
        }}>
            <div style={styles.aiMonitorLayerHeader}>
                <span style={styles.aiMonitorLayerTitle}>{title}</span>
                <span style={{ ...styles.aiMonitorLayerBadge, ...badgeStyle }}>
                    {badgeText}
                </span>
            </div>

            {available && (
                <div style={styles.aiMonitorLayerStats}>
                    <div>
                        <div style={styles.aiMonitorLayerStatLabel}>Status</div>
                        <div style={styles.aiMonitorLayerStatValue}>
                            {layer.status || "—"}
                        </div>
                    </div>
                    <div>
                        <div style={styles.aiMonitorLayerStatLabel}>Decision Score</div>
                        <div style={styles.aiMonitorLayerStatValue}>
                            {layer.decision_score != null
                                ? layer.decision_score.toFixed(4)
                                : "—"}
                        </div>
                    </div>
                    <div>
                        <div style={styles.aiMonitorLayerStatLabel}>Reconstruction Error</div>
                        <div style={styles.aiMonitorLayerStatValue}>
                            {layer.pca_reconstruction_error != null
                                ? layer.pca_reconstruction_error.toFixed(4)
                                : "—"}
                        </div>
                    </div>
                    <div>
                        <div style={styles.aiMonitorLayerStatLabel}>Detection Method</div>
                        <div style={styles.aiMonitorLayerStatValue}>
                            {layer.detection_method || "—"}
                        </div>
                    </div>
                </div>
            )}

            {available && layer.message && (
                <div style={{ fontSize: ".8rem", color: C.muted }}>
                    {layer.message}
                </div>
            )}

            {deviatedEntries.length > 0 && (
                <div style={styles.aiMonitorDeviatedList}>
                    {deviatedEntries.slice(0, 5).map(([key, v]) => (
                        <div key={key} style={styles.aiMonitorDeviatedItem}>
                            <span style={styles.aiMonitorDeviatedItemLabel}>{key}</span>
                            {" — "}
                            current {typeof v.current === "number" ? v.current.toFixed(2) : v.current},
                            {" "}baseline {typeof v.baseline_mean === "number" ? v.baseline_mean.toFixed(2) : v.baseline_mean},
                            {" "}z={v.z_score}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function EventsFeed({ events }) {
    if (!events || events.length === 0) {
        return <div style={styles.aiMonitorEventsEmpty}>No recent events.</div>;
    }

    return (
        <div>
            {events.map((ev, idx) => (
                <div
                    key={`${ev.timestamp}-${idx}`}
                    style={{
                        ...styles.aiMonitorEventRow,
                        ...(idx === events.length - 1 ? styles.aiMonitorEventRowLast : {})
                    }}
                >
                    <span style={styles.aiMonitorEventTime}>
                        {ev.timestamp ? ev.timestamp.split("T")[1]?.replace("Z", "") : "—"}
                    </span>
                    <span style={{ ...styles.aiMonitorEventSeverity, ...eventSeverityStyle(ev.severity) }}>
                        {ev.severity || "INFO"}
                    </span>
                    <span style={styles.aiMonitorEventComponent}>{ev.component}</span>
                    <span style={styles.aiMonitorEventMessage}>{ev.message}</span>
                </div>
            ))}
        </div>
    );
}

function RcaIncidentCard({ incident }) {
    if (!incident) {
        return (
            <div style={styles.aiMonitorRcaEmpty}>
                <div style={styles.aiMonitorRcaEmptyTitle}>No active incidents</div>
                <div>No RCA diagnosis has been triggered recently.</div>
            </div>
        );
    }

    return (
        <div style={styles.aiMonitorRcaCard}>
            <div style={styles.aiMonitorRcaHeader}>
                <div style={styles.aiMonitorRcaTitleGroup}>
                    <span style={styles.aiMonitorRcaCategory}>
                        {incident.fault_category} · {incident.incident_id}
                    </span>
                    <span style={styles.aiMonitorRcaSummary}>
                        {incident.root_cause_summary}
                    </span>
                </div>
                <span style={{ ...styles.aiMonitorRcaSeverityBadge, ...severityBadgeStyle(incident.severity) }}>
                    {incident.severity}
                </span>
            </div>

            {incident.detailed_explanation && (
                <div style={styles.aiMonitorRcaDetail}>
                    {incident.detailed_explanation}
                </div>
            )}

            {incident.evidence_chain && incident.evidence_chain.length > 0 && (
                <div style={styles.aiMonitorRcaSection}>
                    <span style={styles.aiMonitorRcaSectionLabel}>Evidence Chain</span>
                    {incident.evidence_chain.map((ev, i) => (
                        <div key={i} style={styles.aiMonitorRcaEvidenceItem}>
                            <span style={{ color: C.accent }}>•</span>
                            <span>{ev}</span>
                        </div>
                    ))}
                </div>
            )}

            {incident.blast_radius && (
                <div style={styles.aiMonitorRcaSection}>
                    <span style={styles.aiMonitorRcaSectionLabel}>Blast Radius</span>
                    <div style={styles.aiMonitorRcaBlastRadius}>{incident.blast_radius}</div>
                </div>
            )}

            {incident.remediation_steps && incident.remediation_steps.length > 0 && (
                <div style={styles.aiMonitorRcaSection}>
                    <span style={styles.aiMonitorRcaSectionLabel}>Remediation Runbook</span>
                    <div style={styles.aiMonitorRcaRemediationList}>
                        {incident.remediation_steps.map((step, i) => (
                            <div key={i} style={styles.aiMonitorRcaRemediationStep}>
                                <span style={styles.aiMonitorRcaStepNumber}>{i + 1}.</span>
                                <span>{step}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {incident.verification_command && (
                <div style={styles.aiMonitorRcaVerification}>
                    <span style={styles.aiMonitorRcaSectionLabel}>Verify:</span>
                    <span style={styles.aiMonitorRcaVerificationCmd}>
                        {incident.verification_command}
                    </span>
                </div>
            )}

            {incident.source && (
                <div style={styles.aiMonitorRcaSource}>Diagnosed by {incident.source}</div>
            )}
        </div>
    );
}

export default function AIMonitorPage({ toast }) {
    const [connectivity, setConnectivity] = useState(null);
    const [statusData, setStatusData] = useState(null);
    const [events, setEvents] = useState([]);
    const [rcaIncident, setRcaIncident] = useState(null);
    const [loading, setLoading] = useState(true);
    const [enabled, setEnabled] = useState(true);

    const loadAll = useCallback(async (silent = false) => {
        try {
            const conn = await AIMonitorAPI.connectivity();

            if (conn.enabled === false) {
                setEnabled(false);
                if (!silent) setLoading(false);
                return;
            }
            setEnabled(true);
            setConnectivity(conn);

            // Fire the remaining requests in parallel; each is independently
            // tolerant of its own table-not-found / unreachable state, so
            // one failing shouldn't block the others from rendering.
            const [statusResult, eventsResult, rcaResult] = await Promise.allSettled([
                AIMonitorAPI.status(),
                AIMonitorAPI.events(120, 20),
                AIMonitorAPI.rcaLatest(),
            ]);

            if (statusResult.status === "fulfilled") {
                setStatusData(statusResult.value.status || null);
            }

            if (eventsResult.status === "fulfilled") {
                setEvents(eventsResult.value.events || []);
            }

            if (rcaResult.status === "fulfilled") {
                setRcaIncident(rcaResult.value.incident || null);
            }
        } catch (err) {
            if (!silent) {
                toast(
                    err.message || "Failed to load AI monitor status.",
                    "error"
                );
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadAll(false);
    }, [loadAll]);

    useEffect(() => {
        const interval = setInterval(() => loadAll(true), POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [loadAll]);

    if (!enabled) {
        return (
            <div style={styles.aiMonitorPage}>
                <div style={styles.aiMonitorDisabled}>
                    <div style={styles.aiMonitorDisabledTitle}>
                        Cluster Intelligence is not enabled
                    </div>
                    <div style={styles.aiMonitorDisabledText}>
                        Set CEPH_AI_ENABLED=true and CEPH_AI_DB_PATH once the
                        ceph-ai monitoring process is deployed to see live
                        anomaly detection and root-cause analysis here.
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div style={styles.aiMonitorPage}>
                <div style={{ color: C.muted, padding: "2rem", textAlign: "center" }}>
                    Loading cluster intelligence…
                </div>
            </div>
        );
    }

    const reachable = connectivity?.reachable;
    const writing = connectivity?.writing;
    const dotStyle = !reachable
        ? styles.aiMonitorBannerDotOff
        : writing
            ? styles.aiMonitorBannerDotOk
            : styles.aiMonitorBannerDotWarn;
    const bannerText = !reachable
        ? "ceph-ai process offline"
        : writing
            ? "ceph-ai monitoring active"
            : "ceph-ai process stalled";

    return (
        <div style={styles.aiMonitorPage}>
            <div style={styles.aiMonitorBanner}>
                <div style={styles.aiMonitorBannerStatus}>
                    <span style={{ ...styles.aiMonitorBannerDot, ...dotStyle }} />
                    <span>{bannerText}</span>
                </div>
                <span style={styles.aiMonitorBannerMeta}>
                    Last write: {formatSecondsAgo(connectivity?.last_write_seconds_ago)}
                </span>
            </div>

            <div style={styles.aiMonitorLayerGrid}>
                <LayerCard title="Host Layer (v7)" layer={statusData?.host_layer} />
                <LayerCard title="Ceph Semantic Layer (v8)" layer={statusData?.ceph_layer} />
            </div>

            <div>
                <div style={styles.workspaceCardTitle}>Root Cause Analysis</div>
                <RcaIncidentCard incident={rcaIncident} />
            </div>

            <div style={styles.aiMonitorEventsCard}>
                <div style={styles.workspaceCardTitle}>Recent Events</div>
                <EventsFeed events={events} />
            </div>
        </div>
    );
}