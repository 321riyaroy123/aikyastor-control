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

  // ==========================================================================
  // Bucket Workspace
  // ==========================================================================
  bucketWorkspace: { display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1.5rem" },

  // Breadcrumb
  bucketBreadcrumb: { display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".82rem", color: C.muted, userSelect: "none" },
  breadcrumbItem: { display: "flex", alignItems: "center", gap: ".35rem" },
  breadcrumbItemActive: { color: C.accent, fontWeight: 600 },
  breadcrumbSeparator: { opacity: .45, color: C.muted },

  // Header
  bucketHeader: { display: "flex", flexDirection: "column", gap: "1.5rem", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "1.75rem" },
  bucketHeaderTop: { display: "flex", justifyContent: "flex-start" },
  bucketBackBtn: { display: "flex", alignItems: "center", gap: ".5rem", background: "none", border: "none", color: C.muted, cursor: "pointer", transition: "color .2s", fontFamily: "inherit", fontSize: ".9rem", padding: 0 },
  bucketHeaderMain: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "2rem", flexWrap: "wrap" },
  bucketTitleSection: { display: "flex", alignItems: "center", gap: "1rem" },
  bucketIcon: { width: 60, height: 60, borderRadius: 10, display: "flex", justifyContent: "center", alignItems: "center", fontSize: "1.8rem", background: "rgba(249,115,22,.12)", border: `1px solid rgba(249,115,22,.3)`, flexShrink: 0 },
  bucketTitle: { margin: 0, fontFamily: "'Space Mono',monospace", fontSize: "1.4rem", fontWeight: 700, color: C.text },
  bucketSubtitle: { marginTop: ".35rem", color: C.muted, fontSize: ".85rem" },

  // Info cards
  bucketInfoGrid: { display: "grid", gridTemplateColumns: "repeat(4,minmax(150px,1fr))", gap: ".85rem", flex: 1 },
  bucketInfoCard: { display: "flex", alignItems: "center", padding: ".9rem 1rem", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, transition: "all .2s ease" },
  bucketInfoLabel: { display: "block", marginBottom: ".25rem", color: C.muted, fontSize: ".7rem", textTransform: "uppercase", letterSpacing: ".05em", fontFamily: "'Space Mono',monospace" },
  bucketInfoValue: { fontSize: ".95rem", fontWeight: 600, color: C.text },

  // Storage usage
  bucketStorage: { display: "flex", flexDirection: "column", gap: ".55rem" },
  bucketStorageHeader: { display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: ".85rem", color: C.muted },
  bucketProgress: { width: "100%", height: 6, borderRadius: 999, background: C.surface2, border: `1px solid ${C.border}`, overflow: "hidden" },
  bucketProgressFill: { height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${C.accent}, ${C.accent2})`, transition: "width .3s ease" },
  bucketStorageNote: { fontSize: ".76rem", color: C.muted, fontStyle: "italic" },

  // Status badges
  bucketStatusRow: { display: "flex", flexWrap: "wrap", gap: ".6rem" },
  bucketBadge: { display: "inline-flex", alignItems: "center", gap: ".4rem", padding: ".4rem .85rem", borderRadius: 999, fontSize: ".76rem", fontWeight: 500, border: "1px solid transparent" },
  bucketBadgeSuccess: { background: "rgba(74,222,128,.12)", color: C.green, borderColor: "rgba(74,222,128,.3)" },
  bucketBadgeWarning: { background: "rgba(251,191,36,.12)", color: C.yellow, borderColor: "rgba(251,191,36,.3)" },
  bucketBadgeInfo: { background: "rgba(56,189,248,.12)", color: C.blue, borderColor: "rgba(56,189,248,.3)" },
  bucketBadgeSecondary: { background: "rgba(100,116,139,.12)", color: C.muted, borderColor: C.border },

  // Panel + tabs
  bucketPanel: { display: "flex", flexDirection: "column", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" },
  bucketTabs: { display: "flex", alignItems: "center", gap: ".25rem", padding: ".4rem", background: C.surface, borderBottom: `1px solid ${C.border}` },
  bucketTab: { display: "flex", alignItems: "center", gap: ".5rem", padding: ".7rem 1.1rem", border: "none", background: "transparent", color: C.muted, borderRadius: 6, cursor: "pointer", transition: "all .15s ease", fontFamily: "inherit", fontSize: ".85rem", fontWeight: 500 },
  bucketTabActive: { background: "rgba(249,115,22,.12)", color: C.accent, boxShadow: `inset 0 0 0 1px rgba(249,115,22,.25)` },

  // Toolbar
  bucketToolbar: { display: "flex", justifyContent: "flex-start", alignItems: "center", flexWrap: "wrap", gap: ".65rem", padding: "1rem 1.5rem", borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,.015)" },
  bucketToolbarBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: ".5rem", padding: ".6rem 1rem", minHeight: 38, borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.text, cursor: "pointer", fontFamily: "inherit", fontSize: ".82rem", fontWeight: 500, transition: "all .15s" },
  bucketToolbarBtnPrimary: { background: C.accent, color: "#000", borderColor: C.accent },
  bucketToolbarBtnDanger: { color: C.red, borderColor: "rgba(248,113,113,.3)" },

  // Content
  bucketWorkspaceContent: { padding: "1.5rem", minHeight: 400 },

  // Generic workspace card
  workspaceCard: { background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1.25rem" },
  workspaceCardTitle: { display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".85rem", fontFamily: "'Space Mono',monospace", fontSize: ".85rem", fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: ".03em" },
  workspaceDivider: { width: "100%", height: 1, background: C.border, margin: "1.5rem 0" },

  // Objects tab
  objectsTab: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  objectsToolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" },
  objectsSearch: { display: "flex", alignItems: "center", gap: ".55rem", minWidth: 280, padding: ".6rem .9rem", border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface2, transition: "all .2s ease" },
  objectsSearchInput: { width: "100%", border: "none", outline: "none", background: "none", color: C.text, fontFamily: "inherit", fontSize: ".85rem" },

  // Table
  objectTableWrapper: { overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface2 },
  objectTable: { width: "100%", borderCollapse: "collapse", minWidth: 700 },
  objectTableHeadRow: { background: "rgba(255,255,255,.03)" },
  objectTableTh: { padding: ".9rem 1rem", textAlign: "left", fontFamily: "'Space Mono',monospace", fontSize: ".72rem", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".05em", borderBottom: `1px solid ${C.border}` },
  objectTableTd: { padding: ".9rem 1rem", borderBottom: `1px solid rgba(255,255,255,.04)`, fontSize: ".85rem", color: C.text },
  objectName: { display: "flex", alignItems: "center", gap: ".55rem", fontWeight: 500 },
  objectActions: { display: "flex", alignItems: "center", gap: ".4rem" },
  objectActionBtn: { width: 32, height: 32, display: "flex", justifyContent: "center", alignItems: "center", border: "none", borderRadius: 6, background: "transparent", color: C.muted, cursor: "pointer", transition: "all .15s ease", textDecoration: "none" },
  objectActionBtnDanger: { color: C.red },
  objectEmpty: { textAlign: "center", padding: "3.5rem 2rem", color: C.muted, fontStyle: "italic", fontSize: ".85rem" },

  // Settings tab
  settingsPage: { display: "flex", gap: "1.5rem", alignItems: "flex-start" },
  settingsSidebar: { display: "flex", flexDirection: "column", gap: ".25rem", minWidth: 190, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: ".5rem" },
  settingsNavItem: { display: "flex", alignItems: "center", textAlign: "left", padding: ".65rem .8rem", border: "none", background: "transparent", color: C.muted, borderRadius: 5, cursor: "pointer", fontFamily: "inherit", fontSize: ".83rem", fontWeight: 500, transition: "all .15s ease" },
  settingsContent: { flex: 1, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1.5rem" },
  settingsPlaceholder: { marginTop: "1rem", color: C.muted, fontSize: ".85rem", fontStyle: "italic" },

  // Lifecycle tab
  lifecyclePage: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  lifecycleCard: { background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1.25rem" },
  lifecycleCardTitle: { fontFamily: "'Space Mono',monospace", fontSize: ".78rem", fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: ".6rem" },
  lifecycleInfoCard: { background: "rgba(56,189,248,.06)", border: `1px solid rgba(56,189,248,.2)`, borderRadius: 8, padding: "1.1rem 1.25rem" },

  // Policies tab
  policiesPage: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  policySecurity: { display: "flex", flexDirection: "column", gap: ".5rem" },
  policySecurityRow: { display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".85rem", color: C.text },
  policyFooter: { display: "flex", gap: ".75rem" },

  // Shared page header (title + subtitle) used by Policies/Lifecycle
  pageHeaderTitle: { margin: 0, fontFamily: "'Space Mono',monospace", fontSize: "1.1rem", fontWeight: 700, color: C.text },
  pageHeaderSubtitle: { marginTop: ".3rem", color: C.muted, fontSize: ".85rem" },

  // ==========================================================================
  // Policy System (Templates, Statement Builder, Preview, Validator)
  // ==========================================================================

  // Shared icon buttons
  iconButton: { display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: "none", borderRadius: 6, background: "transparent", color: C.muted, cursor: "pointer", transition: "all .15s ease" },
  iconButtonDanger: { color: C.red },

  // Policy Templates
  policyTemplateGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: ".85rem" },
  policyTemplateCard: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: ".75rem", padding: "1.1rem", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left", transition: "all .15s ease", fontFamily: "inherit" },
  policyTemplateCardSelected: { borderColor: C.accent, background: "rgba(249,115,22,.08)", boxShadow: "0 0 0 1px rgba(249,115,22,.35)" },
  policyTemplateIcon: { display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 8 },
  policyTemplateIconGreen: { background: "rgba(74,222,128,.12)", color: C.green },
  policyTemplateIconBlue: { background: "rgba(56,189,248,.12)", color: C.blue },
  policyTemplateIconOrange: { background: "rgba(249,115,22,.12)", color: C.accent },
  policyTemplateIconPurple: { background: "rgba(167,139,250,.12)", color: C.purple },
  policyTemplateIconRed: { background: "rgba(248,113,113,.12)", color: C.red },
  policyTemplateContent: { display: "flex", flexDirection: "column", gap: ".3rem" },
  policyTemplateTitle: { fontSize: ".88rem", fontWeight: 600, color: C.text },
  policyTemplateDescription: { fontSize: ".76rem", color: C.muted, lineHeight: 1.4 },

  // Policy Statement (card)
  policyStatement: { display: "flex", flexDirection: "column", gap: "1rem", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1.25rem", marginBottom: "1rem" },
  policyStatementHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" },
  policyStatementTitle: { fontFamily: "'Space Mono',monospace", fontSize: ".92rem", fontWeight: 700, color: C.text },
  policyStatementSubtitle: { marginTop: ".2rem", fontSize: ".78rem", color: C.muted },
  policyStatementActions: { display: "flex", alignItems: "center", gap: ".3rem", flexShrink: 0 },

  // Sections within a statement
  policySection: { display: "flex", flexDirection: "column", gap: ".5rem" },
  policySectionLabel: { fontFamily: "'Space Mono',monospace", fontSize: ".72rem", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".05em" },

  // Actions checkbox grid
  policyActionsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: ".5rem" },
  policyCheckbox: { display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".82rem", color: C.text, cursor: "pointer", userSelect: "none" },
  policyCheckboxInput: { width: 15, height: 15, accentColor: C.accent, cursor: "pointer", flexShrink: 0 },

  // Resource + condition cards
  policyResourceCard: { display: "flex", alignItems: "center", gap: ".6rem", padding: ".75rem", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: ".5rem" },
  policyConditionCard: { display: "flex", flexDirection: "column", gap: ".85rem", padding: ".9rem", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 },
  policyConditionField: { display: "flex", flexDirection: "column", gap: ".4rem" },

  // Policy Preview
  policyPreviewToolbar: { display: "flex", gap: ".6rem", marginBottom: "1rem" },
  policyJson: { display: "block", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "1rem 1.1rem", overflowX: "auto", fontFamily: "'Space Mono',monospace", fontSize: ".78rem", lineHeight: 1.65, color: C.text, whiteSpace: "pre" },

  // Policy Validator - risk badge
  policyRisk: { display: "inline-flex", alignItems: "center", gap: ".55rem", padding: ".6rem 1rem", borderRadius: 6, fontSize: ".85rem", fontWeight: 600, marginBottom: "1rem", border: "1px solid transparent" },
  policyRiskLow: { background: "rgba(74,222,128,.1)", color: C.green, borderColor: "rgba(74,222,128,.3)" },
  policyRiskMedium: { background: "rgba(251,191,36,.1)", color: C.yellow, borderColor: "rgba(251,191,36,.3)" },
  policyRiskHigh: { background: "rgba(248,113,113,.1)", color: C.red, borderColor: "rgba(248,113,113,.3)" },

  // Validator message groups
  policyMessageGroup: { display: "flex", flexDirection: "column", gap: ".5rem", marginTop: "1.1rem" },
  policyMessageGroupTitle: { fontFamily: "'Space Mono',monospace", fontSize: ".72rem", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".05em" },
  policyMessage: { display: "flex", alignItems: "flex-start", gap: ".55rem", padding: ".65rem .85rem", borderRadius: 6, fontSize: ".82rem", lineHeight: 1.45, border: "1px solid transparent" },
  policyMessageError: { background: "rgba(248,113,113,.08)", color: C.red, borderColor: "rgba(248,113,113,.25)" },
  policyMessageWarning: { background: "rgba(251,191,36,.08)", color: C.yellow, borderColor: "rgba(251,191,36,.25)" },
  policyMessageInfo: { background: "rgba(56,189,248,.08)", color: C.blue, borderColor: "rgba(56,189,248,.25)" },
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