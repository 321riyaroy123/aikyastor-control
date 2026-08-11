import { useEffect } from "react";
import { styles } from "../../styles/theme";

export default function Modal({ open, onClose, title, children, width = 440 }) {
  useEffect(() => {
    if (!open) return;
    const h = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div style={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...styles.modal, width }}>
        <div style={styles.modalTitle}>{title}</div>
        {children}
      </div>
    </div>
  );
}
