import { useState } from "react";
import { C } from "../../styles/theme";
import { Th, TableWrap } from "../common/Table";
import StatusBadge from "../common/StatusBadge";
import { formatBytes } from "../../utils/formatters";

// Pools with no replicas are the headline risk here (matches this
// cluster's real POOL_NO_REDUNDANCY health check — 26 of 27 pools have
// size=1 as of Phase 5 verification). Sorting them first surfaces that
// risk immediately, the same "make an unevenly/riskily configured
// cluster immediately visible" principle Section 11 used for OSDs.
function redundancyBadge(pool) {
  if (pool.redundant === null || pool.redundant === undefined) {
    return <StatusBadge color="blue">UNKNOWN</StatusBadge>;
  }
  if (pool.redundant) {
    return <StatusBadge color="green">{`${pool.size}x REPLICA`}</StatusBadge>;
  }
  return <StatusBadge color="red">NO REDUNDANCY</StatusBadge>;
}

function PoolRow({ pool }) {
  return (
    <tr>
      <td style={{ padding: ".75rem 1rem", fontFamily: "'Space Mono',monospace", fontSize: ".85rem", borderBottom: `1px solid ${C.border}`, color: C.text }}>
        {pool.name}
      </td>
      <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: ".8rem", textTransform: "uppercase" }}>
        {pool.application || "—"}
      </td>
      <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}>
        {redundancyBadge(pool)}
      </td>
      <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: ".85rem", textAlign: "right", fontFamily: "'Space Mono',monospace" }}>
        {formatBytes(pool.stored_bytes)}
      </td>
      <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: ".8rem", textAlign: "right" }}>
        {pool.objects.toLocaleString()}
      </td>
      <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: ".8rem", textAlign: "right" }}>
        {pool.pg_num ?? "—"}
      </td>
      <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: ".85rem", textAlign: "right", fontFamily: "'Space Mono',monospace" }}>
        {pool.percent_used}%
      </td>
    </tr>
  );
}

/**
 * PoolOverview - Section 12 of the redesign brief ("Pool Overview").
 *
 * Props:
 *   pools - `pools` block from GET /api/dashboard:
 *           { available, pools: [{name, id, stored_bytes, bytes_used,
 *                                  objects, percent_used, max_avail,
 *                                  size, min_size, pg_num, application,
 *                                  redundant}],
 *             redundancy_available }
 *
 * `redundant` is real data from `ceph osd pool ls detail` (size > 1),
 * merged server-side with `ceph df detail`'s usage stats — NOT a guess
 * or a placeholder. `redundancy_available` distinguishes "the
 * replication-data call failed, so redundancy is unknown for every
 * pool" from "replication data loaded and this pool genuinely has one
 * copy" — the former renders every badge as UNKNOWN rather than
 * silently claiming NO REDUNDANCY across the board.
 *
 * Sorted no-redundancy-first (then by stored bytes descending) so the
 * pools most at risk of data loss surface at the top, without requiring
 * the reader to scan the whole list — same rationale Section 11 used
 * for OSD utilization ordering.
 *
 * A collapsed default (first 8 rows) + "Show all" toggle keeps this from
 * dominating the page on a cluster with many pools (27 here), matching
 * the brief's general anti-dump instinct (Section 3/11) rather than
 * rendering an unbounded table by default.
 */
export default function PoolOverview({ pools }) {
  const [expanded, setExpanded] = useState(false);

  const ok = pools?.available === true;
  const redundancyOk = pools?.redundancy_available === true;
  const list = ok ? [...(pools.pools || [])] : [];

  list.sort((a, b) => {
    const aRisk = a.redundant === false ? 0 : a.redundant === null || a.redundant === undefined ? 1 : 2;
    const bRisk = b.redundant === false ? 0 : b.redundant === null || b.redundant === undefined ? 1 : 2;
    if (aRisk !== bRisk) return aRisk - bRisk;
    return (b.stored_bytes ?? 0) - (a.stored_bytes ?? 0);
  });

  const noRedundancyCount = list.filter(p => p.redundant === false).length;
  const visible = expanded ? list : list.slice(0, 8);

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".75rem" }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: ".8rem", fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: ".03em" }}>
          Pool Overview
        </div>
        {ok && (
          <div style={{ fontSize: ".76rem", color: C.muted }}>
            {list.length} pools
            {redundancyOk && noRedundancyCount > 0 && (
              <span style={{ color: C.red }}> · {noRedundancyCount} with no redundancy</span>
            )}
          </div>
        )}
      </div>

      {!ok && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1.5rem", color: C.muted, fontSize: ".85rem", fontStyle: "italic", textAlign: "center" }}>
          {pools?.error ? `Pool data unavailable: ${pools.error}` : "Pool data unavailable"}
        </div>
      )}

      {ok && !redundancyOk && (
        <div style={{ fontSize: ".8rem", color: C.yellow, marginBottom: ".5rem" }}>
          ⚠ Replication data unavailable — redundancy status shown as unknown until the next successful poll.
        </div>
      )}

      {ok && list.length === 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1.5rem", color: C.muted, fontSize: ".85rem", fontStyle: "italic", textAlign: "center" }}>
          No pools reported
        </div>
      )}

      {ok && list.length > 0 && (
        <>
          <TableWrap>
            <thead>
              <tr style={{ background: C.surface2 }}>
                {["Pool", "Type", "Redundancy", "Stored", "Objects", "PGs", "Used"].map(h => <Th key={h}>{h}</Th>)}
              </tr>
            </thead>
            <tbody>
              {visible.map(pool => <PoolRow key={pool.id ?? pool.name} pool={pool} />)}
            </tbody>
          </TableWrap>

          {list.length > 8 && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{ marginTop: ".5rem", background: "none", border: "none", color: C.blue, cursor: "pointer", fontFamily: "inherit", fontSize: ".8rem", padding: 0 }}
            >
              {expanded ? "Show fewer ▲" : `Show all ${list.length} pools ▾`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
