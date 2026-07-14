import { styles } from "../../styles/theme";
import Button from "../common/Button";

// Shared by both ObjectStorage and FileStorage upload flows, so it lives here
// rather than being duplicated into both feature folders.
export default function VaultPopup({ file, onDecide, onClose }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modal, width: 400, textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: ".75rem" }}>🔒</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: "1rem", marginBottom: ".4rem" }}>Save to Vault?</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: ".78rem", color: "var(--accent)", marginBottom: ".5rem", wordBreak: "break-all" }}>{file.name}</div>
        <div style={{ fontSize: ".82rem", color: "var(--muted)", marginBottom: "1.75rem", lineHeight: 1.5 }}>
          Do you also want to back up this file to the Vault (cold storage) after uploading to Ceph?
        </div>
        <div style={{ display: "flex", gap: ".75rem", justifyContent: "center" }}>
          <Button variant="ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => onDecide(false)}>Ceph Only</Button>
          <Button variant="vault" style={{ flex: 1, justifyContent: "center" }} onClick={() => onDecide(true)}>🔒 + Vault</Button>
        </div>
      </div>
    </div>
  );
}
