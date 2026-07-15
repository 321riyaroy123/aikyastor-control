import { useEffect, useState } from "react";
import PolicySelector from "../../PolicySelector";

export default function LifecycleTab({ bucket, bucketPolicy, policies, onPoliciesChange, onSaveLifecycle }) {
    const lifecycle = bucketPolicy?.lifecycle;
    const [selectedPolicy, setSelectedPolicy] = useState("none");

    useEffect(() => {
        if (lifecycle?.id) {
            setSelectedPolicy(lifecycle.id);
        }
        else {
            setSelectedPolicy("none");
        }
    }, [lifecycle]);

    async function applyPolicy() {
        await onSaveLifecycle(selectedPolicy);
    }

    return (
        <div className="lifecycle-page">
            <div className="lifecycle-overview">
                <div>
                    <h2>
                        Lifecycle Management
                    </h2>
                    <p>
                        Configure automatic object expiration for <strong> {bucket.name}</strong>
                    </p>
                </div>
            </div>

            {/* Current Policy */}
            <div className="lifecycle-card">
                <div className="lifecycle-card-title">
                    Current Policy
                </div>
                <h3>
                    {lifecycle?.policy_name || "No Lifecycle Policy"}
                </h3>
                <p>
                    {
                        lifecycle?.description ||
                        "Objects are retained forever."
                    }
                </p>
            </div>

            {/* Assign */}
            <div className="lifecycle-card">
                <div className="lifecycle-card-title">
                    Assign Lifecycle Policy
                </div>

                <PolicySelector
                    value={selectedPolicy}
                    onChange={setSelectedPolicy}
                    policies={policies}
                    onPoliciesChange={onPoliciesChange}
                    allowCreate={true}
                />

                <button className="bucket-toolbar-btn primary" onClick={applyPolicy}>
                    Apply Policy
                </button>
            </div>

            {/* Info */}
            <div className="lifecycle-info-card">
                <div>
                    <strong>
                        How Lifecycle Policies Work
                    </strong>
                    <p>
                        Lifecycle policies automatically remove objects
                        after the configured retention period.
                        The same policy can be reused across multiple
                        buckets.
                    </p>
                </div>
            </div>
        </div>
    );
}