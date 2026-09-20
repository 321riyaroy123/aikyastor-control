import { C } from "../../styles/theme";
import { formatBytes } from "../../utils/formatters";
import Sparkline from "./Sparkline";

// Small stat readout next to each chart — current instantaneous value
// from the "io" block (not derived from the chart itself), matching the
// KPI-card convention already used elsewhere on this page (big number +
// small label).
function IoStat({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ".2rem" }}>
      <div style={{ fontSize: ".68rem", color: C.muted, textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</div>
      <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "1.1rem", fontWeight: 700, color: color || C.text }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, current, children }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: ".75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: ".75rem" }}>
        <div style={{ fontSize: ".78rem", color: C.muted, textTransform: "uppercase", letterSpacing: ".03em" }}>{title}</div>
        {current}
      </div>
      {children}
    </div>
  );
}

/**
 * PerformanceCharts - Sections 6-9 of the redesign brief ("Performance").
 *
 * Props:
 *   io         - `io` block from GET /api/dashboard: instantaneous
 *                { available, read_bytes_sec, write_bytes_sec,
 *                  read_op_per_sec, write_op_per_sec, num_pgs, num_pools,
 *                  num_objects }
 *   ioHistory  - `io_history` block from GET /api/dashboard:
 *                { available, interval_seconds, max_points,
 *                  points: [{timestamp, available, read_bytes_sec?,
 *                            write_bytes_sec?, read_op_per_sec?,
 *                            write_op_per_sec?}] }
 *
 * No chart library — package.json confirmed to have only
 * lucide-react/react/react-dom/vite, so this uses the hand-rolled
 * Sparkline component (plain inline SVG) rather than adding a new
 * dependency.
 *
 * `ioHistory.points` is backed by a server-side ring buffer sampled
 * independently every `interval_seconds` (10s) by a background thread —
 * NOT accumulated client-side from repeated /api/dashboard polls. This
 * means the chart shows real history immediately on page load (up to
 * however long the backend process has been running, capped at
 * max_points ≈ 1 hour), rather than starting empty and filling in only
 * while this specific browser tab stays open. See metrics_service.py's
 * get_cluster_io_history() docstring for the full rationale.
 *
 * Points where a sample failed carry `available: false` and no metric
 * fields — plotted as a gap in the line (Sparkline treats non-numeric
 * values as a break), never a fabricated zero.
 *
 * Renders nothing (not even a placeholder card) when both `io` and
 * `ioHistory` are unavailable, matching the empty-state convention other
 * Phase components use for "nothing meaningful to show."
 */
export default function PerformanceCharts({ io, ioHistory }) {
  const ioOk = io?.available === true;
  const historyOk = ioHistory?.available === true;
  const points = historyOk ? (ioHistory.points || []) : [];

  if (!ioOk && !historyOk) {
    return null;
  }

  const throughputSeries = [
    { name: "read", color: C.accent, points: points.map(p => (p.available ? p.read_bytes_sec : null)) },
    { name: "write", color: C.yellow, points: points.map(p => (p.available ? p.write_bytes_sec : null)) },
  ];

  const opsSeries = [
    { name: "read ops", color: C.accent, points: points.map(p => (p.available ? p.read_op_per_sec : null)) },
    { name: "write ops", color: C.yellow, points: points.map(p => (p.available ? p.write_op_per_sec : null)) },
  ];

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".75rem" }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: ".8rem", fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: ".03em" }}>
          Performance
        </div>
        {historyOk && points.length > 0 && (
          <div style={{ fontSize: ".76rem", color: C.muted }}>
            last {Math.round((points.length * ioHistory.interval_seconds) / 60)} min
          </div>
        )}
      </div>

      {!historyOk && (
        <div style={{ fontSize: ".78rem", color: C.yellow, marginBottom: ".5rem" }}>
          ⚠ History unavailable — showing current values only.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "1rem" }}>
        <ChartCard
          title="Throughput"
          current={ioOk && (
            <div style={{ display: "flex", gap: "1.25rem" }}>
              <IoStat label="Read" value={`${formatBytes(io.read_bytes_sec)}/s`} color={C.accent} />
              <IoStat label="Write" value={`${formatBytes(io.write_bytes_sec)}/s`} color={C.yellow} />
            </div>
          )}
        >
          <Sparkline series={throughputSeries} height={100} />
        </ChartCard>

        <ChartCard
          title="Operations"
          current={ioOk && (
            <div style={{ display: "flex", gap: "1.25rem" }}>
              <IoStat label="Read ops" value={`${io.read_op_per_sec}/s`} color={C.accent} />
              <IoStat label="Write ops" value={`${io.write_op_per_sec}/s`} color={C.yellow} />
            </div>
          )}
        >
          <Sparkline series={opsSeries} height={100} />
        </ChartCard>
      </div>
    </div>
  );
}
