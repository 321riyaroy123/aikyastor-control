import { useState, useEffect, useCallback } from "react";
import { ClusterAPI } from "./api/cluster";
import { VaultAPI } from "./api/vault";
import { BlockAPI } from "./api/blockStorage";
import { useToasts } from "./hooks/useToasts";
import { useBuckets } from "./hooks/useBuckets";
import { useActivity } from "./hooks/useActivity";
import { C, injectGlobalStyles } from "./styles/theme";
import { formatBytes } from "./utils/formatters";

import Dashboard from "./pages/Dashboard";
import ObjectStoragePage from "./pages/ObjectStorage";
import BlockStoragePage from "./pages/BlockStorage";
import FileStoragePage from "./pages/FileStorage";
import VaultPage from "./pages/Vault";
import EncryptionVaultPage from "./pages/EncryptionVault";

// Root UI shell for the dashboard: global status bars, sidebar
// navigation, page switching, and toast notifications.
export default function App() {
  const [section, setSection] = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [vault, setVault] = useState(null);
  const [images, setImages] = useState([]);
  const [toasts, toast] = useToasts();

  const { buckets, loadBuckets } = useBuckets();
  const { activity, loadActivity } = useActivity(10000);

  const loadStats = useCallback(async () => {
    try { setStats(await ClusterAPI.stats()); } catch (err) { console.error(err); }
  }, []);

  const loadHealth = useCallback(async () => {
    try { setHealth(await ClusterAPI.health()); } catch (err) { console.error(err); }
  }, []);

  const loadVault = useCallback(async () => {
    try { setVault(await VaultAPI.status()); } catch (err) { console.error(err); }
  }, []);

  const loadImages = useCallback(async () => {
    try {
      const result = await BlockAPI.images();
      setImages(result.images || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    loadStats();
    loadHealth();
    loadVault();
    loadImages();

    const healthTimer = setInterval(loadHealth, 15000);
    const vaultTimer = setInterval(loadVault, 30000);
    return () => {
      clearInterval(healthTimer);
      clearInterval(vaultTimer);
    };
  }, [loadStats, loadHealth, loadVault, loadImages]);

  useEffect(() => injectGlobalStyles(), []);

  const navItems = [
    { id: "dashboard", icon: "◈", label: "Dashboard", section: "Overview" },
    { id: "object", icon: "◉", label: "Object Storage", section: "Storage" },
    { id: "block", icon: "▣", label: "Block Storage", section: "Storage" },
    { id: "file", icon: "⊞", label: "File Storage", section: "Storage" },
    { id: "vault", icon: "🔒", label: "Vault Backup", section: "Vault" },
    { id: "encryption-vault", icon: "🔐", label: "Encryption Vault", section: "Security" },
  ];

  const healthColor = health?.status === "HEALTH_OK" ? C.green : health?.status?.includes("WARN") ? C.yellow : C.red;

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'DM Sans',sans-serif", minHeight: "100vh", overflowX: "hidden" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2rem", height: 60, background: C.surface, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 100, gap: "1rem" }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "1.1rem", color: C.accent, letterSpacing: 2, whiteSpace: "nowrap" }}>
          AiKyaStor<span style={{ color: C.text, opacity: .5 }}>CONTROL</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: "'Space Mono',monospace", fontSize: ".72rem", padding: ".3rem .8rem", borderRadius: 4, background: "rgba(167,139,250,.1)", border: "1px solid rgba(167,139,250,.3)", color: C.purple, whiteSpace: "nowrap" }}>
            🔒 Vault: {vault ? `${formatBytes(vault.free)} free` : "checking..."}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: "'Space Mono',monospace", fontSize: ".75rem", padding: ".3rem .8rem", borderRadius: 4, background: C.surface2, border: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: healthColor, boxShadow: `0 0 8px ${healthColor}`, display: "inline-block" }} />
            {health?.status || "checking..."}
          </div>
        </div>
      </header>

      <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>
        <nav style={{ width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, padding: "1.5rem 0", flexShrink: 0, overflowY: "auto" }}>
          {["Overview", "Storage", "Vault", "Security"].map(sec => (
            <div key={sec}>
              <div style={{ padding: "0 1rem .5rem", fontFamily: "'Space Mono',monospace", fontSize: ".65rem", color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>{sec}</div>
              {navItems.filter(n => n.section === sec).map(n => (
                <div key={n.id}
                  style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".65rem 1.25rem", cursor: "pointer", fontSize: ".9rem", color: section === n.id ? C.accent : C.muted, borderLeft: section === n.id ? `2px solid ${C.accent}` : "2px solid transparent", background: section === n.id ? "rgba(249,115,22,.07)" : "transparent", transition: "all .15s" }}
                  onClick={() => setSection(n.id)}
                  onMouseEnter={e => { if (section !== n.id) { e.currentTarget.style.color = C.text; e.currentTarget.style.background = C.surface2; } }}
                  onMouseLeave={e => { if (section !== n.id) { e.currentTarget.style.color = C.muted; e.currentTarget.style.background = "transparent"; } }}>
                  <span style={{ fontSize: "1rem", width: 20, textAlign: "center" }}>{n.icon}</span>
                  {n.label}
                </div>
              ))}
              {sec !== "Security" && <div style={{ height: 1, background: C.border, margin: ".75rem 1rem" }} />}
            </div>
          ))}
        </nav>

        <main style={{ flex: 1, overflowY: "auto", padding: "2rem" }}>
          {section === "dashboard" && <Dashboard stats={stats} health={health} vault={vault} activity={activity} onRefreshActivity={loadActivity} />}
          {section === "object" && <ObjectStoragePage toast={toast} buckets={buckets} reloadBuckets={loadBuckets} />}
          {section === "block" && <BlockStoragePage toast={toast} images={images} reloadImages={loadImages} />}
          {section === "file" && <FileStoragePage toast={toast} />}
          {section === "vault" && <VaultPage vault={vault} buckets={buckets} images={images} activity={activity} toast={toast} onRefreshVault={loadVault} onRefreshActivity={loadActivity} />}
          {section === "encryption-vault" && <EncryptionVaultPage toast={toast} />}
        </main>
      </div>

      <div style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 9999, display: "flex", flexDirection: "column", gap: ".5rem", maxWidth: 340 }}>
        {toasts.map(t => {
          const colors = { success: `rgba(74,222,128,.4)`, error: `rgba(248,113,113,.4)`, info: `rgba(56,189,248,.4)`, vault: `rgba(167,139,250,.4)` };
          const textColors = { success: C.green, error: C.red, info: C.blue, vault: C.purple };
          return (
            <div key={t.id} style={{ padding: ".75rem 1.25rem", borderRadius: 6, fontSize: ".85rem", background: C.surface2, border: `1px solid ${colors[t.type] || colors.info}`, color: textColors[t.type] || C.text, animation: "slideIn .2s ease", wordBreak: "break-word" }}>
              {t.msg}
            </div>
          );
        })}
      </div>
    </div>
  );
}
