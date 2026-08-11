import { useState } from "react";
import { PolicyAPI } from "../../api/policies";
import CreatePolicyDialog from "./CreatePolicyDialog";
import { C, styles } from "../../styles/theme";

export default function PolicySelector({ value, onChange, policies = [], onPoliciesChange, allowCreate = true }) {
    const [showCreatePolicy, setShowCreatePolicy] = useState(false);
    const selectedPolicy = policies.find(p => p.id === value) ?? { name: "No Policy", description: "Objects are retained forever." };
    const builtinPolicies = policies.filter(p => p.builtin);
    const customPolicies = policies.filter(p => !p.builtin);

    async function createPolicy(payload) {
        const result = await PolicyAPI.create(payload);

        if (result.error) {
            throw new Error(result.error);
        }

        if (onPoliciesChange){
            onPoliciesChange(prev => [
                ...prev,
                result.policy
            ]);
        }
        onChange(result.policy.id);
        setShowCreatePolicy(false);
    }

    async function deletePolicy(policy) {
        const usage = await PolicyAPI.usage(policy.id);

        if (usage.count > 0) {
            alert(
                `Policy is being used by:\n\n${
                    usage.buckets.join("\n")
                }`
            );
            return;
        }

        if (
            !window.confirm(
                `Delete '${policy.name}'?`
            )
        ) {
            return;
        }

        const result = await PolicyAPI.delete(policy.id);

        if (result.error) {
            throw new Error(result.error);
        }

        onPoliciesChange(prev => prev.filter(p => p.id !== policy.id));

        if (value === policy.id) {
            onChange("none");
        }
    }

    return (
        <>
            <div className="form-group">
                <label style={{ display: "block", fontSize: ".8rem", color: C.muted, marginBottom: ".4rem", fontFamily: "'Space Mono', monospace" }}>
                    Lifecycle Policy
                </label>
                <select style={styles.formInput} value={value} onChange={(e) => onChange(e.target.value)}>
                    <optgroup label="Built-in">
                        {builtinPolicies.map(policy => (
                            <option key={policy.id} value={policy.id}>
                                {policy.name}
                            </option>
                        ))}
                    </optgroup>

                    {
                        customPolicies.length > 0 &&
                        (
                            <optgroup label="Custom">
                                {
                                    customPolicies.map(policy => (
                                        <option key={policy.id} value={policy.id}>
                                            {policy.name}
                                        </option>
                                    ))
                                }
                            </optgroup>
                        )
                    }
                </select>

                <small style={{ color: C.muted, fontSize: ".75rem" }}>
                    {
                        selectedPolicy
                            ? selectedPolicy.description
                            : "No lifecycle policy selected."
                    }
                </small>
            </div>

            {
                allowCreate && (
                    <div style={{ marginTop: 8, marginBottom: 8 }}>
                        <button
                            type="button"
                            onClick={() => setShowCreatePolicy(true)}
                            style={{
                                fontFamily: "inherit",
                                padding: ".2rem .6rem",
                                background: C.accent,
                                border: "none",
                                borderRadius: 8,
                                color: C.bg,
                                cursor: "pointer"
                            }}
                        >
                            + New Lifecycle Policy
                        </button>
                        {
                            customPolicies.length > 0 && (
                                <div style={{ marginTop: "1rem", borderTop: `1px solid ${C.border}`, paddingTop: ".75rem" }}>
                                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: ".72rem", color: C.muted, marginBottom: ".5rem" }}>
                                        CUSTOM POLICIES
                                    </div>
                                    {
                                        customPolicies.map(policy => (
                                            <div key={policy.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: ".45rem 0" }}>
                                                <div>
                                                    <div>{policy.name}</div>
                                                    <div style={{ fontSize: ".75rem", color: C.muted }}>
                                                        {policy.description}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => deletePolicy(policy)}
                                                    style={{
                                                        border: "none",
                                                        background: "transparent",
                                                        color: C.red,
                                                        cursor: "pointer",
                                                        fontSize: "1rem"
                                                    }}
                                                >
                                                    🗑
                                                </button>
                                            </div>
                                        ))
                                    }
                                </div>
                            )
                        }
                    </div>
                )
            }
            <CreatePolicyDialog
                open={showCreatePolicy}
                onClose={() => setShowCreatePolicy(false)}
                onCreate={createPolicy}
            />
        </>
    );
}