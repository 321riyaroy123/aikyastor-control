import StatCard from "../components/common/StatCard";
import StatusBadge from "../components/common/StatusBadge";
import ActivityPanel from "../components/activity/ActivityPanel";
import { Th, TableWrap } from "../components/common/Table";
import { C } from "../styles/theme";
import { formatBytes, calculatePercentage } from "../utils/formatters";

// Extracted from the Dashboard component in AiKyaStorCONTROL.jsx.
export default function Dashboard({ stats, health, vault, activity, onRefreshActivity }) {
  const used = stats ? calculatePercentage(stats.total_used_raw, stats.total_bytes) : 0;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Total Capacity" value={stats ? formatBytes(stats.total_bytes) : "—"} sub="raw cluster storage" />
        <StatCard label="Used" value={stats ? formatBytes(stats.total_used_raw) : "—"} sub={stats ? `${used}% of total` : "—"} pctVal={used} />
        <StatCard label="Available" value={stats ? formatBytes(stats.total_avail) : "—"} sub="free space" />
        <StatCard label="Vault Free" value={vault ? formatBytes(vault.free) : "—"} sub={vault?.path || "/vault"} vault />
      </div>

      <TableWrap>
        <thead>
          <tr style={{ background: C.surface2 }}>
            {["Component", "Type", "Status", "Details"].map(h => <Th key={h}>{h}</Th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: ".75rem 1rem", fontFamily: "'Space Mono',monospace", fontSize: ".85rem", borderBottom: `1px solid ${C.border}` }}>RGW / S3</td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}><StatusBadge color="blue">Object</StatusBadge></td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}><StatusBadge color="green">Active</StatusBadge></td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: ".8rem" }}>192.168.29.252:80</td>
          </tr>
          <tr>
            <td style={{ padding: ".75rem 1rem", fontFamily: "'Space Mono',monospace", fontSize: ".85rem", borderBottom: `1px solid ${C.border}` }}>RBD Pool</td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}><StatusBadge color="orange">Block</StatusBadge></td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}><StatusBadge color="green">Active</StatusBadge></td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: ".8rem" }}>pool: rbd</td>
          </tr>
          <tr>
            <td style={{ padding: ".75rem 1rem", fontFamily: "'Space Mono',monospace", fontSize: ".85rem", borderBottom: `1px solid ${C.border}` }}>CephFS</td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}><StatusBadge color="blue">File</StatusBadge></td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}><StatusBadge color="green">Mounted</StatusBadge></td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: ".8rem" }}>/mnt/cephfs</td>
          </tr>
          <tr>
            <td style={{ padding: ".75rem 1rem", fontFamily: "'Space Mono',monospace", fontSize: ".85rem" }}>Vault Disk</td>
            <td style={{ padding: ".75rem 1rem" }}><StatusBadge color="vault">Backup</StatusBadge></td>
            <td style={{ padding: ".75rem 1rem" }}><StatusBadge color="vault">{vault?.mounted ? "Mounted" : "—"}</StatusBadge></td>
            <td style={{ padding: ".75rem 1rem", color: C.muted, fontSize: ".8rem" }}>/vault (sdf1)</td>
          </tr>
        </tbody>
      </TableWrap>

      <ActivityPanel activity={activity} onRefresh={onRefreshActivity} />
    </div>
  );
}
