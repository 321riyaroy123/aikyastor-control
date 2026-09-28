import { useEffect, useRef, useState } from "react";
import { C, styles } from "../../../../../styles/theme.js";
import ConfirmDialog from "./ConfirmDialog.jsx";
import useBucketPolicyStatus from "./useBucketPolicyStatus.js";
import useBucketEncryption from "./useBucketEncryption.js";
import { analyzePolicy } from "./analyzePolicy.js";
import {
    SettingsSection, StatusPill, SettingsButton,
    InlineNotice, RefreshButton, UnavailableCard
} from "./primitives.jsx";

const OBJECT_LIST_LIMIT = 1000;

const REVERSIBILITY = {
    reversible: { tone: "info", text: "REVERSIBLE" },
    partial: { tone: "warn", text: "PARTLY REVERSIBLE" },
    irreversible: { tone: "bad", text: "IRREVERSIBLE" }
};

/**
 * One destructive action.
 *
 * `unavailableReason`: when set, the button is disabled AND the reason is
 * rendered as visible text under the description. A disabled button is
 * never shown without an explanation.
 * `locked`: another destructive action is currently running, so this one
 * is temporarily disabled (no reason text needed; it's momentary).
 */
function DangerRow({
    first, last, title, reversibility, description, route,
    unavailableReason, actionLabel, busyLabel, busy, locked, onAction, children
}) {
    const rev = REVERSIBILITY[reversibility];
    const disabled = Boolean(unavailableReason) || locked;

    return (
        <div
            style={{
                ...styles.settingsDangerRow,
                ...(first ? styles.settingsDangerRowFirst : {}),
                ...(last ? styles.settingsDangerRowLast : {})
            }}
        >
            <div style={{ minWidth: 0 }}>
                <div style={styles.settingsDangerTitle}>
                    {title}
                    <StatusPill tone={rev.tone}>{rev.text}</StatusPill>
                </div>

                <div style={styles.settingsDangerDesc}>{description}</div>

                {children}

                <div style={styles.settingsDangerMeta}>
                    <span style={styles.settingsDangerMetaLabel}>API</span>
                    <span style={styles.settingsCode}>{route}</span>
                </div>

                {unavailableReason && (
                    <div style={styles.settingsDangerReason}>{unavailableReason}</div>
                )}
            </div>

            <div style={styles.settingsDangerAction}>
                <SettingsButton
                    variant="danger"
                    disabled={disabled}
                    onClick={onAction}
                >
                    {busy ? busyLabel : actionLabel}
                </SettingsButton>
            </div>
        </div>
    );
}

/**
 * Danger Zone. Only operations that really exist in the backend:
 *
 *   1. Remove bucket policy    BucketPolicyAPI.remove (via useBucketPolicyStatus.remove)
 *   2. Remove lifecycle policy onSaveLifecycle("none") -> PUT .../lifecycle
 *   3. Disable encryption      ObjectAPI.deleteBucketEncryption (via useBucketEncryption.disable)
 *   4. Delete bucket           onDeleteBucket -> ObjectAPI.deleteBucket
 *
 * Nothing runs until the user confirms in a dialog. Each dialog stays open
 * if the action fails, so the error can be read and the action retried.
 *
 * Toast ownership (to avoid double toasts):
 *   - policy removal + encryption disable: toasted HERE
 *   - lifecycle removal + bucket delete: toasted by ObjectStorage.jsx
 *     (updateLifecycle / deleteBucketConfirmed), which also return a boolean
 *     that this component uses to decide whether to close the dialog.
 *
 * Applicability comes from live state (policy re-read, encryption re-read,
 * lifecycle prop), never from assumptions.
 */
export default function DangerSection({
    bucket,
    objects,
    toast,
    bucketInfo,
    bucketLifecycle,
    onSaveLifecycle,
    onDeleteBucket,
    onEncryptionChanged
}) {
    const policyStatus = useBucketPolicyStatus(bucket.name);
    const enc = useBucketEncryption(bucket.name, { onChanged: onEncryptionChanged });

    // Which confirmation dialog is open: "policy" | "lifecycle" | "encryption" | "bucket" | null
    const [dialog, setDialog] = useState(null);
    // Which action is currently executing (same values). Locks all buttons.
    const [running, setRunning] = useState(null);

    // Delete-bucket success unmounts this whole section (the workspace
    // closes), so guard state updates that would run afterwards.
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const locked = running !== null;

    // ── Applicability: bucket policy ─────────────────────────────────────
    const { policy, loading: policyLoading, error: policyError } = policyStatus;
    const policyAnalysis = analyzePolicy(policy);
    const statementCount = policy?.statements?.length ?? 0;
    const hasDeny = (policy?.statements || []).some(
        (s) => s.enabled !== false && s.effect === "Deny"
    );

    let policyReason = null;
    if (policyLoading && !policy) {
        policyReason = "Checking which policy is applied...";
    } else if (policyError) {
        policyReason = `Could not read the bucket policy (${policyError}), so removal is unavailable until its status can be read. Use Refresh state.`;
    } else if (statementCount === 0) {
        policyReason = "Not applicable: no bucket policy is applied to this bucket.";
    }

    // ── Applicability: lifecycle ─────────────────────────────────────────
    // bucketLifecycle is null until the parent loads it (and is reset to
    // null if that load failed), so null means "unknown", not "none".
    const lifecycleLoaded = bucketLifecycle !== null && bucketLifecycle !== undefined;
    const lifecycle = bucketLifecycle?.lifecycle;
    const nativeRules = bucketLifecycle?.configuration?.Rules;
    const ruleCount = Array.isArray(nativeRules) ? nativeRules.length : 0;
    const hasNamedPolicy = Boolean(lifecycle?.id && lifecycle.id !== "none");
    // Native rules can exist without mapping to a named policy (e.g. only
    // disabled rules), and removal is still meaningful for those.
    const hasLifecycle = hasNamedPolicy || ruleCount > 0;

    let lifecycleReason = null;
    if (typeof onSaveLifecycle !== "function") {
        lifecycleReason = "Unavailable: lifecycle changes are not wired into this view.";
    } else if (!lifecycleLoaded) {
        lifecycleReason = "The lifecycle configuration has not been loaded (it may still be loading, or the read failed), so removal is unavailable.";
    } else if (!hasLifecycle) {
        lifecycleReason = "Not applicable: no lifecycle policy is applied to this bucket.";
    }

    const lifecycleLabel = hasNamedPolicy
        ? `"${lifecycle.name}"`
        : `${ruleCount} native rule${ruleCount === 1 ? "" : "s"}`;

    // ── Applicability: encryption ────────────────────────────────────────
    const { encryption, loading: encLoading, error: encError } = enc;
    const encEnabled = Boolean(encryption?.enabled);

    let encryptionReason = null;
    if (encLoading && !encryption) {
        encryptionReason = "Checking encryption status...";
    } else if (!encryption) {
        encryptionReason = `Could not read the encryption status${encError ? ` (${encError})` : ""}, so this action is unavailable. Use Refresh state.`;
    } else if (!encEnabled) {
        encryptionReason = "Not applicable: server-side encryption is not enabled on this bucket.";
    }

    // ── Applicability: delete bucket ─────────────────────────────────────
    const deleteReason = typeof onDeleteBucket !== "function"
        ? "Unavailable: bucket deletion is not wired into this view."
        : null;

    const objectsLoaded = Array.isArray(objects);
    const objectCount = objectsLoaded ? objects.length : 0;
    const truncated = objectsLoaded && objectCount === OBJECT_LIST_LIMIT;
    const contentsText = !objectsLoaded
        ? "an unknown number of objects"
        : objectCount === 0
            ? "no listed objects"
            : `${truncated ? "at least " : ""}${objectCount.toLocaleString()} listed object${objectCount === 1 ? "" : "s"}`;

    const info = bucketInfo?.info;
    const versioned = info?.versioning === "Enabled" || info?.versioning === "Suspended";
    const objectLocked = Boolean(info?.object_locking);

    // ── Handlers ─────────────────────────────────────────────────────────
    function closeDialog() {
        if (!locked) setDialog(null);
    }

    async function confirmRemovePolicy() {
        setRunning("policy");
        const result = await policyStatus.remove();
        if (!mounted.current) return;
        setRunning(null);

        if (result.ok) {
            toast?.(result.message || `Bucket policy removed from '${bucket.name}'.`, "success");
            setDialog(null);
        } else {
            toast?.(result.error, "error");
        }
    }

    async function confirmRemoveLifecycle() {
        setRunning("lifecycle");
        let ok = false;

        try {
            // ObjectStorage.updateLifecycle toasts its own success/error,
            // re-reads RGW, and resolves true/false. "none" is the existing
            // removal path (assign_bucket_lifecycle deletes the native config).
            ok = (await onSaveLifecycle("none")) !== false;
        } catch (err) {
            toast?.(err.message || "Failed to remove lifecycle policy.", "error");
        }

        if (!mounted.current) return;
        setRunning(null);
        if (ok) setDialog(null);
    }

    async function confirmDisableEncryption() {
        setRunning("encryption");
        const result = await enc.disable();
        if (!mounted.current) return;
        setRunning(null);

        if (result.ok) {
            toast?.(result.message || `Server-side encryption disabled for '${bucket.name}'.`, "success");
            setDialog(null);
        } else {
            toast?.(result.error, "error");
        }
    }

    async function confirmDeleteBucket() {
        setRunning("bucket");
        let ok = false;

        try {
            // ObjectStorage.deleteBucketConfirmed toasts, closes the
            // workspace and reloads the bucket list on success. On success
            // this component is unmounted, hence the mounted guard below.
            ok = (await onDeleteBucket(bucket.name)) !== false;
        } catch (err) {
            toast?.(err.message || "Failed to delete bucket.", "error");
        }

        if (!mounted.current) return;
        setRunning(null);
        if (ok) setDialog(null);
    }

    function refreshAll() {
        policyStatus.refresh();
        enc.refresh();
        bucketInfo?.refresh?.();
    }

    const refreshing = policyStatus.refreshing || enc.refreshing || Boolean(bucketInfo?.refreshing);

    return (
        <div style={styles.settingsSectionStack}>
            <div style={styles.settingsHeaderRow}>
                <div>
                    <h3 style={{ ...styles.pageHeaderTitle, color: C.red }}>Danger Zone</h3>
                    <p style={styles.pageHeaderSubtitle}>
                        Destructive operations for{" "}
                        <strong style={{ color: C.text }}>{bucket.name}</strong>.
                    </p>
                </div>

                <RefreshButton onClick={refreshAll} busy={refreshing} label="Refresh state" />
            </div>

            <InlineNotice tone="warn">
                Nothing here runs until you confirm in a dialog. Operations that do not apply to the
                bucket's current state show the reason instead of an unexplained disabled button.
            </InlineNotice>

            <SettingsSection
                danger
                title="Destructive Operations"
                description="Each operation uses an API that already exists in the backend. State shown is read back from Ceph RGW."
                status={<StatusPill tone="bad">DESTRUCTIVE</StatusPill>}
            >
                <div style={styles.settingsDangerList}>
                    <DangerRow
                        first
                        title="Remove bucket policy"
                        reversibility="partial"
                        description={
                            statementCount > 0
                                ? `Detaches the access policy (${statementCount} statement${statementCount === 1 ? "" : "s"}) from this bucket. Access then falls back to the bucket ACL and the owner's permissions.`
                                : "Detaches the access policy from this bucket. Access then falls back to the bucket ACL and the owner's permissions."
                        }
                        route="DELETE /object/buckets/{bucket}/policy"
                        unavailableReason={policyReason}
                        actionLabel="Remove policy"
                        busyLabel="Removing..."
                        busy={running === "policy"}
                        locked={locked}
                        onAction={() => setDialog("policy")}
                    >
                        <div style={styles.settingsDangerMeta}>
                            <span style={styles.settingsInfoNote}>
                                Reversible only by rebuilding the policy: this console keeps no copy of it.
                            </span>
                        </div>
                    </DangerRow>

                    <DangerRow
                        title="Remove lifecycle policy"
                        reversibility="reversible"
                        description="Deletes the lifecycle configuration from RGW, so objects stop expiring automatically. You can assign a policy again at any time."
                        route="PUT /object/buckets/{bucket}/lifecycle  (lifecycle: none)"
                        unavailableReason={lifecycleReason}
                        actionLabel="Remove lifecycle"
                        busyLabel="Removing..."
                        busy={running === "lifecycle"}
                        locked={locked}
                        onAction={() => setDialog("lifecycle")}
                    >
                        <div style={styles.settingsDangerMeta}>
                            <span style={styles.settingsInfoNote}>
                                Objects already deleted by the policy cannot be recovered by re-assigning it.
                            </span>
                        </div>
                    </DangerRow>

                    <DangerRow
                        title="Disable server-side encryption"
                        reversibility="reversible"
                        description="Removes the default SSE-S3 (AES256) configuration. New uploads are stored unencrypted; objects already stored stay encrypted and readable."
                        route="DELETE /object/buckets/{bucket}/encryption"
                        unavailableReason={encryptionReason}
                        actionLabel="Disable encryption"
                        busyLabel="Disabling..."
                        busy={running === "encryption"}
                        locked={locked}
                        onAction={() => setDialog("encryption")}
                    >
                        <div style={styles.settingsDangerMeta}>
                            <span style={styles.settingsInfoNote}>
                                Objects written while it is disabled stay unencrypted even if you re-enable it.
                            </span>
                        </div>
                    </DangerRow>

                    <DangerRow
                        last
                        title="Delete bucket"
                        reversibility="irreversible"
                        description={`Permanently deletes this bucket, every object in it, and every object version and delete marker. This bucket currently lists ${contentsText}.`}
                        route="DELETE /object/buckets/{bucket}"
                        unavailableReason={deleteReason}
                        actionLabel="Delete bucket"
                        busyLabel="Deleting..."
                        busy={running === "bucket"}
                        locked={locked}
                        onAction={() => setDialog("bucket")}
                    >
                        <div style={styles.settingsDangerMeta}>
                            <span style={styles.settingsInfoNote}>
                                Requires typing the bucket name. There is no recycle bin or undo.
                            </span>
                        </div>
                    </DangerRow>
                </div>
            </SettingsSection>

            <UnavailableCard title="Other Destructive Operations" reason="Not exposed">
                The backend has no standalone operation to delete object versions, and no operation to
                reset replication configuration. Object versions are only removed as part of deleting
                the whole bucket, and replication is configured for the realm rather than per bucket
                (see the Replication section).
            </UnavailableCard>

            {/* ── Confirmations ─────────────────────────────────────────── */}

            <ConfirmDialog
                open={dialog === "policy"}
                danger
                title="Remove bucket policy?"
                confirmLabel="Remove policy"
                busy={running === "policy"}
                onConfirm={confirmRemovePolicy}
                onCancel={closeDialog}
            >
                This detaches the bucket policy from{" "}
                <strong style={{ color: C.text }}>{bucket.name}</strong>. Access then falls back to the
                bucket ACL and the owner's permissions.
                <ul style={styles.settingsBulletList}>
                    {policyAnalysis.state === "public" && (
                        <li>Anyone relying on this policy's public access will lose it.</li>
                    )}
                    {hasDeny && (
                        <li>The policy contains Deny statements. Removing them can widen access.</li>
                    )}
                    <li>
                        This console keeps no copy of the policy. To restore it you must rebuild it in
                        Security &amp; Access (use Copy in its Generated Policy preview first if you may
                        want it back).
                    </li>
                </ul>
            </ConfirmDialog>

            <ConfirmDialog
                open={dialog === "lifecycle"}
                danger
                title="Remove lifecycle policy?"
                confirmLabel="Remove lifecycle"
                busy={running === "lifecycle"}
                onConfirm={confirmRemoveLifecycle}
                onCancel={closeDialog}
            >
                This deletes {hasLifecycle ? lifecycleLabel : "the lifecycle configuration"} from{" "}
                <strong style={{ color: C.text }}>{bucket.name}</strong>, so objects will no longer expire
                automatically. It is reversible (you can assign a policy again), but objects already
                deleted by the policy cannot be recovered.
            </ConfirmDialog>

            <ConfirmDialog
                open={dialog === "encryption"}
                danger
                title="Disable server-side encryption?"
                confirmLabel="Disable encryption"
                busy={running === "encryption"}
                onConfirm={confirmDisableEncryption}
                onCancel={closeDialog}
            >
                Objects uploaded to <strong style={{ color: C.text }}>{bucket.name}</strong> after this
                will no longer be encrypted at rest. Objects already stored stay encrypted and remain
                readable. You can re-enable encryption at any time; this action is reversible, but any
                objects written while it is disabled will stay unencrypted.
            </ConfirmDialog>

            <ConfirmDialog
                open={dialog === "bucket"}
                danger
                requireText={bucket.name}
                title="Delete this bucket permanently?"
                confirmLabel="Delete bucket"
                busy={running === "bucket"}
                onConfirm={confirmDeleteBucket}
                onCancel={closeDialog}
            >
                This will permanently delete <strong style={{ color: C.text }}>{bucket.name}</strong>,
                including {contentsText} and{" "}
                <strong style={{ color: C.text }}>every stored object version and delete marker</strong>.
                It cannot be undone.
                <ul style={styles.settingsBulletList}>
                    {truncated && (
                        <li>
                            The object list is capped at {OBJECT_LIST_LIMIT.toLocaleString()} entries, so
                            the bucket may contain more than shown.
                        </li>
                    )}
                    {versioned && (
                        <li>Versioning is on or suspended: all noncurrent versions are deleted too.</li>
                    )}
                    {objectLocked && (
                        <li>
                            Object lock is enabled. If any version is still under retention, RGW will
                            refuse to delete it and the operation will fail. Versions deleted before that
                            point stay deleted.
                        </li>
                    )}
                    <li>
                        Large buckets are deleted one version at a time and can take a while. Keep this
                        page open. If the operation fails partway, objects already removed are not
                        restored.
                    </li>
                    <li>
                        The delete does not touch copies previously synced to Vault Backup. If multisite
                        replication is active, RGW will typically propagate the deletion to the secondary
                        zone.
                    </li>
                </ul>
            </ConfirmDialog>
        </div>
    );
}