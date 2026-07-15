import { FileCode2, Copy, Download } from "lucide-react";
import { generatePolicy } from "../../../services/policyGenerator";

export default function PolicyPreview({ bucket, draft }) {
    const policy = generatePolicy(draft, bucket.name)
    const json = JSON.stringify(policy, null, 4);

    function copyPolicy() {
        navigator.clipboard.writeText(json);
    }

    return (
        <div className="workspace-card">
            <div className="workspace-card-title">
                <FileCode2 size={18} />
                Generated Policy
            </div>

            <div className="policy-preview-toolbar">
                <button
                    className="bucket-toolbar-btn"
                    onClick={copyPolicy}
                >
                    <Copy size={16} />
                    Copy
                </button>

                <button
                    className="bucket-toolbar-btn"
                    disabled
                >
                    <Download size={16} />
                    Export
                </button>
            </div>

            <pre className="policy-json">
                <code>
                    {json}
                </code>
            </pre>
        </div>
    );
}