import { C, styles } from "../../../../../styles/theme.js";
import BucketPolicyTab from "../BucketPolicyTab.jsx";
import useBucketPolicyStatus from "./useBucketPolicyStatus.js";
import { analyzePolicy } from "./analyzePolicy.js";
import {
    SettingsSection, InfoGrid, InfoRow, StatusPill, Banner,
    InlineError, InlineNotice, LoadingRow, RefreshButton
} from "./primitives.jsx";

const ACL_LABELS = {
    "private": { text: "Private", tone: "ok" },
    "public-read": { text: "Public read", tone: "bad" },
    "public-read-write": { text: "Public read/write", tone: "bad" },
    "authenticated-read": { text: "Authenticated read", tone: "warn" }
};

const LEVEL_TO_TONE = { ok: "ok", warn: "warn", bad: "bad", neutral: "neutral" };
const LEVEL_TO_PILL = { ok: "ok", warn: "warn", bad: "bad", neutral: "muted", info: "info" };

export default function SecuritySection({ bucket, toast, bucketInfo }) {
    const policyStatus = useBucketPolicyStatus(bucket.name);
    const { policy, loading, refreshing, error, refresh } = policyStatus;

    const analysis = analyzePolicy(policy);
    const info = bucketInfo.info;
    const acl = info?.acl ? (ACL_LABELS[info.acl] || { text: info.acl, tone: "muted" }) : null;

    // The ACL is a separate access path from the policy, so flag it too.
    const aclIsPublic = info?.acl === "public-read" || info?.acl === "public-read-write";

    return (
        <div style={styles.settingsSectionStack}>
            <div style={styles.settingsHeaderRow}>
                <div>
                    <h3 style={styles.pageHeaderTitle}>Security & Access</h3>
                    <p style={styles.pageHeaderSubtitle}>
                        Who can access{" "}
                        <strong style={{ color: C.text }}>{bucket.name}</strong>{" "}
                        and what they can do.
                    </p>
                </div>

                <RefreshButton onClick={refresh} busy={refreshing || loading} label="Refresh status" />
            </div>

            {error && <InlineError>{error}</InlineError>}

            {loading && !policy && !error ? (
                <LoadingRow>Reading the applied bucket policy from RGW...</LoadingRow>
            ) : !error && (
                <Banner tone={LEVEL_TO_TONE[analysis.level]} title={analysis.headline}>
                    {analysis.findings.length > 0 ? (
                        <ul style={styles.settingsBulletList}>
                            {analysis.findings.map((f, i) => (
                                <li key={i}>{f.text}</li>
                            ))}
                        </ul>
                    ) : analysis.state === "none" ? (
                        "Access is governed only by the bucket ACL and the owner's permissions."
                    ) : null}
                </Banner>
            )}

            <SettingsSection
                title="Access Overview"
                description="What is currently applied in RGW. The policy and the ACL are two separate access mechanisms."
                status={<StatusPill tone="muted">READ-ONLY</StatusPill>}
            >
                <InfoGrid>
                    <InfoRow label="Bucket policy">
                        <StatusPill tone={LEVEL_TO_PILL[analysis.level]}>
                            {analysis.state === "none" ? "NONE" : analysis.state.toUpperCase()}
                        </StatusPill>
                    </InfoRow>

                    <InfoRow
                        label="Statements"
                        value={policy ? String(analysis.summary.statements) : "0"}
                    />

                    <InfoRow
                        label="Actions granted"
                        value={analysis.summary.actions.join(", ") || null}
                        mono
                    />

                    <InfoRow
                        label="Principals"
                        value={analysis.summary.principals.map((p) => (p === "*" ? "* (everyone)" : p)).join(", ") || null}
                        mono
                    />

                    <InfoRow label="Bucket ACL">
                        {acl ? (
                            <>
                                <StatusPill tone={acl.tone}>{acl.text}</StatusPill>
                                <span style={styles.settingsInfoNote}>Set at creation; not editable here</span>
                            </>
                        ) : (
                            <span style={styles.settingsInfoNote}>Not available</span>
                        )}
                    </InfoRow>
                </InfoGrid>

                {aclIsPublic && (
                    <div style={{ marginTop: ".85rem" }}>
                        <InlineNotice tone="warn">
                            This bucket's ACL grants public access independently of the policy above.
                            Removing or editing the policy does not change the ACL, and there is no
                            control in this console to change an ACL after the bucket is created.
                        </InlineNotice>
                    </div>
                )}
            </SettingsSection>

            <InlineNotice>
                <strong>About policy principals.</strong> Bucket policies can grant access to{" "}
                <strong>Everyone</strong> or to specific principals. "Authenticated Users" and "Bucket
                Owner" cannot be expressed in an S3 bucket policy, so they are no longer offered. To make a
                bucket private, use <strong>Remove Policy</strong> (the S3 default is owner-only access).
            </InlineNotice>

            {/* Full editor: templates, statement builder, JSON preview, validator, apply/remove. */}
            <BucketPolicyTab
                bucket={bucket}
                toast={toast}
                onPolicyChanged={refresh}
            />
        </div>
    );
}