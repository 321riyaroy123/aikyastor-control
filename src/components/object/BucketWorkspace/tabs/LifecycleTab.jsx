import { useEffect, useState } from "react";
import LifecyclePolicySelector from "../../LifecyclePolicySelector.jsx";
import { C, styles } from "../../../../styles/theme.js";

export default function LifecycleTab({ bucket, bucketLifecycle, lifecyclePolicies, onLifecyclePoliciesChange, onSaveLifecycle }) {
    const lifecycle = bucketLifecycle?.lifecycle;
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
        console.log("LifecycleTab.applyPolicy firing", selectedPolicy);
        await onSaveLifecycle(selectedPolicy);
    }

    return (
        <div style={styles.lifecyclePage}>
            <div>
                <h2 style={styles.pageHeaderTitle}>
                    Lifecycle Management
                </h2>
                <p style={styles.pageHeaderSubtitle}>
                    Configure automatic object expiration for <strong style={{ color: C.text }}>{bucket.name}</strong>
                </p>
            </div>

            {/* Current Policy */}
            <div style={styles.lifecycleCard}>
                <div style={styles.lifecycleCardTitle}>
                    Current Policy
                </div>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, color: C.text }}>
                    {lifecycle?.policy_name || "No Lifecycle Policy"}
                </h3>
                <p style={{ marginTop: ".4rem", fontSize: ".85rem", color: C.muted }}>
                    {
                        lifecycle?.description ||
                        "Objects are retained forever."
                    }
                </p>
            </div>

            {/* Assign */}
            <div style={styles.lifecycleCard}>
                <div style={styles.lifecycleCardTitle}>
                    Assign Lifecycle Policy
                </div>

                <PolicySelector
                    value={selectedPolicy}
                    onChange={setSelectedPolicy}
                    lifecyclePolicies={lifecyclePolicies}
                    onLifecyclePoliciesChange={onLifecyclePoliciesChange}
                    allowCreate={true}
                />

                <button
                    style={{ ...styles.bucketToolbarBtn, ...styles.bucketToolbarBtnPrimary, marginTop: "1rem" }}
                    onClick={applyPolicy}
                >
                    Apply Policy
                </button>
            </div>

            {/* Info */}
            <div style={styles.lifecycleInfoCard}>
                <strong style={{ color: C.blue, fontSize: ".85rem" }}>
                    How Lifecycle Policies Work
                </strong>
                <p style={{ marginTop: ".5rem", fontSize: ".85rem", color: C.muted, lineHeight: 1.55 }}>
                    Lifecycle policies automatically remove objects
                    after the configured retention period.
                    The same policy can be reused across multiple
                    buckets.
                </p>
            </div>
        </div>
    );
}