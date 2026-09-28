import { C, styles } from "../../../../../styles/theme.js";
import {
    SettingsSection, InfoGrid, InfoRow, StatusPill,
    InlineError, InlineNotice, LoadingRow, RefreshButton, UnavailableCard
} from "./primitives.jsx";

const VERSIONING_STATE = {
    Enabled: { tone: "ok", text: "ENABLED" },
    Suspended: { tone: "warn", text: "SUSPENDED" },
    Disabled: { tone: "muted", text: "DISABLED" }
};

/**
 * Object Lock configuration as returned verbatim by get_object_lock_configuration:
 *   { ObjectLockEnabled: "Enabled", Rule?: { DefaultRetention: { Mode, Days|Years } } }
 * Only these fields are interpreted.
 */
function describeObjectLock(lock) {
    const retention = lock?.Rule?.DefaultRetention;

    if (!retention) return { mode: null, period: null };

    const period = retention.Days
        ? `${retention.Days} day${retention.Days === 1 ? "" : "s"}`
        : retention.Years
            ? `${retention.Years} year${retention.Years === 1 ? "" : "s"}`
            : null;

    return { mode: retention.Mode || null, period };
}

export default function VersioningSection({ bucket, bucketInfo }) {
    const { info, loading, refreshing, error, refresh } = bucketInfo;

    const versioning = info?.versioning;
    const versioningKnown = versioning !== undefined && versioning !== null;
    const versioningView = VERSIONING_STATE[versioning] || { tone: "muted", text: String(versioning ?? "UNKNOWN").toUpperCase() };

    const lockKnown = info && info.object_locking !== undefined && info.object_locking !== null;
    const lockEnabled = Boolean(info?.object_locking);
    const lock = describeObjectLock(info?.object_lock);

    return (
        <div style={styles.settingsSectionStack}>
            <div style={styles.settingsHeaderRow}>
                <div>
                    <h3 style={styles.pageHeaderTitle}>Versioning & Data Protection</h3>
                    <p style={styles.pageHeaderSubtitle}>
                        Overwrite and deletion protection for{" "}
                        <strong style={{ color: C.text }}>{bucket.name}</strong>.
                    </p>
                </div>

                <RefreshButton onClick={refresh} busy={refreshing || loading} />
            </div>

            {error && <InlineError>{error}</InlineError>}

            <InlineNotice>
                <strong>These settings are fixed at bucket creation.</strong> The backend only enables
                versioning and object lock while creating a bucket; it has no operation to change
                either afterwards. They are shown here as read-only status, not as switches.
            </InlineNotice>

            <SettingsSection
                title="Versioning"
                description="Keeps every version of an object instead of overwriting it."
                status={
                    loading && !info
                        ? <StatusPill tone="muted">LOADING</StatusPill>
                        : <StatusPill tone={versioningKnown ? versioningView.tone : "muted"}>
                            {versioningKnown ? versioningView.text : "UNKNOWN"}
                        </StatusPill>
                }
            >
                {loading && !info ? (
                    <LoadingRow>Reading versioning state from RGW...</LoadingRow>
                ) : !versioningKnown ? (
                    <UnavailableCard title="Versioning" reason="Unknown">
                        RGW did not report a versioning state for this bucket, so nothing is shown.
                        Use Refresh to try again.
                    </UnavailableCard>
                ) : (
                    <>
                        <InfoGrid>
                            <InfoRow label="State">
                                <StatusPill tone={versioningView.tone}>{versioningView.text}</StatusPill>
                            </InfoRow>
                        </InfoGrid>

                        <div style={{ marginTop: ".85rem", display: "flex", flexDirection: "column", gap: ".6rem" }}>
                            {versioning === "Enabled" && (
                                <InlineNotice tone="warn">
                                    Every overwrite and delete keeps the previous data as a noncurrent
                                    version, which <strong>continues to use storage</strong>. This console
                                    does not list or expire noncurrent versions, so usage can grow without
                                    a visible cause. Deleting the bucket does remove all versions.
                                </InlineNotice>
                            )}

                            {versioning === "Suspended" && (
                                <InlineNotice>
                                    Versioning is suspended: new writes no longer create versions, but
                                    versions created earlier still exist and still use storage.
                                </InlineNotice>
                            )}

                            {versioning === "Disabled" && (
                                <InlineNotice>
                                    Overwriting or deleting an object replaces or removes it directly; no
                                    previous copy is kept.
                                </InlineNotice>
                            )}
                        </div>
                    </>
                )}
            </SettingsSection>

            <SettingsSection
                title="Object Lock (WORM)"
                description="Write-once-read-many protection that can block deletion or overwrite for a retention period."
                status={
                    loading && !info
                        ? <StatusPill tone="muted">LOADING</StatusPill>
                        : lockKnown
                            ? <StatusPill tone={lockEnabled ? "ok" : "muted"}>{lockEnabled ? "ENABLED" : "DISABLED"}</StatusPill>
                            : <StatusPill tone="muted">UNKNOWN</StatusPill>
                }
            >
                {loading && !info ? (
                    <LoadingRow>Reading object lock configuration from RGW...</LoadingRow>
                ) : !lockKnown ? (
                    <UnavailableCard title="Object Lock" reason="Unknown">
                        RGW did not report an object lock state for this bucket.
                    </UnavailableCard>
                ) : (
                    <>
                        <InfoGrid>
                            <InfoRow label="State">
                                <StatusPill tone={lockEnabled ? "ok" : "muted"}>{lockEnabled ? "ENABLED" : "DISABLED"}</StatusPill>
                            </InfoRow>

                            {lockEnabled && (
                                <>
                                    <InfoRow
                                        label="Default retention"
                                        value={lock.mode && lock.period ? `${lock.mode}, ${lock.period}` : null}
                                        note={!lock.mode ? "No default retention rule set" : undefined}
                                    />
                                </>
                            )}
                        </InfoGrid>

                        <div style={{ marginTop: ".85rem", display: "flex", flexDirection: "column", gap: ".6rem" }}>
                            {lockEnabled ? (
                                <InlineNotice>
                                    Object lock cannot be disabled once enabled. Per-object retention and
                                    legal holds are applied by S3 clients and are not managed from this console.
                                </InlineNotice>
                            ) : (
                                <InlineNotice>
                                    Object lock was not enabled when this bucket was created, and it cannot
                                    be turned on afterwards.
                                </InlineNotice>
                            )}
                        </div>
                    </>
                )}
            </SettingsSection>

            <UnavailableCard title="Deleting Object Versions" reason="Not exposed">
                There is no operation to list, restore or purge individual object versions from this
                console. The only version cleanup the backend performs is internal: it removes all
                versions when a bucket is deleted or when a lifecycle-engine deletion runs.
            </UnavailableCard>
        </div>
    );
}