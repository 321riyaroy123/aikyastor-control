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
 * REDESIGN NOTE (v2): the original layout rendered every section fully
 * expanded at equal visual weight -- two layer cards with raw model
 * internals (decision score, reconstruction error), then a fully-expanded
 * incident card (summary + detail + evidence chain + blast radius +
 * runbook + verify command), then the events feed. Nothing signaled what
 * to read first, so a real incident was exactly as visually loud as
 * routine "OK" status.
 *
 * This version reorders by priority and defers detail behind explicit
 * expansion:
 *   1. SummaryBar   - one line: is anything wrong, which layer, when
 *   2. IncidentHero - the single most important thing when one exists;
 *                     collapsed to title + plain summary + one suggested
 *                     action, with evidence/blast-radius/runbook/verify
 *                     behind "Show details"
 *   3. LayerList    - collapsed to one line per layer ("Anomaly -- <why>"
 *                     or "OK"); model internals expand on click, since
 *                     they're for verifying the model, not a first read
 *   4. EventsFeed   - quieter, capped at 5 with "Show more" -- it's a log
 *                     to scan, not an action item
 *
 * All five endpoints still degrade gracefully:
 *   - enabled:false (CEPH_AI_ENABLED=false)  -> "not configured" panel
 *   - reachable:false                        -> "process offline" banner
 *   - writing:false (stale)                  -> "stalled" banner
 *   - table-not-found errors (503, pre-Phase-3-write for rca_incidents,
 *     or pre-Phase-2-write for anomaly_status on a fresh deploy)
 *                                             -> section-level empty states,
 *                                                not a page-level crash
 */

const POLL_INTERVAL_MS = 10000;
const EVENTS_COLLAPSED_COUNT = 5;

function formatSecondsAgo(seconds) {
    if (seconds == null) return "unknown";
    if (seconds < 60) return `${Math.round(seconds)}s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    return `${Math.round(seconds / 3600)}h ago`;
}

function severityBadgeStyle(severity) {
    switch ((severity || "").toUpperCase()) {
        case "CRITICAL": return styles.aiMonitorRcaSeverityCritical;
        case "HIGH":
        case "ERROR": return styles.aiMonitorRcaSeverityError;
        case "WARNING": return styles.aiMonitorRcaSeverityWarning;
        default: return styles.aiMonitorRcaSeverityInfo;
    }
}

function eventSeverityStyle(severity) {
    switch ((severity || "").toUpperCase()) {
        case "CRITICAL": return styles.aiMonitorEventTagCritical;
        case "ERROR": return styles.aiMonitorEventTagError;
        case "WARNING": return styles.aiMonitorEventTagWarning;
        default: return styles.aiMonitorEventTagInfo;
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Summary bar -- replaces the old connectivity banner + the need to read
// both layer cards individually to figure out "is anything wrong."
// ─────────────────────────────────────────────────────────────────────────
function SummaryBar({ connectivity, statusData, hasIncident }) {
    const reachable = connectivity?.reachable;
    const writing = connectivity?.writing;

    const host = statusData?.host_layer;
    const ceph = statusData?.ceph_layer;
    const anyAnomaly = host?.is_anomaly || ceph?.is_anomaly;

    let dotStyle = styles.aiSummaryHealthDotOk;
    let healthText = "All systems normal";

    if (!reachable) {
        dotStyle = styles.aiSummaryHealthDotOffline;
        healthText = "ceph-ai process offline";
    } else if (!writing) {
        dotStyle = styles.aiSummaryHealthDotWarn;
        healthText = "ceph-ai process stalled";
    } else if (hasIncident) {
        dotStyle = styles.aiSummaryHealthDotCritical;
        healthText = "Active incident";
    } else if (anyAnomaly) {
        dotStyle = styles.aiSummaryHealthDotWarn;
        healthText = "Anomaly detected";
    }

    function layerChipStyle(layer) {
        if (!layer?.available) return styles.aiSummaryLayerChipStateUnavailable;
        return layer.is_anomaly ? styles.aiSummaryLayerChipStateAnomaly : styles.aiSummaryLayerChipStateOk;
    }

    function layerChipText(layer) {
        if (!layer?.available) return "unavailable";
        return layer.is_anomaly ? "anomaly" : "ok";
    }

    return (
        <div style={styles.aiSummaryBar}>
            <div style={styles.aiSummaryLeft}>
                <div style={styles.aiSummaryHealth}>
                    <span style={{ ...styles.aiMonitorBannerDot, ...dotStyle }} />
                    <span>{healthText}</span>
                </div>

                {reachable && (
                    <>
                        <div style={styles.aiSummaryDivider} />
                        <div style={styles.aiSummaryLayerChip}>
                            <span style={styles.aiSummaryLayerChipLabel}>Host:</span>
                            <span style={layerChipStyle(host)}>{layerChipText(host)}</span>
                        </div>
                        <div style={styles.aiSummaryLayerChip}>
                            <span style={styles.aiSummaryLayerChipLabel}>Ceph:</span>
                            <span style={layerChipStyle(ceph)}>{layerChipText(ceph)}</span>
                        </div>
                    </>
                )}
            </div>

            <span style={styles.aiSummaryMeta}>
                Last write: {formatSecondsAgo(connectivity?.last_write_seconds_ago)}
            </span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// Incident hero -- the headline of the page when one exists. Collapsed by
// default; "Show details" reveals evidence chain, blast radius, full
// runbook, and the verify command.
// ─────────────────────────────────────────────────────────────────────────
function IncidentHero({ incident }) {
    const [expanded, setExpanded] = useState(false);

    if (!incident) {
        return (
            <div style={styles.aiAllClearRow}>
                <span style={{ ...styles.aiMonitorBannerDot, ...styles.aiSummaryHealthDotOk }} />
                <span>No active incidents -- no RCA diagnosis has been triggered recently.</span>
            </div>
        );
    }

    const firstStep = incident.remediation_steps?.[0];

    return (
        <div style={styles.aiIncidentHero}>
            <div style={styles.aiIncidentHeroTop}>
                <div>
                    <div style={styles.aiIncidentEyebrow}>
                        <span>{incident.incident_id}</span>
                        {incident.source && <span>Diagnosed by {incident.source}</span>}
                    </div>
                    <div style={styles.aiIncidentTitle}>
                        {(incident.fault_category || "").replaceAll("_", " ")}
                    </div>
                </div>
                <span style={{ ...styles.aiMonitorRcaSeverity, ...severityBadgeStyle(incident.severity) }}>
                    {incident.severity}
                </span>
            </div>

            <div style={styles.aiIncidentSummary}>
                {incident.root_cause_summary}
            </div>

            {firstStep && (
                <div style={styles.aiIncidentActionRow}>
                    <span style={styles.aiIncidentActionLabel}>Try this first</span>
                    <span style={styles.aiIncidentActionText}>{firstStep}</span>
                </div>
            )}

            <button
                type="button"
                style={styles.aiIncidentToggle}
                onClick={() => setExpanded(v => !v)}
            >
                <span>{expanded ? "▾" : "▸"}</span>
                <span>{expanded ? "Hide details" : "Show evidence & full runbook"}</span>
            </button>

            {expanded && (
                <div style={styles.aiIncidentDetails}>
                    {incident.detailed_explanation && (
                        <div style={styles.aiMonitorRcaDetail}>
                            {incident.detailed_explanation}
                        </div>
                    )}

                    {incident.evidence_chain && incident.evidence_chain.length > 0 && (
                        <div style={styles.aiMonitorRcaSection}>
                            <span style={styles.aiSectionLabel}>Evidence Chain</span>
                            <div style={styles.aiMonitorRcaEvidence}>
                                {incident.evidence_chain.map((ev, i) => (
                                    <div key={i} style={styles.aiMonitorRcaEvidenceItem}>
                                        <span style={{ color: C.accent }}>•</span>
                                        <span>{ev}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {incident.blast_radius && (
                        <div style={styles.aiMonitorRcaSection}>
                            <span style={styles.aiSectionLabel}>Blast Radius</span>
                            <div style={styles.aiMonitorRcaBlastRadius}>{incident.blast_radius}</div>
                        </div>
                    )}

                    {incident.remediation_steps && incident.remediation_steps.length > 0 && (
                        <div style={styles.aiMonitorRcaSection}>
                            <span style={styles.aiSectionLabel}>Full Remediation Runbook</span>
                            <div style={styles.aiMonitorRcaRemediation}>
                                {incident.remediation_steps.map((step, i) => (
                                    <div key={i} style={styles.aiMonitorRcaRemediationStep}>
                                        <span style={styles.aiMonitorRcaRemediationIndex}>{i + 1}.</span>
                                        <span>{step}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {incident.verification_command && (
                        <div style={styles.aiMonitorRcaSection}>
                            <span style={styles.aiSectionLabel}>Verify</span>
                            <div style={styles.aiMonitorRcaVerification}>
                                {incident.verification_command}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// Layer list -- one collapsed row per layer by default. Model internals
// (decision score, reconstruction error, detection method, deviated
// features) expand on click; they matter for verifying the model, not for
// a first read of "is this layer OK."
// ─────────────────────────────────────────────────────────────────────────
function LayerRow({ title, layer }) {
    const [expanded, setExpanded] = useState(false);
    const available = layer?.available;
    const isAnomaly = layer?.is_anomaly;

    const badgeStyle = !available
        ? styles.aiMonitorLayerBadgeUnavailable
        : isAnomaly
            ? styles.aiMonitorLayerBadgeAnomaly
            : styles.aiMonitorLayerBadgeOk;
    const badgeText = !available ? "UNAVAILABLE" : isAnomaly ? "ANOMALY" : "OK";

    const headline = !available
        ? "Not reporting"
        : isAnomaly
            ? (layer.message || "Anomaly detected")
            : "Operating normally";

    const deviated = layer?.deviated_features || {};
    const deviatedEntries = Object.entries(deviated);

    return (
        <div style={{ ...styles.aiLayerRow, ...(isAnomaly ? styles.aiLayerRowAnomaly : {}) }}>
            <button
                type="button"
                style={styles.aiLayerRowHead}
                onClick={() => setExpanded(v => !v)}
            >
                <div style={styles.aiLayerRowHeadLeft}>
                    <span style={styles.aiLayerRowName}>{title}</span>
                    <span style={{ ...styles.aiMonitorLayerBadge, ...badgeStyle }}>{badgeText}</span>
                    <span style={styles.aiLayerRowMessage}>{headline}</span>
                </div>
                <span style={{ ...styles.aiLayerRowChevron, ...(expanded ? styles.aiLayerRowChevronOpen : {}) }}>
                    ▾
                </span>
            </button>

            {expanded && available && (
                <div style={styles.aiLayerRowBody}>
                    <div>
                        <div style={styles.aiMonitorLayerStatRow}>
                            <span>Status</span>
                            <span style={styles.aiMonitorLayerStatValue}>{layer.status || "—"}</span>
                        </div>
                        <div style={styles.aiMonitorLayerStatRow}>
                            <span>Decision Score</span>
                            <span style={styles.aiMonitorLayerStatValue}>
                                {layer.decision_score != null ? layer.decision_score.toFixed(4) : "—"}
                            </span>
                        </div>
                        <div style={styles.aiMonitorLayerStatRow}>
                            <span>Reconstruction Error</span>
                            <span style={styles.aiMonitorLayerStatValue}>
                                {layer.pca_reconstruction_error != null ? layer.pca_reconstruction_error.toFixed(4) : "—"}
                            </span>
                        </div>
                        <div style={styles.aiMonitorLayerStatRow}>
                            <span>Detection Method</span>
                            <span style={styles.aiMonitorLayerStatValue}>{layer.detection_method || "—"}</span>
                        </div>
                    </div>

                    {deviatedEntries.length > 0 && (
                        <div style={styles.aiMonitorLayerDeviations}>
                            {deviatedEntries.slice(0, 5).map(([key, v]) => (
                                <div key={key} style={styles.aiMonitorLayerDeviationItem}>
                                    <span style={styles.aiMonitorLayerDeviationFeature}>{key}</span>
                                    <span style={styles.aiMonitorLayerDeviationMeta}>
                                        current {typeof v.current === "number" ? v.current.toFixed(2) : v.current},
                                        {" "}baseline {typeof v.baseline_mean === "number" ? v.baseline_mean.toFixed(2) : v.baseline_mean},
                                        {" "}z={v.z_score}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {expanded && !available && (
                <div style={styles.aiLayerRowBody}>
                    <div style={{ color: C.muted, fontSize: ".8rem" }}>
                        This layer has no recent data to report.
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// Events feed -- quieter and capped by default; it's a log to scan, not
// an action item, so it shouldn't compete with the incident hero above it.
// ─────────────────────────────────────────────────────────────────────────
function EventsFeed({ events }) {
    const [showAll, setShowAll] = useState(false);
    const visible = showAll ? events : (events || []).slice(0, EVENTS_COLLAPSED_COUNT);
    const hasMore = (events || []).length > EVENTS_COLLAPSED_COUNT;

    return (
        <div style={styles.aiMonitorEvents}>
            <div style={styles.aiMonitorEventsHeader}>Recent Events</div>

            {(!events || events.length === 0) ? (
                <div style={styles.aiMonitorEventsEmpty}>No recent events.</div>
            ) : (
                <>
                    {visible.map((ev, idx) => (
                        <div
                            key={`${ev.timestamp}-${idx}`}
                            style={{
                                ...styles.aiMonitorEventRow,
                                ...(idx === visible.length - 1 && !hasMore ? styles.aiMonitorEventRowLast : {})
                            }}
                        >
                            <span style={styles.aiMonitorEventTime}>
                                {ev.timestamp ? ev.timestamp.split("T")[1]?.replace("Z", "") : "—"}
                            </span>
                            <span style={{ ...styles.aiMonitorEventTag, ...eventSeverityStyle(ev.severity) }}>
                                {ev.severity || "INFO"}
                            </span>
                            <span style={styles.aiMonitorEventComponent}>{ev.component}</span>
                            <span style={styles.aiMonitorEventMessage}>{ev.message}</span>
                        </div>
                    ))}

                    {hasMore && (
                        <button
                            type="button"
                            style={styles.aiEventsShowMore}
                            onClick={() => setShowAll(v => !v)}
                        >
                            {showAll ? "Show less" : `Show ${events.length - EVENTS_COLLAPSED_COUNT} more`}
                        </button>
                    )}
                </>
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
                    <div style={styles.aiMonitorDisabledIcon}>◈</div>
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

    return (
        <div style={styles.aiMonitorPage}>
            <SummaryBar
                connectivity={connectivity}
                statusData={statusData}
                hasIncident={!!rcaIncident}
            />

            <IncidentHero incident={rcaIncident} />

            <div>
                <div style={{ ...styles.aiSectionLabel, marginBottom: ".6rem" }}>Detection Layers</div>
                <div style={styles.aiLayerList}>
                    <LayerRow title="Host Layer (v7)" layer={statusData?.host_layer} />
                    <LayerRow title="Ceph Semantic Layer (v8)" layer={statusData?.ceph_layer} />
                </div>
            </div>

            <EventsFeed events={events} />
        </div>
    );
}