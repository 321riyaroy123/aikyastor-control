import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { C, styles } from "../../../../../styles/theme.js";
// Phase 6 FIX: this file lives in tabs/settings/, so the selector (which is
// at src/components/object/LifecyclePolicySelector.jsx) is THREE levels up.
// Phase 5 shipped "../../LifecyclePolicySelector.jsx", which resolved to a
// path that does not exist.
import LifecyclePolicySelector from "../../../LifecyclePolicySelector.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import {
    SettingsSection, InfoGrid, InfoRow, StatusPill, SettingsButton,
    InlineNotice, LoadingRow
} from "./primitives.jsx";

/**
 * Native RGW rule -> one readable table row.
 * Only fields the backend actually writes/reads are interpreted
 * (ID, Status, Filter.Prefix, Expiration.Days). Anything else in a rule
 * is ignored here on purpose rather than guessed at.
 */
function describeRule(rule) {
    const prefix = rule?.Filter?.Prefix ?? rule?.Prefix ?? "";
    const days = rule?.Expiration?.Days;

    return {
        id: rule?.ID || "(unnamed)",
        enabled: rule?.Status === "Enabled",
        status: rule?.Status || "Unknown",
        prefix,
        scope: prefix ? prefix : "Whole bucket",
        expiration: days !== undefined && days !== null ? `${days} day${days === 1 ? "" : "s"}` : "Not set"
    };
}

/**
 * What expiry actually does depends on the bucket's versioning state, so the
 * warning is tailored instead of always claiming "permanently".
 *   Enabled   -> RGW adds a delete marker; older versions are kept
 *   Suspended -> older versions are kept
 *   Disabled  -> objects are removed for good
 *   unknown   -> hedge (info not loaded / not reported)
 */
function expiryWarning(versioning, policyName) {
    const head = (
        <>
            Applying <strong>{policyName}</strong> replaces the bucket's current lifecycle
            configuration.{" "}
        </>
    );

    if (versioning === "Enabled") {
        return (
            <>
                {head}
                This bucket is <strong>versioned</strong>: when an object reaches the retention age, RGW
                adds a delete marker instead of erasing the data. Earlier versions are kept, are not
                expired by rules written from this console, and <strong>continue to use storage</strong>.
            </>
        );
    }

    if (versioning === "Suspended") {
        return (
            <>
                {head}
                Versioning is <strong>suspended</strong> on this bucket: versions created earlier are
                kept, are not expired by rules written from this console, and continue to use storage.
            </>
        );
    }

    if (versioning === "Disabled") {
        return (
            <>
                {head}
                Objects older than the retention period will be deleted by Ceph RGW{" "}
                <strong>permanently and without a recovery step</strong>.
            </>
        );
    }

    return (
        <>
            {head}
            Objects older than the retention period will be expired by Ceph RGW. If the bucket is not
            versioned this is <strong>permanent, with no recovery step</strong>. (The bucket's versioning
            state could not be read.)
        </>
    );
}

export default function LifecycleSection({
    bucket,
    toast,
    bucketInfo,
    bucketLifecycle,
    lifecyclePolicies,
    onLifecyclePoliciesChange,
    onSaveLifecycle
}) {
    const lifecycle = bucketLifecycle?.lifecycle;
    const rules = bucketLifecycle?.configuration?.Rules;

    // `bucketLifecycle` is null until the parent has loaded it (and is reset
    // to null if that load failed), so null = "unknown", not "no policy".
    const loaded = bucketLifecycle !== null && bucketLifecycle !== undefined;
    const hasPolicy = Boolean(lifecycle?.id && lifecycle.id !== "none");
    const currentId = hasPolicy ? lifecycle.id : "none";

    const versioning = bucketInfo?.info?.versioning;

    const [selected, setSelected] = useState(currentId);
    const [saving, setSaving] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [error, setError] = useState("");

    // Follow RGW: whenever the applied policy changes, reset the draft.
    useEffect(() => {
        setSelected(currentId);
    }, [currentId]);

    const dirty = selected !== currentId;
    const selectedPolicy = (lifecyclePolicies || []).find((p) => p.id === selected);

    /**
     * Phase 6: resolves true on success, false on failure.
     *
     * onSaveLifecycle (ObjectStorage.updateLifecycle) now returns a boolean
     * and toasts success/failure itself. `!== false` keeps this working if
     * a caller still passes a handler that resolves undefined.
     */
    async function save(policyId, failureFallback) {
        setSaving(true);
        setError("");

        try {
            return (await onSaveLifecycle(policyId)) !== false;
        } catch (err) {
            setError(err.message || failureFallback);
            return false;
        } finally {
            setSaving(false);
        }
    }

    async function handleApply() {
        await save(selected, "Failed to apply lifecycle policy.");
    }

    async function handleRemove() {
        // Assigning "none" is the existing removal path: the backend's
        // assign_bucket_lifecycle deletes the native RGW lifecycle
        // configuration for policy_id === "none".
        const ok = await save("none", "Failed to remove lifecycle policy.");

        // Keep the dialog open on failure so the error toast can be read
        // and the action retried (same behaviour as Encryption > Disable).
        if (ok) setConfirmRemove(false);
    }

    const statusPill = !loaded
        ? <StatusPill tone="muted">LOADING</StatusPill>
        : hasPolicy
            ? <StatusPill tone="ok">ACTIVE</StatusPill>
            : <StatusPill tone="muted">NONE</StatusPill>;

    return (
        <div style={styles.settingsSectionStack}>
            <div style={styles.settingsHeaderRow}>
                <div>
                    <h3 style={styles.pageHeaderTitle}>Lifecycle</h3>
                    <p style={styles.pageHeaderSubtitle}>
                        Automatic object expiration for{" "}
                        <strong style={{ color: C.text }}>{bucket.name}</strong>.
                    </p>
                </div>
            </div>

            {error && (
                <InlineNotice tone="warn">{error}</InlineNotice>
            )}

            <SettingsSection
                title="Active Policy"
                description="What Ceph RGW is currently enforcing. Read back from RGW after every change."
                status={statusPill}
                footer={
                    hasPolicy && (
                        <SettingsButton
                            variant="danger"
                            disabled={saving}
                            onClick={() => setConfirmRemove(true)}
                        >
                            <Trash2 size={14} />
                            Remove lifecycle policy
                        </SettingsButton>
                    )
                }
            >
                {!loaded ? (
                    <LoadingRow>Reading lifecycle configuration from RGW...</LoadingRow>
                ) : !hasPolicy ? (
                    <InlineNotice>
                        No lifecycle policy is applied. Objects in this bucket are retained until
                        they are deleted manually.
                    </InlineNotice>
                ) : (
                    <InfoGrid>
                        <InfoRow label="Policy" value={lifecycle.name} />
                        <InfoRow label="Description" value={lifecycle.description} />
                        <InfoRow
                            label="Expires after"
                            value={
                                lifecycle.expire_days !== undefined && lifecycle.expire_days !== null
                                    ? `${lifecycle.expire_days} day${lifecycle.expire_days === 1 ? "" : "s"}`
                                    : null
                            }
                            note="Counted from each object's last-modified time"
                        />
                        <InfoRow label="Applies to" value="Whole bucket" note="This console only creates rules with no prefix filter" />
                        <InfoRow label="Type">
                            <StatusPill tone={lifecycle.builtin ? "info" : "muted"}>
                                {lifecycle.native
                                    ? "NATIVE RGW RULE"
                                    : lifecycle.builtin
                                        ? "BUILT-IN"
                                        : "CUSTOM"}
                            </StatusPill>
                            {lifecycle.native && (
                                <span style={styles.settingsInfoNote}>
                                    Created outside this console; not a saved AiKyaStor policy
                                </span>
                            )}
                        </InfoRow>
                    </InfoGrid>
                )}
            </SettingsSection>

            {loaded && Array.isArray(rules) && rules.length > 0 && (
                <SettingsSection
                    title="Native RGW Rules"
                    description="The raw lifecycle rules stored in Ceph RGW. This is the authoritative configuration."
                    status={<StatusPill tone="muted">READ-ONLY</StatusPill>}
                >
                    <div style={styles.settingsRuleWrap}>
                        <table style={styles.settingsRuleTable}>
                            <thead>
                                <tr>
                                    <th style={styles.settingsRuleTh}>Rule ID</th>
                                    <th style={styles.settingsRuleTh}>Status</th>
                                    <th style={styles.settingsRuleTh}>Scope</th>
                                    <th style={styles.settingsRuleTh}>Expiration</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.map((rule, i) => {
                                    const r = describeRule(rule);
                                    return (
                                        <tr key={`${r.id}-${i}`}>
                                            <td style={styles.settingsRuleTd}>
                                                <span style={styles.settingsCode}>{r.id}</span>
                                            </td>
                                            <td style={styles.settingsRuleTd}>
                                                <StatusPill tone={r.enabled ? "ok" : "warn"}>
                                                    {r.status.toUpperCase()}
                                                </StatusPill>
                                            </td>
                                            <td style={styles.settingsRuleTd}>
                                                {r.prefix
                                                    ? <span style={styles.settingsCode}>{r.prefix}</span>
                                                    : r.scope}
                                            </td>
                                            <td style={styles.settingsRuleTd}>{r.expiration}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </SettingsSection>
            )}

            <SettingsSection
                title="Assign Policy"
                description="Choose a policy to apply to this bucket. You can also create or delete custom policies here."
                footer={
                    <>
                        {dirty && (
                            <span style={styles.settingsInfoNote}>Unsaved change</span>
                        )}
                        <SettingsButton
                            variant="primary"
                            disabled={!dirty || saving || !loaded}
                            onClick={handleApply}
                            title={!dirty ? "Select a different policy to apply" : undefined}
                        >
                            {saving ? "Applying..." : "Apply policy"}
                        </SettingsButton>
                    </>
                }
            >
                <LifecyclePolicySelector
                    value={selected}
                    onChange={setSelected}
                    lifecyclePolicies={lifecyclePolicies}
                    onLifecyclePoliciesChange={onLifecyclePoliciesChange}
                    allowCreate
                />

                {dirty && selectedPolicy && selected !== "none" && (
                    <div style={{ marginTop: ".85rem" }}>
                        <InlineNotice tone="warn">
                            {expiryWarning(versioning, selectedPolicy.name)}
                        </InlineNotice>
                    </div>
                )}
            </SettingsSection>

            <InlineNotice>
                <strong>How this works.</strong> Lifecycle is enforced natively by Ceph RGW; this
                console only writes the rule. There is no "run now" action because RGW evaluates rules on
                its own schedule (typically once a day), so expiry is not instant. Only expiration in{" "}
                <strong>whole days</strong> is supported. Transitions, noncurrent-version expiry and
                prefix filters are not configurable from here.
            </InlineNotice>

            <ConfirmDialog
                open={confirmRemove}
                danger
                title="Remove lifecycle policy?"
                confirmLabel="Remove policy"
                busy={saving}
                onConfirm={handleRemove}
                onCancel={() => setConfirmRemove(false)}
            >
                This deletes the lifecycle configuration from{" "}
                <strong style={{ color: C.text }}>{bucket.name}</strong>, so objects will no longer expire
                automatically. It is reversible (you can assign a policy again), but objects already
                deleted by the policy cannot be recovered.
            </ConfirmDialog>
        </div>
    );
}