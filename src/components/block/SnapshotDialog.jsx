import { useState, useEffect } from "react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import { C, styles } from "../../styles/theme";

// Extracted from the "// CREATE SNAPSHOT" Modal in BlockStorage in
// AiKyaStorCONTROL.jsx. `imageName` is null when closed, the target image
// name when open.
export default function SnapshotDialog({ imageName, onClose, onCreate, toast }) {
  const [snapName, setSnapName] = useState("");

  useEffect(() => {
    if (imageName) setSnapName(`snap-${imageName}-${Date.now()}`);
  }, [imageName]);

  const submit = async () => {
    if (!snapName) { toast("Snapshot name required", "error"); return; }
    await onCreate(imageName, snapName);
    setSnapName("");
  };

  return (
    <Modal open={!!imageName} onClose={onClose} title="// CREATE SNAPSHOT">
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", fontSize: ".8rem", color: C.muted, marginBottom: ".4rem", fontFamily: "'Space Mono',monospace" }}>Snapshot Name</label>
        <input style={styles.formInput} value={snapName} onChange={e => setSnapName(e.target.value)} autoFocus />
      </div>
      <div style={{ display: "flex", gap: ".75rem", marginTop: "1.5rem", justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit}>Snapshot</Button>
      </div>
    </Modal>
  );
}
