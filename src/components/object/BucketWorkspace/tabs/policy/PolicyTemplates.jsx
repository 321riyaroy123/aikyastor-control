import { Lock, Globe, BookOpen, Upload, Archive } from "lucide-react";
import { C, styles } from "../../../../../styles/theme.js";

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

const ICON_STYLE_BY_COLOR = {
    green: styles.policyTemplateIconGreen,
    blue: styles.policyTemplateIconBlue,
    orange: styles.policyTemplateIconOrange,
    purple: styles.policyTemplateIconPurple,
    red: styles.policyTemplateIconRed,
};

export default function PolicyTemplates({ selectedTemplate, onSelect }) {
    return (
        <div style={styles.workspaceCard}>
            <div style={styles.workspaceCardTitle}>
                <Lock size={18} />
                Policy Templates
            </div>

            <div style={styles.policyTemplateGrid}>
                {templates.map((template) => {
                    const Icon = template.icon;
                    const isSelected = selectedTemplate === template.id;

                    return (
                        <button
                            key={template.id}
                            style={
                                isSelected
                                    ? { ...styles.policyTemplateCard, ...styles.policyTemplateCardSelected }
                                    : styles.policyTemplateCard
                            }
                            onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.borderColor = C.muted;
                            }}
                            onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.borderColor = C.border;
                            }}
                            onClick={() => onSelect?.(template)}
                        >
                            <div style={{ ...styles.policyTemplateIcon, ...ICON_STYLE_BY_COLOR[template.color] }}>
                                <Icon size={26} />
                            </div>

                            <div style={styles.policyTemplateContent}>
                                <h3 style={styles.policyTemplateTitle}>
                                    {template.title}
                                </h3>
                                <p style={styles.policyTemplateDescription}>
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