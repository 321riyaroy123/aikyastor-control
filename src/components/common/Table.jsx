import { C, styles } from "../../styles/theme";

// Consolidates the Th/Td local helpers that were independently (and
// identically) redefined inside ObjectStorage, BlockStorage, FileStorage,
// and VaultSection in the original AiKyaStorCONTROL.jsx.

export function Th({ children }) {
  return (
    <th style={{ fontFamily: "'Space Mono',monospace", fontSize: ".7rem", color: C.muted, textTransform: "uppercase", letterSpacing: 1, padding: ".75rem 1rem", textAlign: "left", background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
      {children}
    </th>
  );
}

export function Td({ children, style }) {
  return (
    <td style={{ padding: ".75rem 1rem", fontSize: ".85rem", borderBottom: `1px solid ${C.border}`, ...style }}>
      {children}
    </td>
  );
}

export function TableWrap({ children }) {
  return (
    <div style={styles.tableWrap}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>{children}</table>
    </div>
  );
}

export function EmptyRow({ colSpan, children = "No entries" }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ textAlign: "center", color: C.muted, padding: "2rem", fontFamily: "'Space Mono',monospace", fontSize: ".8rem" }}>
        {children}
      </td>
    </tr>
  );
}
