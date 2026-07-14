import { Th, Td, TableWrap, EmptyRow } from "../common/Table";
import Button from "../common/Button";
import { C } from "../../styles/theme";
import { formatBytes } from "../../utils/formatters";

// Extracted from the objects <table> inside the currentBucket branch of
// ObjectStorage in AiKyaStorCONTROL.jsx.
export default function ObjectTable({ objects, downloadUrl, onDelete }) {
  return (
    <TableWrap>
      <thead><tr><Th>Key</Th><Th>Size</Th><Th>Modified</Th><Th>Actions</Th></tr></thead>
      <tbody>
        {(objects || []).length === 0 ? (
          <EmptyRow colSpan={4}>No objects</EmptyRow>
        ) : (objects || []).map((o, i) => (
          <tr key={i}>
            <Td style={{ fontFamily: "'Space Mono',monospace", fontSize: ".82rem" }}>{o.key}</Td>
            <Td>{formatBytes(o.size)}</Td>
            <Td style={{ color: C.muted, fontSize: ".8rem" }}>{new Date(o.modified).toLocaleString()}</Td>
            <Td>
              <div style={{ display: "flex", gap: ".4rem" }}>
                <Button as="a" href={downloadUrl(o.key)} download variant="blue" size="sm">↓</Button>
                <Button variant="danger" size="sm" onClick={() => onDelete(o.key)}>✕</Button>
              </div>
            </Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
