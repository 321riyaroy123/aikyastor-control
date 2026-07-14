import StatCard from "../common/StatCard";
import Button from "../common/Button";
import StatusBadge from "../common/StatusBadge";
import { Th, TableWrap } from "../common/Table";
import { C } from "../../styles/theme";
import { formatBytes } from "../../utils/formatters";

// Extracted from VaultSection in AiKyaStorCONTROL.jsx (stat cards + the
// storage-type/method/vault-path/action sync table). Purely presentational;
// the parent page (pages/Vault.jsx) owns the bucket/image selection state
// and the sync/export handlers.
export default function VaultStatus({ vault, buckets, images, selBucket, setSelBucket, selImage, setSelImage, onSyncBucket, onExportImage, onSyncCephFS }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Vault Total" value={vault ? formatBytes(vault.total) : "—"} sub="/vault disk size" vault />
        <StatCard label="Vault Used" value={vault ? formatBytes(vault.used) : "—"} vault />
        <StatCard label="Vault Free" value={vault ? formatBytes(vault.free) : "—"} vault />
      </div>

      <TableWrap>
        <thead><tr><Th>Storage Type</Th><Th>Method</Th><Th>Vault Path</Th><Th>Action</Th></tr></thead>
        <tbody>
          <tr>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}><StatusBadge color="blue">Object (S3)</StatusBadge></td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, fontFamily: "'Space Mono',monospace", fontSize: ".78rem" }}>rclone sync</td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, fontFamily: "'Space Mono',monospace", fontSize: ".78rem", color: C.muted }}>/vault/object/&lt;bucket&gt;/</td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                <select style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, padding: ".25rem .5rem", borderRadius: 5, fontSize: ".78rem" }} value={selBucket} onChange={e => setSelBucket(e.target.value)}>
                  {buckets.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>
                <Button variant="vault" size="sm" onClick={onSyncBucket}>Sync Now</Button>
              </div>
            </td>
          </tr>
          <tr>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}><StatusBadge color="blue">File (CephFS)</StatusBadge></td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, fontFamily: "'Space Mono',monospace", fontSize: ".78rem" }}>rsync</td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, fontFamily: "'Space Mono',monospace", fontSize: ".78rem", color: C.muted }}>/vault/file/</td>
            <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}><Button variant="vault" size="sm" onClick={onSyncCephFS}>Sync Now</Button></td>
          </tr>
          <tr>
            <td style={{ padding: ".75rem 1rem" }}><StatusBadge color="orange">Block (RBD)</StatusBadge></td>
            <td style={{ padding: ".75rem 1rem", fontFamily: "'Space Mono',monospace", fontSize: ".78rem" }}>rbd export</td>
            <td style={{ padding: ".75rem 1rem", fontFamily: "'Space Mono',monospace", fontSize: ".78rem", color: C.muted }}>/vault/block/&lt;name&gt;.img</td>
            <td style={{ padding: ".75rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                <select style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, padding: ".25rem .5rem", borderRadius: 5, fontSize: ".78rem" }} value={selImage} onChange={e => setSelImage(e.target.value)}>
                  {images.map(img => <option key={img.name} value={img.name}>{img.name}</option>)}
                </select>
                <Button variant="vault" size="sm" onClick={onExportImage}>Export Now</Button>
              </div>
            </td>
          </tr>
        </tbody>
      </TableWrap>
    </>
  );
}
