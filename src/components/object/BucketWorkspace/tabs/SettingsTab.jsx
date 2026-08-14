import { useEffect, useState } from "react";
import { C, styles } from "../../../../styles/theme.js";
import { ObjectAPI } from "../../../../api/objectStorage";

const sections = [
    "General",
    "Versioning",
    "Object Lock",
    "Replication",
    "Encryption",
    "Notifications",
    "Tags",
    "Quotas"
];

export default function SettingsTab({ bucket }) {
    const [activeSection, setActiveSection] =
        useState("General");

    const [encryption, setEncryption] =
        useState(null);

    const [loadingEncryption, setLoadingEncryption] =
        useState(false);

    const [savingEncryption, setSavingEncryption] =
        useState(false);

    const [error, setError] =
        useState("");

    useEffect(() => {
        if (
            activeSection !== "Encryption" ||
            !bucket?.name
        ) {
            return;
        }

        let cancelled = false;

        const loadEncryption = async () => {
            setLoadingEncryption(true);
            setError("");

            try {
                const result =
                    await ObjectAPI.getBucketEncryption(
                        bucket.name
                    );

                if (!cancelled) {
                    setEncryption(result);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err.message ||
                        "Failed to load encryption status."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoadingEncryption(false);
                }
            }
        };

        loadEncryption();

        return () => {
            cancelled = true;
        };
    }, [activeSection, bucket?.name]);

    const enableEncryption = async () => {
        setSavingEncryption(true);
        setError("");

        try {
            const result =
                await ObjectAPI.setBucketEncryption(
                    bucket.name,
                    true,
                    "AES256"
                );

            setEncryption(result);
        } catch (err) {
            setError(
                err.message ||
                "Failed to enable encryption."
            );
        } finally {
            setSavingEncryption(false);
        }
    };

    const disableEncryption = async () => {
        setSavingEncryption(true);
        setError("");

        try {
            const result =
                await ObjectAPI.deleteBucketEncryption(
                    bucket.name
                );

            setEncryption(result);
        } catch (err) {
            setError(
                err.message ||
                "Failed to disable encryption."
            );
        } finally {
            setSavingEncryption(false);
        }
    };

    const renderEncryption = () => {
        if (loadingEncryption) {
            return (
                <div style={styles.settingsPlaceholder}>
                    Loading encryption configuration...
                </div>
            );
        }

        if (!encryption) {
            return (
                <div style={styles.settingsPlaceholder}>
                    Encryption configuration unavailable.
                </div>
            );
        }

        const enabled = encryption.enabled;

        return (
            <div>
                <h3 style={styles.pageHeaderTitle}>
                    Encryption
                </h3>

                <p
                    style={{
                        ...styles.pageHeaderSubtitle,
                        marginBottom: "1.5rem"
                    }}
                >
                    Configure server-side encryption for{" "}
                    <strong style={{ color: C.text }}>
                        {bucket.name}
                    </strong>.
                </p>

                <div
                    style={{
                        padding: "1rem",
                        background: C.surface2,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        marginBottom: "1rem"
                    }}
                >
                    <div
                        style={{
                            fontSize: ".7rem",
                            color: C.muted,
                            textTransform: "uppercase",
                            letterSpacing: 1,
                            fontFamily:
                                "'Space Mono', monospace",
                            marginBottom: ".5rem"
                        }}
                    >
                        Server-Side Encryption
                    </div>

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "1rem"
                        }}
                    >
                        <div>
                            <div
                                style={{
                                    fontSize: "1rem",
                                    fontWeight: 600,
                                    color: C.text
                                }}
                            >
                                {enabled
                                    ? "Encryption Enabled"
                                    : "Encryption Disabled"}
                            </div>

                            <div
                                style={{
                                    fontSize: ".8rem",
                                    color: C.muted,
                                    marginTop: ".25rem"
                                }}
                            >
                                {enabled
                                    ? `SSE-S3 — ${
                                          encryption.type ||
                                          "AES256"
                                      }`
                                    : "Objects are not configured for server-side encryption."}
                            </div>
                        </div>

                        <div
                            style={{
                                padding: ".3rem .6rem",
                                borderRadius: 999,
                                fontSize: ".7rem",
                                fontFamily:
                                    "'Space Mono', monospace",
                                background: enabled
                                    ? "rgba(34,197,94,.12)"
                                    : "rgba(148,163,184,.12)",
                                color: enabled
                                    ? C.green
                                    : C.muted
                            }}
                        >
                            {enabled
                                ? "ENABLED"
                                : "DISABLED"}
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        gap: ".75rem"
                    }}
                >
                    {!enabled ? (
                        <button
                            style={{
                                ...styles.btn,
                                ...styles.btnPrimary
                            }}
                            disabled={savingEncryption}
                            onClick={enableEncryption}
                        >
                            {savingEncryption
                                ? "Enabling..."
                                : "Enable Encryption"}
                        </button>
                    ) : (
                        <button
                            style={{
                                ...styles.btn,
                                ...styles.btnGhost
                            }}
                            disabled={savingEncryption}
                            onClick={disableEncryption}
                        >
                            {savingEncryption
                                ? "Disabling..."
                                : "Disable Encryption"}
                        </button>
                    )}
                </div>

                {error && (
                    <div
                        style={{
                            marginTop: "1rem",
                            padding: ".7rem .8rem",
                            background:
                                "rgba(248,113,113,.1)",
                            border:
                                "1px solid rgba(248,113,113,.3)",
                            borderRadius: 6,
                            color: C.red,
                            fontSize: ".82rem"
                        }}
                    >
                        {error}
                    </div>
                )}
            </div>
        );
    };

    const renderContent = () => {
        if (activeSection === "Encryption") {
            return renderEncryption();
        }

        return (
            <p style={styles.settingsPlaceholder}>
                Select a category from the left to begin.
            </p>
        );
    };

    return (
        <div style={styles.settingsPage}>
            <div style={styles.settingsSidebar}>
                {sections.map((section) => {
                    const isActive =
                        section === activeSection;

                    return (
                        <button
                            key={section}
                            style={
                                isActive
                                    ? {
                                          ...styles.settingsNavItem,
                                          background:
                                              "rgba(249,115,22,.12)",
                                          color: C.accent
                                      }
                                    : styles.settingsNavItem
                            }
                            onMouseEnter={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background =
                                        "rgba(255,255,255,.05)";
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background =
                                        "transparent";
                                }
                            }}
                            onClick={() =>
                                setActiveSection(section)
                            }
                        >
                            <span>{section}</span>
                        </button>
                    );
                })}
            </div>

            <div style={styles.settingsContent}>
                <h2 style={styles.pageHeaderTitle}>
                    Bucket Settings
                </h2>

                <p style={styles.pageHeaderSubtitle}>
                    Configure{" "}
                    <strong style={{ color: C.text }}>
                        {bucket.name}
                    </strong>{" "}
                    and its advanced storage features.
                </p>

                {renderContent()}
            </div>
        </div>
    );
}