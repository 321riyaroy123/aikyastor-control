import { FileCode2, Copy, Download } from "lucide-react";
import { generateBucketPolicy } from "../../../../../../backend/services/bucketPolicyGenerator";
import { C, styles } from "../../../../../styles/theme.js";

export default function PolicyPreview({ bucket, draft }) {
    const policy = generateBucketPolicy(draft, bucket.name);
    const json = JSON.stringify(policy, null, 4);

    function copyPolicy() {
        navigator.clipboard.writeText(json);
    }

    return (
        <div style={styles.workspaceCard}>
            <div style={styles.workspaceCardTitle}>
                <FileCode2 size={18} />
                Generated Policy
            </div>

            <div style={styles.policyPreviewToolbar}>
                <button style={styles.bucketToolbarBtn} onClick={copyPolicy}>
                    <Copy size={16} />
                    Copy
                </button>

                <button style={{ ...styles.bucketToolbarBtn, opacity: .5, cursor: "not-allowed" }} disabled>
                    <Download size={16} />
                    Export
                </button>
            </div>

            <pre style={styles.policyJson}>
                <code>
                    {json}
                </code>
            </pre>
        </div>
    );
}