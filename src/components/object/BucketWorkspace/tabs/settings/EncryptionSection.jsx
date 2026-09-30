import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { C, styles } from "../../../../../styles/theme.js";
import useBucketEncryption from "./useBucketEncryption.js";
import useVaultStatus from "./useVaultStatus.js";
import usePqcStatus from "../../../../../hooks/usePqcStatus";
import PqcBadge from "../../../../security/PqcBadge";
import ConfirmDialog from "./ConfirmDialog.jsx";
import {
    SettingsSection, InfoGrid, InfoRow, StatusPill, SettingsButton,
    InlineError, InlineNotice, LoadingRow, RefreshButton, UnavailableCard
} from "./primitives.jsx";

function formatTtl(seconds) {
    if (seconds === undefined || seconds === null) return null;
    if (seconds === 0) return "No expiry";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    return `${(seconds / 3600).toFixed(1)} h`;
}

function VaultCard({ vault }) {
    const { status, loading, refreshing, error, checkedAt, refresh } = vault;

    const health = status?.health;
    const transit = status?.transit;
    const token = status?.token;

    const healthy = Boolean(health?.reachable && health?.initialized && !health?.sealed);
    const transitOk = Boolean(transit?.mounted);

    let overallTone = "muted";
    let overallText = "UNKNOWN";

    if (error) {
        overallTone = "bad";
        overallText = "UNAVAILABLE";
    } else if (health) {
        overallTone = healthy && transitOk ? "ok" : "bad";
        overallText = healthy && transitOk ? "READY" : "DEGRADED";
    }

    return (
        <SettingsSection
            title="Key Management: HashiCorp Vault"
            description="SSE-S3 keys are held by HashiCorp Vault's transit engine. This is a read-only health view; it cannot change seal state, tokens or keys."
            status={<StatusPill tone={overallTone}>{overallText}</StatusPill>}
            actions={<RefreshButton onClick={refresh} busy={refreshing || loading} label="Check now" />}
        >
            {error ? (
                <InlineError>
                    Could not read Vault status: {error}
                </InlineError>
            ) : loading && !status ? (
                <LoadingRow>Checking HashiCorp Vault...</LoadingRow>
            ) : (
                <InfoGrid>
                    <InfoRow label="Connection">
                        <StatusPill tone={health?.reachable ? "ok" : "bad"}>
                            {health?.reachable ? "REACHABLE" : "UNREACHABLE"}
                        </StatusPill>
                    </InfoRow>

                    <InfoRow label="Seal state">
                        {health?.reachable ? (
                            <StatusPill tone={health?.sealed ? "bad" : "ok"}>
                                {health?.sealed ? "SEALED" : "UNSEALED"}
                            </StatusPill>
                        ) : (
                            <span style={styles.settingsInfoNote}>Not available</span>
                        )}
                    </InfoRow>

                    <InfoRow
                        label="Initialized"
                        value={health?.reachable ? (health?.initialized ? "Yes" : "No") : null}
                    />

                    <InfoRow label="Version" value={health?.version} mono />

                    <InfoRow label="Transit engine">
                        <StatusPill tone={transitOk ? "ok" : "bad"}>
                            {transitOk ? "MOUNTED" : "NOT MOUNTED"}
                        </StatusPill>
                        {!transitOk && (
                            <span style={styles.settingsInfoNote}>
                                Required for SSE-S3
                            </span>
                        )}
                    </InfoRow>

                    <InfoRow label="Dashboard token">
                        <StatusPill tone={token?.valid ? "ok" : "bad"}>
                            {token?.valid ? "VALID" : "INVALID"}
                        </StatusPill>
                        <span style={styles.settingsInfoNote}>
                            The dashboard's own read-only token, not RGW's
                        </span>
                    </InfoRow>

                    <InfoRow
                        label="Token policies"
                        value={Array.isArray(token?.policies) ? token.policies.join(", ") : null}
                        mono
                    />

                    <InfoRow label="Token TTL" value={formatTtl(token?.ttl_seconds)} />
                </InfoGrid>
            )}

            {checkedAt && (
                <div style={{ ...styles.settingsInfoNote, marginTop: ".75rem", textAlign: "right" }}>
                    Checked at {checkedAt.toLocaleTimeString()}
                </div>
            )}
        </SettingsSection>
    );
}

/**
 * Phase 6: new optional prop `onEncryptionChanged`, fired after a successful
 * enable/disable so BucketWorkspace can refresh the header's encryption
 * badge (which otherwise only loads when the bucket changes).
 */
export default function EncryptionSection({ bucket, toast, onEncryptionChanged }) {
    const enc = useBucketEncryption(bucket.name, { onChanged: onEncryptionChanged });
    const vault = useVaultStatus();
    const pqc = usePqcStatus();
    const sseConnection = pqc.status?.connections?.find(c => c.id === "backend_rgw_sse");

    const [confirmDisable, setConfirmDisable] = useState(false);

    const { encryption, loading, refreshing, saving, error } = enc;
    const enabled = Boolean(encryption?.enabled);

    // Warn (don't block) when Vault looks unhealthy. RGW is the authority
    // on whether enabling actually works, so we can't prove it will fail.
    const vaultHealth = vault.status?.health;
    const vaultProblem = vault.unavailable
        || (vaultHealth && (!vaultHealth.reachable || vaultHealth.sealed))
        || (vault.status && !vault.status.transit?.mounted);

    async function handleEnable() {
        const result = await enc.enable();

        if (result.ok) {
            toast?.(result.message || `Encryption enabled for '${bucket.name}'.`, "success");
        } else {
            toast?.(result.error, "error");
        }
    }

    async function handleDisable() {
        const result = await enc.disable();

        if (result.ok) {
            toast?.(result.message || `Encryption disabled for '${bucket.name}'.`, "success");
            setConfirmDisable(false);
        } else {
            toast?.(result.error, "error");
        }
    }

    function refreshAll() {
        enc.refresh();
        vault.refresh();
    }

    return (
        <div style={styles.settingsSectionStack}>
            <div style={styles.settingsHeaderRow}>
                <div>
                    <h3 style={styles.pageHeaderTitle}>Encryption</h3>
                    <p style={styles.pageHeaderSubtitle}>
                        Server-side encryption at rest for{" "}
                        <strong style={{ color: C.text }}>{bucket.name}</strong>.
                    </p>
                </div>

                <RefreshButton onClick={refreshAll} busy={refreshing || vault.refreshing} label="Refresh all" />
            </div>

            {error && <InlineError>{error}</InlineError>}

            <SettingsSection
                title="Server-Side Encryption (SSE-S3)"
                description="Objects are encrypted at rest by Ceph RGW using keys managed through Vault."
                status={
                    loading && !encryption
                        ? <StatusPill tone="muted">LOADING</StatusPill>
                        : error && !encryption
                            ? <StatusPill tone="bad">ERROR</StatusPill>
                            : <StatusPill tone={enabled ? "ok" : "muted"}>{enabled ? "ENABLED" : "DISABLED"}</StatusPill>
                }
                footer={
                    encryption && (
                        enabled ? (
                            <SettingsButton
                                variant="danger"
                                disabled={saving}
                                onClick={() => setConfirmDisable(true)}
                            >
                                <LockOpen size={14} />
                                Disable encryption
                            </SettingsButton>
                        ) : (
                            <SettingsButton
                                variant="primary"
                                disabled={saving}
                                onClick={handleEnable}
                            >
                                <Lock size={14} />
                                {saving ? "Enabling..." : "Enable encryption"}
                            </SettingsButton>
                        )
                    )
                }
            >
                {loading && !encryption ? (
                    <LoadingRow>Reading encryption configuration from RGW...</LoadingRow>
                ) : !encryption ? (
                    <UnavailableCard title="Encryption" reason="Unavailable">
                        The encryption configuration could not be read, so no controls are shown.
                        Use Refresh all to try again.
                    </UnavailableCard>
                ) : (
                    <>
                        <InfoGrid>
                            <InfoRow label="Status">
                                <StatusPill tone={enabled ? "ok" : "muted"}>{enabled ? "ENABLED" : "DISABLED"}</StatusPill>
                            </InfoRow>

                            <InfoRow
                                label="Algorithm"
                                value={enabled ? (encryption.type || "AES256") : null}
                                mono
                                note={enabled ? "SSE-S3" : undefined}
                            />

                            <InfoRow
                                label="Key management"
                                value="HashiCorp Vault (transit)"
                            />

                            <InfoRow
                                label="In transit (RGW HTTPS)"
                                note={pqc.error || sseConnection?.note}
                            >
                                <PqcBadge
                                    status={pqc.status?.status}
                                    group={pqc.status?.negotiated_group}
                                    simulated={pqc.status?.simulated}
                                />
                            </InfoRow>
                        </InfoGrid>

                        <div style={{ marginTop: ".9rem", display: "flex", flexDirection: "column", gap: ".6rem" }}>
                            <InlineNotice>
                                Only <strong>AES256 (SSE-S3)</strong> is supported, so there is no
                                algorithm selector. Encryption applies to objects written{" "}
                                <strong>after</strong> it is enabled; existing objects are not
                                re-encrypted, and disabling it does not decrypt objects already stored.
                            </InlineNotice>

                            {!enabled && vaultProblem && (
                                <InlineNotice tone="warn">
                                    HashiCorp Vault looks unhealthy (see below). Enabling encryption will
                                    likely fail until Vault is reachable, unsealed, and its transit engine
                                    is mounted.
                                </InlineNotice>
                            )}
                        </div>
                    </>
                )}
            </SettingsSection>

            <VaultCard vault={vault} />

            <ConfirmDialog
                open={confirmDisable}
                danger
                title="Disable server-side encryption?"
                confirmLabel="Disable encryption"
                busy={saving}
                onConfirm={handleDisable}
                onCancel={() => setConfirmDisable(false)}
            >
                Objects uploaded to <strong style={{ color: C.text }}>{bucket.name}</strong> after this
                will no longer be encrypted at rest. Objects already stored stay encrypted and remain
                readable. You can re-enable encryption at any time; this action is reversible, but any
                objects written while it is disabled will stay unencrypted.
            </ConfirmDialog>
        </div>
    );
}