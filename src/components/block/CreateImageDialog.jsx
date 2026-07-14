import { useState } from "react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import { C, styles } from "../../styles/theme";

// Extracted from the "// NEW RBD IMAGE" Modal in BlockStorage in
// AiKyaStorCONTROL.jsx.
export default function CreateImageDialog({ open, onClose, onCreate, toast }) {
  const [form, setForm] = useState({ name: "", size: 1024, vault: false });

  const submit = async () => {
    if (!form.name.trim()) { toast("Image name required", "error"); return; }
    await onCreate(form.name, form.size, form.vault);
    setForm({ name: "", size: 1024, vault: false });
  };

  return (
    <Modal open={open} onClose={onClose} title="// NEW RBD IMAGE">
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", fontSize: ".8rem", color: C.muted, marginBottom: ".4rem", fontFamily: "'Space Mono',monospace" }}>Image Name</label>
        <input style={styles.formInput} placeholder="disk1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", fontSize: ".8rem", color: C.muted, marginBottom: ".4rem", fontFamily: "'Space Mono',monospace" }}>Size (MB)</label>
        <input style={styles.formInput} placeholder="1024" type="number" value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", padding: ".6rem .8rem", borderRadius: 6, background: "rgba(167,139,250,.07)", border: "1px solid rgba(167,139,250,.2)", marginBottom: "1rem" }}>
        <input type="checkbox" id="vaultExport" checked={form.vault} onChange={e => setForm(f => ({ ...f, vault: e.target.checked }))} style={{ accentColor: C.purple, width: 16, height: 16 }} />
        <label htmlFor="vaultExport" style={{ fontSize: ".82rem", color: C.purple, cursor: "pointer", fontFamily: "'Space Mono',monospace" }}>🔒 Also export to Vault after creation (rbd export)</label>
      </div>
      <div style={{ display: "flex", gap: ".75rem", marginTop: "1.5rem", justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit}>Create</Button>
      </div>
    </Modal>
  );
}
