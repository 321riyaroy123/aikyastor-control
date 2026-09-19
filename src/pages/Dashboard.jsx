import StatCard from "../components/common/StatCard";
import ActivityPanel from "../components/activity/ActivityPanel";
import ClusterHealthBanner from "../components/dashboard/ClusterHealthBanner";
import ClusterKPIs from "../components/dashboard/ClusterKPIs";
import ServicesPanel from "../components/dashboard/ServicesPanel";
import OSDUtilization from "../components/dashboard/OSDUtilization";
import PoolOverview from "../components/dashboard/PoolOverview";
import AttentionRequired from "../components/dashboard/AttentionRequired";
import PerformanceCharts from "../components/dashboard/PerformanceCharts";
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import { formatBytes, calculatePercentage } from "../utils/formatters";

// Extracted from the Dashboard component in AiKyaStorCONTROL.jsx.
//
// DASHBOARD REDESIGN — PHASE 1 (Cluster Health Banner) + PHASE 2 (KPI cards)
// + PHASE 3 (Cluster Services panel) + PHASE 4 (OSD Utilization) + PHASE 5
// (Pool Overview) + PHASE 6 (Attention Required panel) + PHASE 7
// (Performance charts):
// Added ClusterHealthBanner, ClusterKPIs, ServicesPanel, OSDUtilization,
// PoolOverview, AttentionRequired, and PerformanceCharts, all sourced
// from the new useDashboardMetrics() hook (GET /api/dashboard). Purely
// additive above the existing content below
// — the 4 original StatCards, the hardcoded component status table, and
// ActivityPanel are all untouched. The `stats`/`health`/`vault`/`activity`
// props still come from App.jsx exactly as before; the new sections use
// their own independently-polled data (the richer, parsed version from
// metrics_service) rather than the plain `stats`/`health` props, so this
// is intentionally a second, separate source of data until a later phase
// consolidates them (see the continuation prompt for the plan on that).
//
// numPools: was left undefined for ClusterKPIs pending get_cluster_io()
// being wired into /api/dashboard. Phase 7 wires it, so ClusterKPIs now
// gets a real value (io.num_pools) instead of the "—" placeholder — this
// is the one place Phase 7 reaches back into a prior phase's component,
// flagged explicitly per the continuation prompt's plan for this, not
// done silently. ClusterKPIs.jsx itself is unchanged — it already had
// the numPools prop ready to receive a value, just never got one before.
//
// ServicesPanel (Phase 3) is a richer superset of the existing hardcoded
// table below it: that table's "CephFS: Mounted" row is a static string,
// never actually checked against the cluster, whereas ServicesPanel's
// MDS row reports real active/standby counts per filesystem. Both are
// left in place for now rather than removing the old table — see the
// continuation prompt for the plan to consolidate/retire the hardcoded
// table once RGW/RBD/CephFS have real backing data across the board
// (RBD in particular still has nothing real behind it anywhere).
//
// AttentionRequired (Phase 6) reuses the SAME `health` data
// ClusterHealthBanner already consumes (get_health_summary()'s `issues`
// list) — no new backend call. It's deliberately not a duplicate of the
// banner's own expandable "View all issues" list: this panel groups by
// severity and adds short per-check guidance text, which is new
// information the compact banner has no room for. It renders nothing at
// all when there are zero issues, so a healthy cluster shows no empty
// card here.
//
// PerformanceCharts (Phase 7) uses `io` (instantaneous pgmap read/write
// counters) and `io_history` (a server-side ring buffer, sampled
// independently every 10s by a background thread — NOT accumulated from
// this component's own polling, so history survives page reloads and
// isn't duplicated per browser tab; see metrics_service.py's
// start_io_history_sampler()/get_cluster_io_history()). Charts are
// hand-rolled inline SVG (Sparkline.jsx) rather than a charting library
// — package.json confirmed to have no chart dependency, and the
// project's stated principle is no unnecessary dependencies.
//
// NOTE on ordering: Performance corresponds to the brief's Sections 6-9,
// which precede Services (10) and OSD Utilization (11) in the brief's
// own numbering — but PerformanceCharts is appended at the END of the
// existing chain here (after AttentionRequired/Phase 6) rather than
// reordering the page to match spec section order. This follows every
// prior phase's own precedent (each was appended where implemented, not
// reshuffled into spec order) — flagged explicitly here since this is
// the first phase where implementation order and spec order genuinely
// diverge. Reordering to strict spec order is a one-line JSX move
// whenever it's wanted; not done silently as part of this phase.
export default function Dashboard({ stats, health, vault, activity, onRefreshActivity }) {
  const used = stats ? calculatePercentage(stats.total_used_raw, stats.total_bytes) : 0;
  const dashboardMetrics = useDashboardMetrics(8000);

  return (
    <div>
      <ClusterHealthBanner
        health={dashboardMetrics.data?.health}
        lastUpdated={dashboardMetrics.lastUpdated}
        stale={dashboardMetrics.stale}
        onRefresh={dashboardMetrics.refresh}
      />

      <ClusterKPIs
        capacity={dashboardMetrics.data?.capacity}
        services={dashboardMetrics.data?.services}
        numPools={dashboardMetrics.data?.io?.num_pools}
      />

      <ServicesPanel
        services={dashboardMetrics.data?.services}
        mds={dashboardMetrics.data?.mds}
        components={dashboardMetrics.data?.components}
      />

      <OSDUtilization
        osds={dashboardMetrics.data?.osds}
      />

      <PoolOverview
        pools={dashboardMetrics.data?.pools}
      />

      <AttentionRequired
        health={dashboardMetrics.data?.health}
      />

      <PerformanceCharts
        io={dashboardMetrics.data?.io}
        ioHistory={dashboardMetrics.data?.io_history}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Total Capacity" value={stats ? formatBytes(stats.total_bytes) : "—"} sub="raw cluster storage" />
        <StatCard label="Used" value={stats ? formatBytes(stats.total_used_raw) : "—"} sub={stats ? `${used}% of total` : "—"} pctVal={used} />
        <StatCard label="Available" value={stats ? formatBytes(stats.total_avail) : "—"} sub="free space" />
        <StatCard label="Vault Free" value={vault ? formatBytes(vault.free) : "—"} sub={vault?.path || "/vault"} vault />
      </div>

      <ActivityPanel activity={activity} onRefresh={onRefreshActivity} />
    </div>
  );
}
