import { useEffect, useState } from "react";
import PolicyTemplates from "./policy/PolicyTemplates";
import PolicyPreview from "./policy/PolicyPreview";
import PolicyBuilder from "./policy/PolicyBuilder";
import PolicyValidator from "./policy/PolicyValidator";
import { BucketPolicyAPI } from "../../../api/bucketPolicies";
import useBucketPolicy from "../../../hooks/useBucketPolicy";

export default function PoliciesTab({ bucket, toast }) {
    const { loading, saving, selectedTemplate, policyDraft, setPolicyDraft, applyPolicy, deletePolicy, applyTemplate } = useBucketPolicy(bucket, toast);

    return (
        <div className="policies-page">
            {/* Header */}
            <div className="policies-header">
                <div>
                    <h2>
                        Bucket Policies
                    </h2>
                    <p>
                        Configure access permissions for <strong> {bucket.name}</strong>
                    </p>
                </div>
            </div>

            {/* Current Policy */}
            <div className="workspace-card">
                <div className="workspace-card-title">
                    Current Policy
                </div>
                <p>
                    {
                        policyDraft.actions.length === 0
                            ? "No bucket policy has been assigned."
                            : "A bucket policy is currently configured."
                    }
                </p>
            </div>

            {/* Templates */}
            <PolicyTemplates 
                selectedTemplate={selectedTemplate?.id} 
                onSelect={applyTemplate}
            />

            <PolicyBuilder
                draft={policyDraft}
                onChange={setPolicyDraft}
            />

            {/* JSON Preview */}
            <PolicyPreview bucket={bucket} draft={policyDraft} />
            <PolicyValidator bucket={bucket} draft={policyDraft} />

            {/* Security */}
            <div className="workspace-card">
                <div className="workspace-card-title">
                    Security Summary
                </div>

                <div className="policy-security">
                    <div className="security-good">
                        🟢 Public Access Disabled
                    </div>

                    <div className="security-good">
                        🟢 Owner Only Access
                    </div>

                    <div className="security-neutral">
                        ⚪ HTTPS Enforcement Disabled
                    </div>
                </div>
            </div>

            <div className="policy-footer">
                <button
                    className="bucket-toolbar-btn primary"
                    onClick={applyPolicy}
                    disabled={saving}
                >
                    {saving ? "Applying..." : "Apply Policy"}
                </button>
                <button
                    className="bucket-toolbar-btn danger"
                    onClick={deletePolicy}
                    disabled={saving}
                >
                    Remove Policy
                </button>
            </div>
        </div>
    );
}