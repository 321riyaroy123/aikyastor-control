import PolicyTemplates from "./policy/PolicyTemplates";
import PolicyPreview from "./policy/PolicyPreview";
import PolicyBuilder from "./policy/PolicyBuilder";
import PolicyValidator from "./policy/PolicyValidator";
import useBucketPolicy from "../../../../hooks/useBucketPolicy";
import { C, styles } from "../../../../styles/theme.js";

export default function PoliciesTab({ bucket, toast }) {
    const {
        loading,
        saving,
        selectedTemplate,
        policyDraft,
        applyPolicy,
        deletePolicy,
        applyTemplate,

        addStatement,
        updateStatement,
        removeStatement,
        duplicateStatement,
        toggleStatement,
    } = useBucketPolicy(bucket, toast);

    const hasPolicy =
        (policyDraft?.statements?.length ?? 0) > 0;

    if (loading) {
        return (
            <div style={styles.workspaceCard}>
                Loading bucket policy...
            </div>
        );
    }

    return (
        <div style={styles.policiesPage}>
            {/* Header */}
            <div>
                <h2 style={styles.pageHeaderTitle}>
                    Bucket Policies
                </h2>

                <p style={styles.pageHeaderSubtitle}>
                    Configure access permissions for{" "}
                    <strong style={{ color: C.text }}>
                        {bucket.name}
                    </strong>
                </p>
            </div>

            {/* Current Policy */}
            <div style={styles.workspaceCard}>
                <div style={styles.workspaceCardTitle}>
                    Current Policy
                </div>

                <p
                    style={{
                        fontSize: ".85rem",
                        color: C.muted,
                    }}
                >
                    {hasPolicy
                        ? "A bucket policy is currently configured."
                        : "No bucket policy has been assigned."}
                </p>
            </div>

            {/* Templates */}
            <PolicyTemplates
                selectedTemplate={selectedTemplate?.id}
                onSelect={applyTemplate}
            />

            {/* Builder */}
            <PolicyBuilder
                draft={policyDraft}
                addStatement={addStatement}
                updateStatement={updateStatement}
                removeStatement={removeStatement}
                duplicateStatement={duplicateStatement}
                toggleStatement={toggleStatement}
            />

            {/* Preview */}
            <PolicyPreview
                bucket={bucket}
                draft={policyDraft}
            />

            {/* Validation */}
            <PolicyValidator
                bucket={bucket}
                draft={policyDraft}
            />

            {/* Security Summary */}
            <div style={styles.workspaceCard}>
                <div style={styles.workspaceCardTitle}>
                    Security Summary
                </div>

                <div style={styles.policySecurity}>
                    <div
                        style={{
                            ...styles.policySecurityRow,
                            color: C.green,
                        }}
                    >
                        🟢 Public Access Disabled
                    </div>

                    <div
                        style={{
                            ...styles.policySecurityRow,
                            color: C.green,
                        }}
                    >
                        🟢 Owner Only Access
                    </div>

                    <div
                        style={{
                            ...styles.policySecurityRow,
                            color: C.muted,
                        }}
                    >
                        ⚪ HTTPS Enforcement Disabled
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div style={styles.policyFooter}>
                <button
                    style={{
                        ...styles.bucketToolbarBtn,
                        ...styles.bucketToolbarBtnPrimary,
                        opacity: saving ? 0.6 : 1,
                    }}
                    onClick={applyPolicy}
                    disabled={saving}
                >
                    {saving ? "Applying..." : "Apply Policy"}
                </button>

                <button
                    style={{
                        ...styles.bucketToolbarBtn,
                        ...styles.bucketToolbarBtnDanger,
                        opacity: saving ? 0.6 : 1,
                    }}
                    onClick={deletePolicy}
                    disabled={saving}
                >
                    Remove Policy
                </button>
            </div>
        </div>
    );
}