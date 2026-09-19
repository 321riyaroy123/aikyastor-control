import { useState } from "react";
import { C } from "../../styles/theme";
import Card from "../common/Card";
import StatusBadge from "../common/StatusBadge";

// Relative "Updated Ns ago" formatting. Small and local rather than pulled
// into formatters.js since it needs live re-render-driven recency (the
// existing formatDateTime() in formatters.js formats a fixed timestamp,
// not "seconds since"), and no other page needs this yet.
function timeAgo(ts) {
  if (!ts) return null;
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr}h ago`;
}

const STATUS_META = {
  HEALTH_OK: { color: C.green, badge: "green", label: "HEALTH_OK" },
  HEALTH_WARN: { color: C.yellow, badge: "orange", label: "HEALTH_WARN" },
  HEALTH_ERR: { color: C.red, badge: "red", label: "HEALTH_ERR" },
  UNKNOWN: { color: C.muted, badge: "blue", label: "UNKNOWN" },
};

/**
 * ClusterHealthBanner - Level 1 of the redesigned Dashboard's information
 * hierarchy (Section 3 of the brief).
 *
 * Props:
 *   health        - the `health` block from GET /api/dashboard:
 *                    { available, status, issue_count, top_issue, issues }
 *   version       - Ceph version string (from ClusterAPI.info()/version()),
 *                    optional — renders "—" if not yet loaded
 *   lastUpdated   - epoch ms from useDashboardMetrics, or null
 *   stale         - bool, true if the most recent poll failed
 *   onRefresh     - manual refresh handler
 *
 * Deliberately does NOT dump every health check into the primary view
 * (Section 3: "Do NOT dump every health check into the main dashboard").
 * Primary view = status + issue count + single top issue. Full list is
 * behind "View all issues".
 */
export default function ClusterHealthBanner({ health, version, lastUpdated, stale, onRefresh }) {
  const [expanded, setExpanded] = useState(false);

  const status = health?.status || "UNKNOWN";
  const meta = STATUS_META[status] || STATUS_META.UNKNOWN;
  const issueCount = health?.issue_count ?? 0;
  const topIssue = health?.top_issue;
  const issues = health?.issues || [];
  const dataUnavailable = health && health.available === false;

  return (
    <Card style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: ".85rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: meta.color, boxShadow: `0 0 8px ${meta.color}`, display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: "1.05rem", fontWeight: 700, color: C.text }}>
            {meta.label}
          </span>
          {issueCount > 0 && (
            <span style={{ color: C.muted, fontSize: ".85rem" }}>
              {issueCount} {issueCount === 1 ? "issue" : "issues"} require attention
            </span>
          )}
          {status === "HEALTH_OK" && (
            <span style={{ color: C.muted, fontSize: ".85rem" }}>All systems normal</span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem", fontFamily: "'Space Mono',monospace", fontSize: ".72rem", color: C.muted }}>
          <span>Ceph {version || "—"}</span>
          <span style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
            {stale ? (
              <span style={{ color: C.yellow }}>⚠ Data may be stale</span>
            ) : (
              <span style={{ color: C.green }}>● LIVE</span>
            )}
            <span>{lastUpdated ? `Updated ${timeAgo(lastUpdated)}` : "Updating…"}</span>
          </span>
          <button
            onClick={onRefresh}
            style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, cursor: "pointer", padding: ".25rem .6rem", fontFamily: "inherit", fontSize: ".72rem" }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {dataUnavailable && (
        <div style={{ fontSize: ".8rem", color: C.red }}>
          Unable to reach the cluster for health data{health?.error ? `: ${health.error}` : "."}
        </div>
      )}

      {topIssue && !expanded && (
        <div style={{ display: "flex", alignItems: "center", gap: ".6rem", fontSize: ".85rem", color: C.text, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: ".65rem .9rem" }}>
          <StatusBadge color={topIssue.severity === "HEALTH_ERR" ? "red" : "orange"}>{topIssue.code}</StatusBadge>
          <span style={{ flex: 1 }}>{topIssue.message}</span>
        </div>
      )}

      {issues.length > 0 && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ alignSelf: "flex-start", background: "none", border: "none", color: C.blue, cursor: "pointer", fontFamily: "inherit", fontSize: ".8rem", padding: 0 }}
        >
          {expanded ? "Hide issues ▲" : `View all issues (${issues.length}) ▾`}
        </button>
      )}

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem", paddingTop: ".25rem", borderTop: `1px solid ${C.border}` }}>
          {issues.map(issue => (
            <div key={issue.code} style={{ display: "flex", alignItems: "center", gap: ".6rem", fontSize: ".82rem", padding: ".55rem .75rem", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6 }}>
              <StatusBadge color={issue.severity === "HEALTH_ERR" ? "red" : "orange"}>{issue.severity}</StatusBadge>
              <span style={{ color: C.muted, fontFamily: "'Space Mono',monospace", fontSize: ".72rem", minWidth: 170 }}>{issue.code}</span>
              <span style={{ color: C.text, flex: 1 }}>{issue.message}</span>
              {issue.count > 1 && <span style={{ color: C.muted, fontSize: ".72rem" }}>×{issue.count}</span>}
              {issue.muted && <span style={{ color: C.muted, fontSize: ".68rem", fontStyle: "italic" }}>muted</span>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
