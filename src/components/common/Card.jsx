import { C } from "../../styles/theme";

export default function Card({
  children,
  style = {},
  vault = false
}) {
  return (
    <div
      style={{
        background: vault
          ? "rgba(167,139,250,.04)"
          : C.surface,
        border: `1px solid ${
          vault
            ? "rgba(167,139,250,.3)"
            : C.border
        }`,
        borderRadius: 8,
        padding: "1.25rem 1.5rem",
        ...style
      }}
    >
      {children}
    </div>
  );
}