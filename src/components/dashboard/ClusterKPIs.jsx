import { C } from "../../styles/theme";
import { formatBytes } from "../../utils/formatters";

// Small internal card — distinct from the existing StatCard (which has a
// different visual language: big value + sub text + optional progress bar
// only). This one adds a compact status dot/warning state, which the
// brief's Section 4 examples call for ("● All healthy" / "⚠ 1 down") and
// which StatCard has no prop for. Not replacing StatCard — it's still
// used by the original 4 cards further down the page — this is a second,
// purpose-built card for the new KPI row.
function KpiCard({ label, value, sub, statusColor, statusText }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: ".35rem" }}>
      <div style={{ fontFamily: "'Space Mono',monospace", fontSize: ".68rem", color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "1.3rem", color: C.text, fontWeight: 700 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: ".76rem", color: C.muted }}>{sub}</div>}
      {statusText && (
        <div style={{ display: "flex", alignItems: "center", gap: ".35rem", fontSize: ".74rem", color: statusColor, marginTop: ".1rem" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, display: "inline-block", flexShrink: 0 }} />
          {statusText}
        </div>
      )}
    </div>
  );
}

function fractionStatus(up, total, unitLabel) {
  if (total === 0) return { color: C.muted, text: `No ${unitLabel}` };
  if (up === total) return { color: C.green, text: "All healthy" };
  const down = total - up;
  return { color: C.red, text: `${down} down` };
}

/**
 * ClusterKPIs - Section 4 of the redesign brief.
 *
 * Props:
 *   capacity  - `capacity` block from GET /api/dashboard:
 *               { available, total_bytes, used_bytes, avail_bytes, utilization_pct }
 *   services  - `services` block from GET /api/dashboard:
 *               { available, mon: {up,total}, mgr: {active,standby}, osd: {up,in,total} }
 *   numPools  - pool count (from the `io`/pgmap block in a later phase;
 *               undefined until that's wired, rendered as "—" until then)
 *
 * Kept to 8 cards total per the brief's explicit cap ("Do NOT create
 * 15–20 cards... Keep the primary KPI area around 6–8 cards maximum").
 */
export default function ClusterKPIs({ capacity, services, numPools }) {
  // `capacity`/`services` are undefined before the first successful poll
  // resolves (useDashboardMetrics' initial `data` is null) as well as
  // when the backend genuinely reports available:false — both cases must
  // render the "—" placeholder state, not crash. Checking `?.available`
  // directly (rather than `!== false`) treats "not loaded yet" the same
  // as "backend says unavailable", which is the correct placeholder
  // behavior for both.
  const capOk = capacity?.available === true;
  const svcOk = services?.available === true;

  const osd = services?.osd || {};
  const mon = services?.mon || {};
  const mgr = services?.mgr || {};

  const osdStatus = fractionStatus(osd.up ?? 0, osd.total ?? 0, "OSDs");
  const monStatus = fractionStatus(mon.up ?? 0, mon.total ?? 0, "MONs");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: ".85rem", marginBottom: "1.5rem" }}>
      <KpiCard
        label="Raw Capacity"
        value={capOk ? formatBytes(capacity.total_bytes) : "—"}
        sub="total cluster storage"
      />
      <KpiCard
        label="Used"
        value={capOk ? formatBytes(capacity.used_bytes) : "—"}
        sub={capOk ? `${capacity.utilization_pct}% utilized` : "unavailable"}
        statusColor={capOk && capacity.utilization_pct >= 85 ? C.red : capOk && capacity.utilization_pct >= 70 ? C.yellow : C.green}
        statusText={capOk ? (capacity.utilization_pct >= 85 ? "Near capacity" : capacity.utilization_pct >= 70 ? "Elevated" : "Healthy") : undefined}
      />
      <KpiCard
        label="Available"
        value={capOk ? formatBytes(capacity.avail_bytes) : "—"}
        sub="free space"
      />
      <KpiCard
        label="Pools"
        value={numPools !== undefined ? numPools : "—"}
        sub="active pools"
      />
      <KpiCard
        label="OSDs"
        value={svcOk ? `${osd.up ?? 0} / ${osd.total ?? 0}` : "—"}
        sub={svcOk ? `${osd.in ?? 0} in cluster` : "unavailable"}
        statusColor={svcOk ? osdStatus.color : C.muted}
        statusText={svcOk ? osdStatus.text : undefined}
      />
      <KpiCard
        label="MONs"
        value={svcOk ? `${mon.up ?? 0} / ${mon.total ?? 0}` : "—"}
        sub="in quorum"
        statusColor={svcOk ? monStatus.color : C.muted}
        statusText={svcOk ? monStatus.text : undefined}
      />
      <KpiCard
        label="MGRs"
        value={svcOk ? `${mgr.active ?? 0} active` : "—"}
        sub={svcOk ? `${mgr.standby ?? 0} standby` : "unavailable"}
        statusColor={svcOk ? (mgr.active > 0 ? C.green : C.red) : C.muted}
        statusText={svcOk ? (mgr.active > 0 ? "Active" : "No active mgr") : undefined}
      />
    </div>
  );
}
