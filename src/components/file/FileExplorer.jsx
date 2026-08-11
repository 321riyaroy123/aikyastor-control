import { useState } from "react";
import Button from "../common/Button";
import Modal from "../common/Modal";
import { Th, TableWrap, EmptyRow } from "../common/Table";
import StatusBadge from "../common/StatusBadge";
import { C, styles } from "../../styles/theme";
import { formatBytes } from "../../utils/formatters";

// Extracted from FileStorage in AiKyaStorCONTROL.jsx: breadcrumb nav,
// upload dropzone, mkdir modal, and the directory listing table.
export default function FileExplorer({ path, entries, onBrowse, onUpload, onDelete, onMkdir, onSyncVault, downloadUrl }) {
  const [showMkdir, setShowMkdir] = useState(false);
  const [newDir, setNewDir] = useState("");

  const pathParts = path ? path.split("/").filter(Boolean) : [];

  const mkdir = async () => {
    if (!newDir.trim()) return;
    await onMkdir(newDir);
    setShowMkdir(false);
    setNewDir("");
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: ".5rem" }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: "1rem", color: C.text, display: "flex", alignItems: "center", gap: ".75rem" }}>
          ⊞ File Storage <span style={{ fontSize: ".65rem", padding: ".2rem .6rem", borderRadius: 3, background: "rgba(249,115,22,.15)", color: C.accent, border: "1px solid rgba(249,115,22,.3)" }}>CephFS</span>
        </div>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          <Button variant="ghost" size="sm" onClick={() => setShowMkdir(true)}>+ Folder</Button>
          <label style={{ ...styles.btn, ...styles.btnPrimary, ...styles.btnSm, cursor: "pointer" }}>
            ↑ Upload <input type="file" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) { onUpload(e.target.files[0]); e.target.value = ""; } }} />
          </label>
          <Button variant="vault" size="sm" onClick={onSyncVault}>🔒 Sync All → Vault</Button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: ".25rem", fontFamily: "'Space Mono',monospace", fontSize: ".78rem", color: C.muted, marginBottom: "1rem", padding: ".6rem 1rem", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, flexWrap: "wrap" }}>
        <span style={{ cursor: "pointer", color: C.blue }} onClick={() => onBrowse("")}>root</span>
        {pathParts.map((p, i) => {
          const sub = pathParts.slice(0, i + 1).join("/");
          return [
            <span key={`sep-${i}`} style={{ color: C.border }}> / </span>,
            <span key={`part-${i}`} style={{ cursor: "pointer", color: C.blue }} onClick={() => onBrowse(sub)}>{p}</span>
          ];
        })}
      </div>

      <div style={{ border: `2px dashed ${C.border}`, borderRadius: 8, padding: "2rem", textAlign: "center", cursor: "pointer", marginBottom: "1rem", position: "relative" }}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = C.accent; }}
        onDragLeave={e => { e.currentTarget.style.borderColor = C.border; }}
        onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = C.border; const f = e.dataTransfer.files[0]; if (f) onUpload(f); }}>
        <div style={{ fontSize: "1.5rem", pointerEvents: "none" }}>📁</div>
        <p style={{ color: C.muted, fontSize: ".85rem", marginTop: ".3rem" }}><strong style={{ color: C.accent }}>Click or drag & drop</strong> to upload to current folder</p>
        <input type="file" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} onChange={e => { if (e.target.files[0]) { onUpload(e.target.files[0]); e.target.value = ""; } }} />
      </div>

      <TableWrap>
        <thead><tr><Th>Name</Th><Th>Type</Th><Th>Size</Th><Th>Modified</Th><Th>Actions</Th></tr></thead>
        <tbody>
          {entries.length === 0
            ? <EmptyRow colSpan={5}>Empty directory</EmptyRow>
            : entries.map((e, i) => {
              const fullPath = (path ? path + "/" : "") + e.name;
              return (
                <tr key={i}>
                  <td style={{ padding: ".75rem 1rem", fontSize: ".85rem", borderBottom: `1px solid ${C.border}`, fontFamily: "'Space Mono',monospace", cursor: e.type === "dir" ? "pointer" : "default", color: e.type === "dir" ? C.blue : C.text }}
                    onClick={() => e.type === "dir" && onBrowse(fullPath)}>
                    {e.type === "dir" ? "📁" : "📄"} {e.name}
                  </td>
                  <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}><StatusBadge color={e.type === "dir" ? "orange" : "blue"}>{e.type}</StatusBadge></td>
                  <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, fontSize: ".85rem" }}>{e.type === "dir" ? "—" : formatBytes(e.size)}</td>
                  <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: ".78rem" }}>{new Date(parseFloat(e.modified) * 1000).toLocaleString()}</td>
                  <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", gap: ".4rem" }}>
                      {e.type !== "dir" && <Button as="a" href={downloadUrl(fullPath)} download variant="blue" size="sm">↓</Button>}
                      <Button variant="danger" size="sm" onClick={() => onDelete(e.name)}>✕</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </TableWrap>

      <Modal open={showMkdir} onClose={() => setShowMkdir(false)} title="// NEW FOLDER">
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", fontSize: ".8rem", color: C.muted, marginBottom: ".4rem", fontFamily: "'Space Mono',monospace" }}>Folder Name</label>
          <input style={styles.formInput} placeholder="myfolder" value={newDir} onChange={e => setNewDir(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && mkdir()} />
        </div>
        <div style={{ display: "flex", gap: ".75rem", marginTop: "1.5rem", justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => setShowMkdir(false)}>Cancel</Button>
          <Button variant="primary" onClick={mkdir}>Create</Button>
        </div>
      </Modal>
    </>
  );
}
