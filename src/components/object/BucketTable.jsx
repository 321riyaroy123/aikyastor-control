import { C } from "../../styles/theme";
import Button from "../common/Button";

// Extracted from the bucket-grid branch (!currentBucket) of ObjectStorage
// in AiKyaStorCONTROL.jsx.
export default function BucketTable({ buckets, onOpen, onDelete, onCreateClick }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: ".5rem" }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "1rem", color: C.text, display: "flex", alignItems: "center", gap: ".75rem" }}>
          ◉ Object Storage <span style={{ fontSize: ".65rem", padding: ".2rem .6rem", borderRadius: 3, background: "rgba(249,115,22,.15)", color: C.accent, border: "1px solid rgba(249,115,22,.3)" }}>S3 / RGW</span>
        </div>
        <Button variant="primary" size="sm" onClick={onCreateClick}>+ New Bucket</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {buckets.map(b => (
          <div key={b.name} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1rem", cursor: "pointer", transition: "all .15s" }}
            onClick={() => onOpen(b)}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.surface2; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface; }}>
            <div style={{ fontSize: "1.5rem", marginBottom: ".5rem" }}>🪣</div>
            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: ".85rem", color: C.text, marginBottom: ".35rem" }}>{b.name}</div>
            <div style={{ fontSize: ".75rem", color: C.muted }}>Created {new Date(b.created).toLocaleDateString()}</div>
            <div style={{ marginTop: ".6rem", display: "flex", gap: ".4rem", justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
              <Button variant="danger" size="sm" onClick={() => onDelete(b.name)}>✕</Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
