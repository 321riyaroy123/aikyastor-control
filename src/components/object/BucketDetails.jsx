import { useRef } from "react";
import Button from "../common/Button";
import ObjectTable from "./ObjectTable";
import BucketHeader from "./BucketHeader";
import { C, styles } from "../../styles/theme";

// Extracted from the currentBucket branch of ObjectStorage in
// AiKyaStorCONTROL.jsx: back nav, upload button + dropzone, vault sync
// button, and the ObjectTable.
export default function BucketDetails({ bucket, objects, onBack, onUpload, onDeleteObject, onSyncVault, downloadUrl, bucketPolicy, onEditPolicy }) {
  const fileRef = useRef();

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: ".5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
          <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: ".9rem", color: C.text }}>{bucket.name}</span>
        </div>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          <label style={{ ...styles.btn, ...styles.btnPrimary, ...styles.btnSm, cursor: "pointer" }}>
            ↑ Upload <input type="file" style={{ display: "none" }} ref={fileRef} onChange={e => { if (e.target.files[0]) { onUpload(e.target.files[0]); e.target.value = ""; } }} />
          </label>
          <Button variant="vault" size="sm" onClick={onSyncVault}>🔒 Sync Bucket → Vault</Button>
        </div>
      </div>
      <div>
        <BucketHeader bucket={bucket} policy={bucketPolicy} onEditPolicy={onEditPolicy} />
      </div>

      <div style={{ border: `2px dashed ${C.border}`, borderRadius: 8, padding: "2rem", textAlign: "center", cursor: "pointer", marginBottom: "1rem", position: "relative" }}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = C.accent; }}
        onDragLeave={e => { e.currentTarget.style.borderColor = C.border; }}
        onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = C.border; const f = e.dataTransfer.files[0]; if (f) onUpload(f); }}>
        <div style={{ fontSize: "1.5rem", pointerEvents: "none" }}>☁</div>
        <p style={{ color: C.muted, fontSize: ".85rem", marginTop: ".3rem" }}><strong style={{ color: C.accent }}>Click or drag & drop</strong> to upload</p>
        <input type="file" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} onChange={e => { if (e.target.files[0]) { onUpload(e.target.files[0]); e.target.value = ""; } }} />
      </div>

      <ObjectTable objects={objects} downloadUrl={downloadUrl} onDelete={onDeleteObject} />
    </>
  );
}
