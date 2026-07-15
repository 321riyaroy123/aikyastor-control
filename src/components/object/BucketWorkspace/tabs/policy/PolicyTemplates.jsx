import { Lock, Globe, BookOpen, Upload, Archive } from "lucide-react";

const templates = [
    {
        id: "private",
        title: "Private Bucket",
        description: "Only the bucket owner can access objects.",
        icon: Lock,
        color: "green"
    },
    {
        id: "public-read",
        title: "Public Read",
        description: "Anyone can download objects.",
        icon: Globe,
        color: "blue"
    },
    {
        id: "read-only",
        title: "Read Only",
        description: "Authenticated users can only read objects.",
        icon: BookOpen,
        color: "orange"
    },
    {
        id: "upload-only",
        title: "Upload Only",
        description: "Allow uploads without download access.",
        icon: Upload,
        color: "purple"
    },
    {
        id: "backup",
        title: "Backup Bucket",
        description: "Optimized for backup storage with restricted deletion.",
        icon: Archive,
        color: "red"
    }
];

export default function PolicyTemplates({ selectedTemplate, onSelect }) {
    return (
        <div className="workspace-card">
            <div className="workspace-card-title">
                <Lock size={18} />
                Policy Templates
            </div>

            <div className="policy-template-grid">
                {templates.map((template) => {
                    const Icon = template.icon;
                    return (
                        <button
                            key={template.id}
                            className={`policy-template-card ${
                                selectedTemplate === template.id
                                    ? "selected"
                                    : ""
                            }`}
                            onClick={() => onSelect?.(template)}
                        >

                            <div className={`policy-template-icon ${template.color}`}>
                                <Icon size={26} />
                            </div>

                            <div className="policy-template-content">
                                <h3>
                                    {template.title}
                                </h3>
                                <p>
                                    {template.description}
                                </p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}