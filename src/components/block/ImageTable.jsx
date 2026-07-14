import { Th, Td, TableWrap, EmptyRow } from "../common/Table";
import Button from "../common/Button";
import StatusBadge from "../common/StatusBadge";
import { C } from "../../styles/theme";
import { formatBytes } from "../../utils/formatters";

// NOTE on naming: the target tree named this "MappingDialog.jsx", but the
// original UI has no separate mapping dialog — map/unmap are single-click
// row actions inside the images table. This file instead covers both tables
// from BlockStorage (Mapped Devices + RBD Images); the two actual dialogs
// (create image, create snapshot) live in CreateImageDialog.jsx and
// SnapshotDialog.jsx below, matching what the UI actually does.
export default function ImageTable({ images, mapped, onMap, onUnmap, onSnapshot, onExportVault, onDelete }) {
  return (
    <>
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: ".7rem", color: C.muted, marginBottom: ".75rem", textTransform: "uppercase", letterSpacing: 1 }}>Mapped Devices</div>
        <TableWrap>
          <thead><tr><Th>Device</Th><Th>Pool</Th><Th>Image</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {mapped.length === 0
              ? <EmptyRow colSpan={4}>No mapped devices</EmptyRow>
              : mapped.map((m, i) => (
                <tr key={i}>
                  <Td style={{ fontFamily: "'Space Mono',monospace", fontSize: ".82rem" }}>{m.device}</Td>
                  <Td>{m.pool}</Td>
                  <Td>{m.name}</Td>
                  <Td><Button variant="ghost" size="sm" onClick={() => onUnmap(m.name)}>Unmap</Button></Td>
                </tr>
              ))}
          </tbody>
        </TableWrap>
      </div>

      <div>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: ".7rem", color: C.muted, marginBottom: ".75rem", textTransform: "uppercase", letterSpacing: 1 }}>RBD Images</div>
        <TableWrap>
          <thead><tr><Th>Name</Th><Th>Size</Th><Th>Format</Th><Th>Features</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {images.map((img, i) => (
              <tr key={i}>
                <Td style={{ fontFamily: "'Space Mono',monospace", fontSize: ".82rem" }}>{img.name}</Td>
                <Td>{formatBytes(img.size)}</Td>
                <Td>{img.format}</Td>
                <Td style={{ fontSize: ".75rem" }}>
                  <div style={{ display: "flex", gap: ".25rem", flexWrap: "wrap" }}>
                    {img.features.map(f => <StatusBadge key={f} color="blue">{f}</StatusBadge>)}
                    {img.features.length === 0 && <span style={{ color: C.muted }}>—</span>}
                  </div>
                </Td>
                <Td>
                  <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                    {mapped.find(m => m.name === img.name)
                      ? <Button variant="ghost" size="sm" onClick={() => onUnmap(img.name)}>Unmap</Button>
                      : <Button variant="green" size="sm" onClick={() => onMap(img.name)}>Map</Button>}
                    <Button variant="ghost" size="sm" onClick={() => onSnapshot(img.name)}>Snap</Button>
                    <Button variant="vault" size="sm" onClick={() => onExportVault(img.name)}>→ Vault</Button>
                    <Button variant="danger" size="sm" onClick={() => onDelete(img.name)}>✕</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </div>
    </>
  );
}
