import { C } from "../../styles/theme";
import { formatBytes } from "../../utils/formatters";

// Color the bar by utilization band rather than a single flat color, so
// an OSD trending toward full is visually distinct from a lightly-used
// one at a glance (Section 11: "make an unevenly utilized cluster
// immediately visible").
function utilizationColor(pct) {
  if (pct >= 85) return C.red;
  if (pct >= 70) return C.yellow;
  return C.accent;
}

function OSDRow({ osd }) {
  const pct = osd.utilization_pct ?? 0;
  // kb fields are in KB per `ceph osd df`'s own units; convert to bytes
  // for formatBytes() rather than adding a KB-specific formatter.
  const usedBytes = (osd.kb_used ?? 0) * 1024;
  const totalBytes = (osd.kb ?? 0) * 1024;
  const isDown = osd.status !== "up";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".85rem", padding: ".55rem 0" }}>
      <div style={{ width: 64, flexShrink: 0, fontFamily: "'Space Mono',monospace", fontSize: ".82rem", color: isDown ? C.red : C.text, fontWeight: 600 }}>
        {osd.name}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ height: 16, borderRadius: 4, background: C.surface2, border: `1px solid ${C.border}`, overflow: "hidden", position: "relative" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.min(pct, 100)}%`,
              background: isDown ? C.muted : utilizationColor(pct),
              borderRadius: 4,
              transition: "width .4s ease",
            }}
          />
        </div>
      </div>
      <div style={{ width: 52, flexShrink: 0, textAlign: "right", fontFamily: "'Space Mono',monospace", fontSize: ".8rem", color: isDown ? C.red : C.text, fontWeight: 600 }}>
        {isDown ? "DOWN" : `${pct}%`}
      </div>
      <div style={{ width: 90, flexShrink: 0, textAlign: "right", fontSize: ".72rem", color: C.muted }}>
        {formatBytes(usedBytes)} / {formatBytes(totalBytes)}
      </div>
      <div style={{ width: 44, flexShrink: 0, textAlign: "right", fontSize: ".72rem", color: C.muted }}>
        {osd.pgs} PGs
      </div>
    </div>
  );
}

/**
 * OSDUtilization - Section 11 of the redesign brief.
 *
 * Props:
 *   osds - `osds` block from GET /api/dashboard:
 *          { available, osds: [{id, name, device_class, status,
 *                                utilization_pct, kb, kb_used, kb_avail, pgs}],
 *            average_utilization_pct }
 *
 * Sorted by utilization descending so the most-utilized (and therefore
 * most attention-worthy) OSDs appear first — matches the brief's intent
 * of making uneven distribution "immediately visible" without requiring
 * the reader to scan the whole list.
 *
 * Section 11 also calls for a compact/scrollable layout "if there are
 * many OSDs" rather than a huge card grid — this list-row approach
 * already satisfies that for any OSD count without needing a separate
 * "large cluster" variant.
 */
export default function OSDUtilization({ osds }) {
  const ok = osds?.available === true;
  const list = ok ? [...(osds.osds || [])].sort((a, b) => (b.utilization_pct ?? 0) - (a.utilization_pct ?? 0)) : [];

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".75rem" }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: ".8rem", fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: ".03em" }}>
          OSD Utilization
        </div>
        {ok && (
          <div style={{ fontSize: ".76rem", color: C.muted }}>
            avg {osds.average_utilization_pct}%
          </div>
        )}
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1rem 1.25rem", overflowX: "auto" }}>
        {!ok && (
          <div style={{ color: C.muted, fontSize: ".85rem", fontStyle: "italic", textAlign: "center", padding: "1.5rem 0" }}>
            {osds?.error ? `OSD data unavailable: ${osds.error}` : "OSD data unavailable"}
          </div>
        )}
        {ok && list.length === 0 && (
          <div style={{ color: C.muted, fontSize: ".85rem", fontStyle: "italic", textAlign: "center", padding: "1.5rem 0" }}>
            No OSDs reported
          </div>
        )}
        {ok && list.length > 0 && (
          <div style={{ minWidth: 480 }}>
            {list.map(osd => <OSDRow key={osd.id} osd={osd} />)}
          </div>
        )}
      </div>
    </div>
  );
}
