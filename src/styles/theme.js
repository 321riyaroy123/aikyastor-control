// theme.js - shared design tokens extracted from AiKyaStorCONTROL.jsx
// Every component that used to redefine `C` / `styles` inline now imports from here.

export const C = {
  bg: "#0a0c10", surface: "#111318", surface2: "#181c24", border: "#1e2430",
  accent: "#f97316", accent2: "#fb923c", blue: "#38bdf8", green: "#4ade80",
  red: "#f87171", yellow: "#fbbf24", purple: "#a78bfa", text: "#e2e8f0", muted: "#64748b",
};

export const styles = {
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 },
  modal: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1.75rem", maxWidth: "90vw", maxHeight: "90vh", overflowY: "auto" },
  modalTitle: { fontFamily: "'Space Mono',monospace", fontSize: ".95rem", marginBottom: "1.25rem", color: C.accent },
  btn: { display: "inline-flex", alignItems: "center", gap: ".5rem", padding: ".5rem 1rem", borderRadius: 5, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: ".85rem", fontWeight: 500, transition: "all .15s" },
  btnPrimary: { background: C.accent, color: "#000" },
  btnGhost: { background: "transparent", color: C.muted, border: `1px solid ${C.border}` },
  btnDanger: { background: "transparent", color: C.red, border: `1px solid rgba(248,113,113,.3)` },
  btnBlue: { background: "transparent", color: C.blue, border: `1px solid rgba(56,189,248,.3)` },
  btnGreen: { background: "transparent", color: C.green, border: `1px solid rgba(74,222,128,.3)` },
  btnVault: { background: "rgba(167,139,250,.12)", color: C.purple, border: `1px solid rgba(167,139,250,.3)` },
  btnSm: { padding: ".3rem .7rem", fontSize: ".78rem" },
  formInput: { width: "100%", background: C.surface2, border: `1px solid ${C.border}`, color: C.text, padding: ".55rem .75rem", borderRadius: 5, fontFamily: "inherit", fontSize: ".85rem", outline: "none", boxSizing: "border-box" },
  tableWrap: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: "1.5rem" },
};

export function injectGlobalStyles() {
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');
    * { margin:0;padding:0;box-sizing:border-box; }
    body { background:#0a0c10;color:#e2e8f0;font-family:'DM Sans',sans-serif; }
    :root { --mono:'Space Mono',monospace;--sans:'DM Sans',sans-serif; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slideIn { from { transform:translateX(20px);opacity:0; } to { transform:translateX(0);opacity:1; } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    ::-webkit-scrollbar { width:6px; }
    ::-webkit-scrollbar-track { background:#111318; }
    ::-webkit-scrollbar-thumb { background:#1e2430;border-radius:3px; }
  `;
  document.head.appendChild(style);
  return () => document.head.removeChild(style);
}
