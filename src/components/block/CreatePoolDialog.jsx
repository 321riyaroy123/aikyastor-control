import Button from "../common/Button";
import { C } from "../../styles/theme";

export default function CreatePoolDialog({
  open,
  onClose,
  poolName,
  setPoolName,
  onCreate,
  creating,
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: "420px",
          maxWidth: "90vw",
          padding: "1.5rem",
          borderRadius: 8,
          background: C.surface,
          border: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: ".95rem",
            color: C.text,
            marginBottom: ".5rem",
          }}
        >
          Create New RBD Pool
        </div>

        <div
          style={{
            fontSize: ".78rem",
            color: C.muted,
            marginBottom: "1.25rem",
            lineHeight: 1.6,
          }}
        >
          Creates a Ceph pool and initializes it for
          RADOS Block Device (RBD) storage.
        </div>

        <label
          style={{
            display: "block",
            fontSize: ".75rem",
            color: C.muted,
            marginBottom: ".5rem",
          }}
        >
          Pool Name
        </label>

        <input
          autoFocus
          value={poolName}
          disabled={creating}
          onChange={(e) => setPoolName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !creating) {
              onCreate();
            }
          }}
          placeholder="e.g. fast-rbd"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: ".7rem .8rem",
            background: C.bg,
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            outline: "none",
            fontFamily: "'Space Mono', monospace",
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: ".75rem",
            marginTop: "1.5rem",
          }}
        >
          <Button
            variant="secondary"
            size="sm"
            disabled={creating}
            onClick={onClose}
          >
            Cancel
          </Button>

          <Button
            variant="primary"
            size="sm"
            disabled={creating}
            onClick={onCreate}
          >
            {creating ? "Creating..." : "Create Pool"}
          </Button>
        </div>
      </div>
    </div>
  );
}