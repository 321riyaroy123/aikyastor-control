import { RefreshCw, TriangleAlert, Info, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { C, styles } from "../../../../../styles/theme.js";

const PILL_TONES = {
    ok: styles.settingsPillOk,
    warn: styles.settingsPillWarn,
    bad: styles.settingsPillBad,
    info: styles.settingsPillInfo,
    muted: styles.settingsPillMuted
};

/**
 * Compact status indicator. tone: ok | warn | bad | info | muted
 */
export function StatusPill({ tone = "muted", children }) {
    return (
        <span style={{ ...styles.settingsPill, ...(PILL_TONES[tone] || PILL_TONES.muted) }}>
            <span aria-hidden="true">●</span>
            {children}
        </span>
    );
}

/**
 * A titled card used for every settings feature. `status` renders on the
 * right of the header (usually a StatusPill); `footer` renders an action bar.
 */
export function SettingsSection({ title, description, status, actions, footer, danger = false, children }) {
    return (
        <section style={{ ...styles.settingsSection, ...(danger ? styles.settingsSectionDanger : {}) }}>
            <div style={styles.settingsSectionHead}>
                <div>
                    <div style={{ ...styles.settingsSectionTitle, ...(danger ? { color: C.red } : {}) }}>
                        {title}
                    </div>
                    {description && (
                        <div style={styles.settingsSectionDesc}>{description}</div>
                    )}
                </div>

                {(status || actions) && (
                    <div style={styles.settingsSectionHeadRight}>
                        {actions}
                        {status}
                    </div>
                )}
            </div>

            <div style={styles.settingsSectionBody}>{children}</div>

            {footer && <div style={styles.settingsSectionFoot}>{footer}</div>}
        </section>
    );
}

/**
 * Button used across settings sections.
 * variant: default | primary | danger | dangerSolid
 * Disabled buttons should always be accompanied by visible text explaining
 * why (this component doesn't enforce that; callers do).
 */
export function SettingsButton({ variant = "default", disabled = false, onClick, children, title, type = "button" }) {
    const variantStyle = {
        default: {},
        primary: styles.settingsBtnPrimary,
        danger: styles.settingsBtnDanger,
        dangerSolid: styles.settingsBtnDangerSolid
    }[variant] || {};

    return (
        <button
            type={type}
            title={title}
            disabled={disabled}
            onClick={onClick}
            style={{
                ...styles.settingsBtn,
                ...variantStyle,
                ...(disabled ? styles.settingsBtnDisabled : {})
            }}
            onMouseEnter={(e) => {
                if (disabled) return;
                if (variant === "default") e.currentTarget.style.borderColor = C.accent;
                else e.currentTarget.style.filter = "brightness(1.1)";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "";
                e.currentTarget.style.filter = "";
            }}
        >
            {children}
        </button>
    );
}

/**
 * Full-width status banner. tone: ok | warn | bad | neutral
 */
export function Banner({ tone = "neutral", title, children }) {
    const toneStyle = {
        ok: styles.settingsBannerOk,
        warn: styles.settingsBannerWarn,
        bad: styles.settingsBannerBad,
        neutral: styles.settingsBannerNeutral
    }[tone];

    const Icon = { ok: ShieldCheck, warn: ShieldAlert, bad: ShieldAlert, neutral: ShieldQuestion }[tone];
    const color = { ok: C.green, warn: C.yellow, bad: C.red, neutral: C.muted }[tone];

    return (
        <div style={{ ...styles.settingsBanner, ...toneStyle }}>
            <Icon size={20} color={color} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={styles.settingsBannerTitle}>{title}</div>
                {children && <div style={styles.settingsBannerText}>{children}</div>}
            </div>
        </div>
    );
}

/**
 * Read-only label/value rows. Deliberately renders NO input-like styling so
 * information can never be mistaken for a control.
 */
export function InfoGrid({ children }) {
    return <div style={styles.settingsInfoGrid}>{children}</div>;
}

export function InfoRow({ label, value, mono = false, note, children }) {
    const empty = value === undefined || value === null || value === "";

    return (
        <>
            <div style={styles.settingsInfoLabel}>{label}</div>
            <div style={styles.settingsInfoValue}>
                {children ?? (
                    empty
                        ? <span style={styles.settingsInfoNote}>Not available</span>
                        : <span style={mono ? styles.settingsInfoMono : undefined}>{value}</span>
                )}
                {note && <span style={styles.settingsInfoNote}>{note}</span>}
            </div>
        </>
    );
}

/**
 * Explains WHY a feature has no controls. Used instead of disabled inputs.
 */
export function UnavailableCard({ title, children, reason = "Not exposed" }) {
    return (
        <div style={styles.settingsUnavailable}>
            <div style={styles.settingsUnavailableHead}>
                <div style={styles.settingsSectionTitle}>{title}</div>
                <StatusPill tone="muted">{reason}</StatusPill>
            </div>
            <div style={styles.settingsUnavailableText}>{children}</div>
        </div>
    );
}

export function InlineError({ children }) {
    return (
        <div style={styles.settingsInlineError} role="alert">
            <TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>{children}</div>
        </div>
    );
}

export function InlineNotice({ tone = "info", children }) {
    const style = tone === "warn" ? styles.settingsInlineWarn : styles.settingsInlineNotice;
    const Icon = tone === "warn" ? TriangleAlert : Info;

    return (
        <div style={style}>
            <Icon size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>{children}</div>
        </div>
    );
}

export function LoadingRow({ children = "Loading..." }) {
    return <div style={styles.settingsLoadingRow}>{children}</div>;
}

export function RefreshButton({ onClick, busy = false, label = "Refresh" }) {
    return (
        <button
            type="button"
            style={{ ...styles.settingsRefreshBtn, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
            onClick={onClick}
            disabled={busy}
            onMouseEnter={(e) => { if (!busy) e.currentTarget.style.borderColor = C.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; }}
        >
            <RefreshCw size={13} />
            {busy ? "Refreshing..." : label}
        </button>
    );
}

export function formatBytes(bytes = 0) {
    if (!bytes) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let index = 0;

    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index++;
    }

    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}