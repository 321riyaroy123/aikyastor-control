import { C } from "../../styles/theme";

export default function StatCard({ label, value, sub, pctVal, vault }) {
  return (
    <div
      style={{
        background: vault ? "rgba(167,139,250,.04)" : C.surface,
        border: `1px solid ${vault ? "rgba(167,139,250,.3)" : C.border}`,
        borderRadius: 8,
        padding: "1.25rem 1.5rem"
      }}
    >
      <div
        style={{ fontFamily: "'Space Mono', monospace", fontSize: ".7rem", color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: ".5rem" }}>
        {label}
      </div>

      <div
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: "1.4rem",
          color: vault ? C.purple : C.text
        }}
      >
        {value}
      </div>

      {sub && (
        <div
          style={{
            fontSize: ".78rem",
            color: C.muted,
            marginTop: ".25rem"
          }}
        >
          {sub}
        </div>
      )}

      {pctVal !== undefined && (
        <div
          style={{
            height: 4,
            background: C.border,
            borderRadius: 2,
            marginTop: ".75rem",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              height: "100%",
              background: C.accent,
              borderRadius: 2,
              width: `${pctVal}%`,
              transition: "width .5s"
            }}
          />
        </div>
      )}
    </div>
  );
}