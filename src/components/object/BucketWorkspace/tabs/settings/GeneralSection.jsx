import { C, styles } from "../../../../../styles/theme.js";
import {
    SettingsSection, InfoGrid, InfoRow, StatusPill,
    InlineError, LoadingRow, RefreshButton, InlineNotice, formatBytes
} from "./primitives.jsx";

const ACL_LABELS = {
    "private": { text: "Private", tone: "ok" },
    "public-read": { text: "Public read", tone: "bad" },
    "public-read-write": { text: "Public read/write", tone: "bad" },
    "authenticated-read": { text: "Authenticated read", tone: "warn" }
};

const OBJECT_LIST_LIMIT = 1000;

function formatDate(value) {
    if (!value) return null;

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export default function GeneralSection({ bucket, objects, bucketInfo }) {
    const { info, loading, refreshing, error, checkedAt, refresh } = bucketInfo;

    // objects is null while the workspace is still loading the list.
    const objectsLoaded = Array.isArray(objects);
    const objectCount = objectsLoaded ? objects.length : null;
    const totalSize = objectsLoaded
        ? objects.reduce((sum, o) => sum + (o.size || 0), 0)
        : null;
    const listTruncated = objectCount === OBJECT_LIST_LIMIT;

    const acl = info?.acl ? (ACL_LABELS[info.acl] || { text: info.acl, tone: "muted" }) : null;

    return (
        <div style={styles.settingsSectionStack}>
            <div style={styles.settingsHeaderRow}>
                <div>
                    <h3 style={styles.pageHeaderTitle}>General</h3>
                    <p style={styles.pageHeaderSubtitle}>
                        Identity and current state of{" "}
                        <strong style={{ color: C.text }}>{bucket.name}</strong>.
                    </p>
                </div>

                <RefreshButton onClick={refresh} busy={refreshing || loading} />
            </div>

            {error && <InlineError>{error}</InlineError>}

            <SettingsSection
                title="Bucket Information"
                description="Read-only. These values are reported by Ceph RGW and cannot be changed after creation from this console."
                status={<StatusPill tone="muted">READ-ONLY</StatusPill>}
            >
                {loading && !info ? (
                    <LoadingRow>Loading bucket information...</LoadingRow>
                ) : (
                    <InfoGrid>
                        <InfoRow label="Name" value={info?.bucket ?? bucket.name} mono />
                        <InfoRow label="Created" value={formatDate(info?.created ?? bucket.created)} />

                        <InfoRow label="Access (ACL)">
                            {acl ? (
                                <>
                                    <StatusPill tone={acl.tone}>{acl.text}</StatusPill>
                                    <span style={styles.settingsInfoNote}>
                                        Derived from the bucket's ACL grants
                                    </span>
                                </>
                            ) : (
                                <span style={styles.settingsInfoNote}>Not available</span>
                            )}
                        </InfoRow>
                    </InfoGrid>
                )}
            </SettingsSection>

            <SettingsSection
                title="Contents"
                description="Summary of the objects currently loaded for this bucket."
                status={<StatusPill tone="muted">READ-ONLY</StatusPill>}
            >
                <InfoGrid>
                    <InfoRow
                        label="Objects"
                        value={objectsLoaded ? objectCount.toLocaleString() : null}
                        note={listTruncated ? `First ${OBJECT_LIST_LIMIT.toLocaleString()} only` : undefined}
                    />
                    <InfoRow
                        label="Size"
                        value={objectsLoaded ? formatBytes(totalSize) : null}
                        note={listTruncated ? "Partial total" : undefined}
                    />
                </InfoGrid>

                {listTruncated && (
                    <div style={{ marginTop: ".85rem" }}>
                        <InlineNotice tone="warn">
                            The object list is capped at {OBJECT_LIST_LIMIT.toLocaleString()} entries by the
                            backend, so the count and size above may under-report a larger bucket.
                        </InlineNotice>
                    </div>
                )}
            </SettingsSection>

            <SettingsSection
                title="Endpoint"
                description="How S3 clients reach this bucket. Configured on the AiKyaStor CONTROL server, not per bucket."
                status={<StatusPill tone="muted">SERVER CONFIG</StatusPill>}
            >
                {loading && !info ? (
                    <LoadingRow>Loading endpoint details...</LoadingRow>
                ) : (
                    <InfoGrid>
                        <InfoRow label="Region" value={info?.region} mono />
                        <InfoRow label="S3 endpoint" value={info?.endpoint} mono />
                        <InfoRow
                            label="HTTPS endpoint"
                            value={info?.secure_endpoint}
                            mono
                            note="Used for encrypted buckets"
                        />
                    </InfoGrid>
                )}
            </SettingsSection>

            {checkedAt && (
                <div style={{ ...styles.settingsInfoNote, textAlign: "right" }}>
                    Last refreshed {checkedAt.toLocaleTimeString()}
                </div>
            )}
        </div>
    );
}