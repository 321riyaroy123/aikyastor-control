import { useState } from "react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import LifecyclePolicySelector from "./LifecyclePolicySelector";
import { C, styles } from "../../styles/theme";
import { validateBucketName } from "../../utils/validators";

// Extracted from the "// NEW BUCKET" Modal in ObjectStorage in
// AiKyaStorCONTROL.jsx. `onCreate` is expected to return a Promise: resolve
// on success (dialog closes + resets), throw to show the error inline.
export default function BucketDialog({ open, onClose, onCreate, users, existingBuckets, lifecyclePolicies=[], onLifecyclePoliciesChange }) {
  const [form, setForm] = useState({ name: "", owner: "", acl: "private", versioning: false, locking: false, lifecycle: "none" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const close = () => { onClose(); setError(""); };

  const submit = async () => {
    const validationError = validateBucketName(form.name, existingBuckets);
    if (validationError) { setError(validationError); return; }
    setLoading(true);
    try {
      await onCreate({
        bucket: form.name,
        owner: form.owner,
        acl: form.acl,
        versioning: form.versioning,
        object_locking: form.locking,
        lifecycle: form.lifecycle
      });
      setForm({ name: "", owner: "", acl: "private", versioning: false, locking: false, lifecycle: "none" });
      setError("");
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="// NEW BUCKET" width={520}>
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", fontSize: ".8rem", color: C.muted, marginBottom: ".4rem", fontFamily: "'Space Mono',monospace" }}>Bucket Name *</label>
        <input style={styles.formInput} placeholder="e.g. my-bucket-01" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
        <div style={{ fontSize: ".72rem", color: C.muted, marginTop: ".3rem" }}>Lowercase letters, numbers, hyphens only. 3–63 chars.</div>
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", fontSize: ".8rem", color: C.muted, marginBottom: ".4rem", fontFamily: "'Space Mono',monospace" }}>Owner (RGW User)</label>
        <select style={styles.formInput} value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}>
          <option value="">— Select user —</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", fontSize: ".8rem", color: C.muted, marginBottom: ".4rem", fontFamily: "'Space Mono',monospace" }}>Access Control (ACL)</label>
        <select style={styles.formInput} value={form.acl} onChange={e => setForm(f => ({ ...f, acl: e.target.value }))}>
          <option value="private">Private — Only owner has full control</option>
          <option value="public-read">Public Read — Anyone can read</option>
          <option value="public-read-write">Public Read/Write — Anyone can read and write</option>
          <option value="authenticated-read">Authenticated Read — Authenticated users can read</option>
        </select>
      </div>
      <LifecyclePolicySelector
          value={form.lifecycle}
          onChange={(policyId) =>
              setForm(f => ({
                  ...f,
                  lifecycle: policyId
              }))
          }
          lifecyclePolicies={lifecyclePolicies}
          onLifecyclePoliciesChange={onLifecyclePoliciesChange}
          allowCreate={true}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: ".6rem", marginBottom: "1rem" }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: ".7rem", color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: ".2rem" }}>Options</div>
        {[["versioning", "Enable Versioning", "Keep multiple versions of each object"], ["locking", "Enable Object Locking (WORM)", "Write-once, read-many. Cannot be disabled later."]].map(([key, label, desc]) => (
          <label key={key} style={{ display: "flex", alignItems: "flex-start", gap: ".6rem", cursor: "pointer", padding: ".6rem .8rem", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <input type="checkbox" checked={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} style={{ marginTop: 2, accentColor: C.accent }} />
            <div>
              <div style={{ fontSize: ".85rem", fontWeight: 500 }}>{label}</div>
              <div style={{ fontSize: ".75rem", color: C.muted, marginTop: ".15rem" }}>{desc}</div>
            </div>
          </label>
        ))}
      </div>
      {error && <div style={{ padding: ".6rem .8rem", background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 6, color: C.red, fontSize: ".82rem", marginBottom: ".75rem" }}>{error}</div>}
      <div style={{ display: "flex", gap: ".75rem", marginTop: "1.5rem", justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={loading}>{loading ? "Creating..." : "Create Bucket"}</Button>
      </div>
    </Modal>
  );
}
