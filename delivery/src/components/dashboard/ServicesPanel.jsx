import { C } from "../../styles/theme";
import { Th, TableWrap } from "../common/Table";
import StatusBadge from "../common/StatusBadge";

// One row of the services table. `ok` drives the badge color/label;
// `detail` is the right-aligned count column (e.g. "3/3", "4 active").
function ServiceRow({ name, ok, unknown, label, detail }) {
  const badgeColor = unknown ? "blue" : ok ? "green" : "red";
  const badgeText = unknown ? "UNKNOWN" : ok ? "HEALTHY" : "DEGRADED";
  return (
    <tr>
      <td style={{ padding: ".75rem 1rem", fontFamily: "'Space Mono',monospace", fontSize: ".85rem", borderBottom: `1px solid ${C.border}`, color: C.text }}>{name}</td>
      <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}>
        <StatusBadge color={badgeColor}>{badgeText}</StatusBadge>
      </td>
      <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: ".8rem" }}>{label}</td>
      <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: ".85rem", textAlign: "right", fontFamily: "'Space Mono',monospace" }}>{detail}</td>
    </tr>
  );
}

/**
 * ServicesPanel - Section 10 of the redesign brief ("Cluster Services").
 *
 * Props:
 *   services  - `services` block from GET /api/dashboard:
 *               { available, mon:{up,total}, mgr:{active,standby},
 *                 osd:{up,in,total}, rgw:{count,daemons} }
 *   mds       - `mds` block from GET /api/dashboard:
 *               { available, filesystem_count, active_count, standby_count }
 *
 * Real values only — no row is rendered with a hardcoded/fabricated
 * count. Any block reporting available:false (or not yet loaded) renders
 * its rows in the "UNKNOWN" state rather than guessing.
 */
export default function ServicesPanel({ services, mds }) {
  const svcOk = services?.available === true;
  const mdsOk = mds?.available === true;

  const mon = services?.mon || {};
  const mgr = services?.mgr || {};
  const osd = services?.osd || {};
  const rgw = services?.rgw || {};

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ fontFamily: "'Space Mono',monospace", fontSize: ".8rem", fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: ".75rem" }}>
        Cluster Services
      </div>
      <TableWrap>
        <thead>
          <tr style={{ background: C.surface2 }}>
            {["Service", "Status", "Detail", "Count"].map(h => <Th key={h}>{h}</Th>)}
          </tr>
        </thead>
        <tbody>
          <ServiceRow
            name="MON"
            unknown={!svcOk}
            ok={svcOk && mon.up === mon.total && mon.total > 0}
            label={svcOk ? "in quorum" : "unavailable"}
            detail={svcOk ? `${mon.up ?? 0}/${mon.total ?? 0}` : "—"}
          />
          <ServiceRow
            name="MGR"
            unknown={!svcOk}
            ok={svcOk && mgr.active > 0}
            label={svcOk ? `${mgr.standby ?? 0} standby` : "unavailable"}
            detail={svcOk ? `${mgr.active ?? 0} active` : "—"}
          />
          <ServiceRow
            name="OSD"
            unknown={!svcOk}
            ok={svcOk && osd.up === osd.total && osd.total > 0}
            label={svcOk ? `${osd.in ?? 0} in cluster` : "unavailable"}
            detail={svcOk ? `${osd.up ?? 0}/${osd.total ?? 0}` : "—"}
          />
          <ServiceRow
            name="MDS"
            unknown={!mdsOk}
            ok={mdsOk && mds.active_count > 0 && mds.active_count === mds.filesystem_count}
            label={mdsOk ? `${mds.filesystem_count ?? 0} filesystems, ${mds.standby_count ?? 0} standby` : "unavailable"}
            detail={mdsOk ? `${mds.active_count ?? 0} active` : "—"}
          />
          <ServiceRow
            name="RGW"
            unknown={!svcOk}
            ok={svcOk && rgw.count > 0}
            label={svcOk && rgw.daemons?.[0] ? `zone ${rgw.daemons[0].zone_name}` : svcOk ? "no daemons visible" : "unavailable"}
            detail={svcOk ? `${rgw.count ?? 0}` : "—"}
          />
        </tbody>
      </TableWrap>
    </div>
  );
}
