import { useEffect, useState } from "react";
import { styles } from "../../../../../styles/theme.js";
import { SettingsButton } from "./primitives.jsx";

const TYPED_INPUT_ID = "settings-confirm-typed-input";

/**
 * Explicit-confirmation dialog.
 *
 *  - danger:        red styling and a solid red confirm button
 *  - requireText:   user must type this exact string before confirm enables
 *                   (use for irreversible actions like deleting a bucket)
 *  - busy:          disables both buttons while the action is running
 *
 * onConfirm may be async; the dialog does not close itself. The caller
 * closes it (set `open` false) so a failed action can keep it open.
 *
 * Phase 6 polish: the typed-confirmation label is now associated with its
 * input, and pressing Enter in that input confirms (only when confirm is
 * enabled), so the keyboard path matches the mouse path.
 */
export default function ConfirmDialog({
    open,
    title,
    danger = false,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    requireText,
    busy = false,
    onConfirm,
    onCancel,
    children
}) {
    const [typed, setTyped] = useState("");

    // Reset the typed text every time the dialog opens.
    useEffect(() => {
        if (open) setTyped("");
    }, [open]);

    // Escape cancels (unless an action is running).
    useEffect(() => {
        if (!open) return undefined;

        const onKey = (e) => {
            if (e.key === "Escape" && !busy) onCancel?.();
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, busy, onCancel]);

    if (!open) return null;

    const textOk = !requireText || typed === requireText;
    const canConfirm = textOk && !busy;

    return (
        <div
            style={styles.settingsConfirmOverlay}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && !busy) onCancel?.();
            }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div style={{ ...styles.settingsConfirmBox, ...(danger ? styles.settingsConfirmBoxDanger : {}) }}>
                <div style={styles.settingsConfirmTitle}>{title}</div>

                <div style={styles.settingsConfirmBody}>{children}</div>

                {requireText && (
                    <div>
                        <label htmlFor={TYPED_INPUT_ID} style={styles.settingsFieldLabel}>
                            Type <span style={{ color: "#e2e8f0" }}>{requireText}</span> to confirm
                        </label>
                        <input
                            id={TYPED_INPUT_ID}
                            style={styles.formInput}
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && canConfirm) {
                                    e.preventDefault();
                                    onConfirm?.();
                                }
                            }}
                            autoFocus
                            autoComplete="off"
                            spellCheck={false}
                            disabled={busy}
                        />
                    </div>
                )}

                <div style={styles.settingsConfirmActions}>
                    <SettingsButton onClick={onCancel} disabled={busy}>
                        {cancelLabel}
                    </SettingsButton>

                    <SettingsButton
                        variant={danger ? "dangerSolid" : "primary"}
                        onClick={onConfirm}
                        disabled={!canConfirm}
                    >
                        {busy ? "Working..." : confirmLabel}
                    </SettingsButton>
                </div>
            </div>
        </div>
    );
}