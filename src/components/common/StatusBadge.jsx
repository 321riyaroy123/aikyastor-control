import { C } from "../../styles/theme";

export default function StatusBadge({ color = "blue", children }) {
  const colors = {
    blue: { background: "rgba(56,189,248,.1)", color: C.blue, border: "1px solid rgba(56,189,248,.25)" },
    green: { background: "rgba(74,222,128,.1)", color: C.green, border: "1px solid rgba(74,222,128,.25)" },
    orange: { background: "rgba(249,115,22,.1)", color: C.accent, border: "1px solid rgba(249,115,22,.25)" },
    red: { background: "rgba(248,113,113,.1)", color: C.red, border: "1px solid rgba(248,113,113,.25)" },
    vault: { background: "rgba(167,139,250,.1)", color: C.purple, border: "1px solid rgba(167,139,250,.25)" },
  };
  return <span style={{ display: "inline-block", padding: ".15rem .5rem", borderRadius: 3, fontFamily: "'Space Mono',monospace", fontSize: ".68rem", ...colors[color] }}>{children}</span>;
}

// Defined but never actually rendered anywhere in the original file.
// Preserved as-is, not wired in, since removing unused exports wasn't requested.
export function Spinner() {
  return <span style={{ display: "inline-block", width: 14, height: 14, border: `2px solid ${C.border}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin .6s linear infinite", flexShrink: 0 }} />;
}
