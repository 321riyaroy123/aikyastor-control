import { C } from "../../styles/theme";
import Button from "../common/Button";

export default function ActivityPanel({ activity, onRefresh, vaultOnly }) {
  const rows = vaultOnly ? activity.filter(a => a.vault) : activity;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: ".75rem 1rem", background: C.surface2, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "'Space Mono',monospace", fontSize: ".75rem", color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{vaultOnly ? "🔒 Vault Activity" : "⚡ Activity Log"}</span>
        {onRefresh && <Button variant="ghost" size="sm" onClick={onRefresh}>↻ Refresh</Button>}
      </div>
      <div style={{ maxHeight: 340, overflowY: "auto" }}>
        {rows.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: C.muted, fontFamily: "'Space Mono',monospace", fontSize: ".78rem" }}>No activity yet</div>
        ) : rows.map((a, i) => {
          const statusColor = a.status === "success" ? C.green : a.status === "error" ? C.red : C.blue;
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 130px 80px 1fr", gap: ".75rem", padding: ".65rem 1rem", borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none", fontSize: ".78rem", alignItems: "center" }}>
              <span style={{ color: C.muted, fontFamily: "'Space Mono',monospace", fontSize: ".7rem" }}>{a.time}</span>
              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: ".72rem", color: C.text }}>{a.action}</span>
              <span style={{ color: statusColor, fontFamily: "'Space Mono',monospace", fontSize: ".7rem", textTransform: "uppercase" }}>{a.status}</span>
              <span style={{ color: C.muted, fontSize: ".73rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.target} {a.detail && `· ${a.detail}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
