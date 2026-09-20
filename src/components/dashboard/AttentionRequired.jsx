import { C } from "../../styles/theme";
import Card from "../common/Card";
import StatusBadge from "../common/StatusBadge";

// Short, honest "what this usually means / what to check" guidance for
// well-known, stable Ceph health check codes (documented Ceph terminology,
// not cluster-specific data — distinct from anything that needed real
// command output to verify). Confirmed present on this real cluster:
// POOL_NO_REDUNDANCY, BLUESTORE_SLOW_OP_ALERT, MON_DISK_LOW. The rest are
// included because they're common enough to plausibly show up later and
// the guidance is standard/stable, not guessed. Any code NOT in this map
// falls back to just the raw ceph message — never a fabricated
// explanation for a check we don't actually recognize.
const CHECK_GUIDANCE = {
  POOL_NO_REDUNDANCY: "One or more pools have size=1 (no replica copies). A single OSD failure or disk error means permanent data loss for objects in that pool. See the Pool Overview panel below for exactly which pools.",
  BLUESTORE_SLOW_OP_ALERT: "One or more OSDs are reporting slow BlueStore operations, often a sign of a failing disk, overloaded controller, or network issue on that OSD's host. Check `ceph osd perf` and per-OSD latency, and consider whether the affected OSD needs replacing.",
  MON_DISK_LOW: "A monitor's local disk (where it stores its store.db) is running low on space. If a MON fills up its disk it can crash and take the cluster out of quorum. Free space on that host or move the mon store to a larger volume.",
  OSD_DOWN: "One or more OSDs are marked down. Data on those OSDs is unavailable until they're restarted or their PGs recover elsewhere.",
  OSD_NEARFULL: "One or more OSDs are approaching their full-ratio threshold. Writes may be throttled or blocked if this isn't addressed — consider rebalancing or adding capacity.",
  OSD_FULL: "One or more OSDs have hit their full-ratio threshold. The cluster will refuse writes until this is resolved.",
  PG_DEGRADED: "Some placement groups have fewer copies than configured (size), usually because an OSD is down or recovering. Data is still available but at reduced redundancy.",
  PG_AVAILABILITY: "Some placement groups are inactive and their data may be temporarily unavailable for reads/writes.",
  MON_CLOCK_SKEW: "Monitor clocks have drifted apart. Ceph requires closely synchronized clocks across mons — check NTP/chrony on each mon host.",
  SLOW_OPS: "Some OSD or MON operations are taking longer than expected to complete, which can be an early sign of disk, network, or overload issues.",
};

const SEVERITY_META = {
  HEALTH_ERR: { label: "Critical", color: "red" },
  HEALTH_WARN: { label: "Warning", color: "orange" },
};

function IssueCard({ issue }) {
  const meta = SEVERITY_META[issue.severity] || { label: issue.severity, color: "blue" };
  const guidance = CHECK_GUIDANCE[issue.code];

  return (
    <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: ".9rem 1rem", display: "flex", flexDirection: "column", gap: ".5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap" }}>
        <StatusBadge color={meta.color}>{meta.label}</StatusBadge>
        <span style={{ fontFamily: "'Space Mono',monospace", fontSize: ".76rem", color: C.muted }}>{issue.code}</span>
        {issue.count > 1 && (
          <span style={{ fontSize: ".72rem", color: C.muted }}>× {issue.count}</span>
        )}
        {issue.muted && (
          <span style={{ fontSize: ".68rem", color: C.muted, fontStyle: "italic" }}>muted</span>
        )}
      </div>
      <div style={{ fontSize: ".85rem", color: C.text }}>{issue.message}</div>
      {guidance && (
        <div style={{ fontSize: ".78rem", color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: ".5rem" }}>
          {guidance}
        </div>
      )}
    </div>
  );
}

/**
 * AttentionRequired - Section 13 of the redesign brief ("Attention
 * Required" panel).
 *
 * Props:
 *   health - `health` block from GET /api/dashboard (same block
 *            ClusterHealthBanner uses):
 *            { available, status, issue_count, top_issue, issues }
 *
 * Deliberately NOT a duplicate of ClusterHealthBanner's expandable "View
 * all issues" list, which already shows the same badge+code+message+count
 * in a flat, severest-first list. This panel adds what the banner has no
 * room for:
 *   - grouped by severity (Critical / Warning sections) rather than one
 *     flat list, so the reader can immediately see "how many CRITICAL
 *     things need attention" vs skimming past warnings to find them
 *   - short, standard guidance text per check code (see CHECK_GUIDANCE
 *     above) — "what this usually means" / "what to check next" — which
 *     is genuinely new information, not a re-presentation of what the
 *     banner already shows
 *
 * Reuses get_health_summary()'s issues list as-is — no new backend
 * parsing needed for this phase (confirmed: `code`, `severity`,
 * `message`, `count`, `muted` are already exactly what this panel needs,
 * already sorted severest-first by metrics_service.py).
 *
 * Renders nothing (not even an empty card) when there are zero issues —
 * an "Attention Required" panel with nothing to show is noise, and
 * ClusterHealthBanner already communicates "All systems normal" for the
 * healthy case.
 */
export default function AttentionRequired({ health }) {
  const ok = health?.available === true;
  const issues = ok ? (health.issues || []) : [];

  if (!ok || issues.length === 0) {
    return null;
  }

  const critical = issues.filter(i => i.severity === "HEALTH_ERR");
  const warnings = issues.filter(i => i.severity !== "HEALTH_ERR");

  return (
    <Card style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: ".8rem", fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: ".03em" }}>
          Attention Required
        </div>
        <div style={{ fontSize: ".76rem", color: C.muted }}>
          {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </div>
      </div>

      {critical.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: C.red, textTransform: "uppercase", letterSpacing: ".03em" }}>
            Critical ({critical.length})
          </div>
          {critical.map(issue => <IssueCard key={issue.code} issue={issue} />)}
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: C.yellow, textTransform: "uppercase", letterSpacing: ".03em" }}>
            Warning ({warnings.length})
          </div>
          {warnings.map(issue => <IssueCard key={issue.code} issue={issue} />)}
        </div>
      )}
    </Card>
  );
}
