import { Shield, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { C, styles } from "../../../../../styles/theme.js";

function validatePolicy(draft) {
    const warnings = [];
    const errors = [];
    const recommendations = [];

    draft.statements.forEach(s => {
        if (s.principal === "*") {
            warnings.push("Policy grants permissions to everyone.");
        }

        if (s.actions.includes("DeleteObject")) {
            warnings.push("Objects can be permanently deleted.");
        }

        if (s.actions.includes("PutBucketPolicy")) {
            warnings.push("Users may modify bucket policies.");
        }

        if (s.actions.length === 0) {
            errors.push("No actions have been selected.");
        }

        if (s.principal === "*" && s.effect === "Allow") {
            recommendations.push("Consider restricting access to authenticated users.");
        }

        if (Object.keys(s.conditions).length === 0) {
            recommendations.push("No conditions are configured. Consider HTTPS or IP restrictions.");
        }
    });

    let risk = "Low";

    if (warnings.length >= 3) {
        risk = "High";
    }
    else if (warnings.length) {
        risk = "Medium";
    }

    return { risk, warnings, errors, recommendations };
}

const RISK_STYLE = {
    Low: styles.policyRiskLow,
    Medium: styles.policyRiskMedium,
    High: styles.policyRiskHigh,
};

export default function PolicyValidator({ bucket, draft }) {
    const result = validatePolicy(draft);

    return (
        <div style={styles.workspaceCard}>
            <div style={styles.workspaceCardTitle}>
                <Shield size={18} />
                Security Analysis
            </div>

            <div style={{ ...styles.policyRisk, ...RISK_STYLE[result.risk] }}>
                {result.risk === "Low" ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
                <strong>Risk Level:</strong>
                {result.risk}
            </div>

            {result.errors.length > 0 && (
                <div style={styles.policyMessageGroup}>
                    <h4 style={styles.policyMessageGroupTitle}>Errors</h4>
                    {result.errors.map(error => (
                        <div key={error} style={{ ...styles.policyMessage, ...styles.policyMessageError }}>
                            <TriangleAlert size={16} />
                            {error}
                        </div>
                    ))}
                </div>
            )}

            {result.warnings.length > 0 && (
                <div style={styles.policyMessageGroup}>
                    <h4 style={styles.policyMessageGroupTitle}>Warnings</h4>
                    {result.warnings.map(warning => (
                        <div key={warning} style={{ ...styles.policyMessage, ...styles.policyMessageWarning }}>
                            <TriangleAlert size={16} />
                            {warning}
                        </div>
                    ))}
                </div>
            )}

            {result.recommendations.length > 0 && (
                <div style={styles.policyMessageGroup}>
                    <h4 style={styles.policyMessageGroupTitle}>Recommendations</h4>
                    {result.recommendations.map(item => (
                        <div key={item} style={{ ...styles.policyMessage, ...styles.policyMessageInfo }}>
                            <ShieldCheck size={16} />
                            {item}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}