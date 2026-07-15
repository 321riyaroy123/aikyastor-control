import { Shield, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";

function validatePolicy(draft) {
    const warnings = [];
    const errors = [];
    const recommendations = [];

    // Principal
    if (draft.principal === "*") {
        warnings.push("Policy grants permissions to everyone.");
    }

    // Actions
    if (draft.actions.includes("DeleteObject")) {
        warnings.push(
            "Objects can be permanently deleted."
        );
    }

    if (draft.actions.includes("PutBucketPolicy")) {
        warnings.push(
            "Users may modify bucket policies."
        );
    }

    if (draft.actions.length === 0) {
        errors.push(
            "No actions have been selected."
        );
    }

    // Recommendations
    if (draft.principal === "*" && draft.effect === "Allow") {
        recommendations.push(
            "Consider restricting access to authenticated users."
        );
    }

    if (Object.keys(draft.conditions).length === 0) {
        recommendations.push(
            "No conditions are configured. Consider HTTPS or IP restrictions."
        );
    }

    let risk = "Low";

    if (warnings.length >= 3) {
        risk = "High";
    }
    else if (warnings.length) {
        risk = "Medium";
    }

    return { risk, warnings, errors, recommendations };
}

export default function PolicyValidator({ bucket, draft }) {
    const policy = generatePolicy(draft, bucket.name);
    validatePolicy(policy);

    return (
        <div className="workspace-card">
            <div className="workspace-card-title">
                <Shield size={18} />
                Security Analysis
            </div>

            <div className={`policy-risk ${result.risk.toLowerCase()}`}>
                {result.risk === "Low" &&
                    <ShieldCheck size={18} />
                }

                {result.risk !== "Low" &&
                    <ShieldAlert size={18} />
                }

                <strong>
                    Risk Level:
                </strong>

                {result.risk}
            </div>

            {
                result.errors.length > 0 &&
                <div className="policy-errors">
                    <h4>
                        Errors
                    </h4>
                    {
                        result.errors.map(error=>(
                            <div key={error} className="policy-message error">
                                <TriangleAlert size={16} />
                                {error}
                            </div>
                        ))
                    }
                </div>
            }

            {
                result.warnings.length > 0 &&
                <div className="policy-warnings">
                    <h4>
                        Warnings
                    </h4>
                    {
                        result.warnings.map(warning=>(
                            <div key={warning} className="policy-message warning">
                                <TriangleAlert size={16} />
                                {warning}
                            </div>
                        ))
                    }
                </div>
            }

            {
                result.recommendations.length > 0 &&
                <div className="policy-recommendations">
                    <h4>
                        Recommendations
                    </h4>

                    {
                        result.recommendations.map(item=>(
                            <div key={item} className="policy-message info">
                                <ShieldCheck size={16} />
                                {item}
                            </div>
                        ))
                    }
                </div>
            }
        </div>
    );
}