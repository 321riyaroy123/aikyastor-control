import { Eye, EyeOff, Copy, Trash2 } from "lucide-react";
import { C, styles } from "../../../../../styles/theme.js";

const ACTIONS = [
    "GetObject",
    "PutObject",
    "DeleteObject",
    "ListBucket",
    "GetBucketPolicy",
    "PutBucketPolicy"
];

const RESOURCE_TYPES = [
    { id: "bucket", label: "Bucket" },
    { id: "bucket-objects", label: "All Objects" },
    { id: "prefix", label: "Object Prefix" },
    { id: "object", label: "Specific Object" }
];

function IconButton({ danger, onClick, children }) {
    return (
        <button
            onClick={onClick}
            style={danger ? { ...styles.iconButton, ...styles.iconButtonDanger } : styles.iconButton}
            onMouseEnter={(e) => (e.currentTarget.style.background = danger ? "rgba(248,113,113,.12)" : "rgba(255,255,255,.06)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
            {children}
        </button>
    );
}

export default function PolicyStatement({ statement, onChange, onDuplicate, onDelete, onToggle }) {
    function toggleAction(action) {
        const exists = statement.actions.includes(action);

        onChange({
            actions: exists
                ? statement.actions.filter(a => a !== action)
                : [...statement.actions, action]
        });
    }

    return (
        <div style={styles.policyStatement}>
            {/* Header */}
            <div style={styles.policyStatementHeader}>
                <div>
                    <h3 style={styles.policyStatementTitle}>
                        {statement.sid}
                    </h3>
                    <small style={styles.policyStatementSubtitle}>
                        {statement.description || "No description"}
                    </small>
                </div>

                <div style={styles.policyStatementActions}>
                    <IconButton onClick={onToggle}>
                        {statement.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
                    </IconButton>

                    <IconButton onClick={onDuplicate}>
                        <Copy size={16} />
                    </IconButton>

                    <IconButton danger onClick={onDelete}>
                        <Trash2 size={16} />
                    </IconButton>
                </div>
            </div>

            {/* Description */}
            <div style={styles.policySection}>
                <label style={styles.policySectionLabel}>
                    Description
                </label>

                <input
                    style={styles.formInput}
                    value={statement.description}
                    onChange={(e) => onChange({ description: e.target.value })}
                />
            </div>

            {/* Principal */}
            <div style={styles.policySection}>
                <label style={styles.policySectionLabel}>
                    Principal
                </label>

                <select
                    style={styles.formInput}
                    value={statement.principal}
                    onChange={(e) => onChange({ principal: e.target.value })}
                >
                    <option value="*">Everyone</option>
                    <option value="authenticated">Authenticated Users</option>
                    <option value="owner">Bucket Owner</option>
                </select>
            </div>

            {/* Effect */}
            <div style={styles.policySection}>
                <label style={styles.policySectionLabel}>
                    Effect
                </label>

                <select
                    style={styles.formInput}
                    value={statement.effect}
                    onChange={(e) => onChange({ effect: e.target.value })}
                >
                    <option value="Allow">Allow</option>
                    <option value="Deny">Deny</option>
                </select>
            </div>

            {/* Actions */}
            <div style={styles.policySection}>
                <label style={styles.policySectionLabel}>
                    Actions
                </label>

                <div style={styles.policyActionsGrid}>
                    {ACTIONS.map((action) => (
                        <label key={action} style={styles.policyCheckbox}>
                            <input
                                type="checkbox"
                                style={styles.policyCheckboxInput}
                                checked={statement.actions.includes(action)}
                                onChange={() => toggleAction(action)}
                            />
                            {action}
                        </label>
                    ))}
                </div>
            </div>

            {/* Resources */}
            <div style={styles.policySection}>
                <label style={styles.policySectionLabel}>
                    Resources
                </label>
                {statement.resources.map((resource, index) => (
                    <div key={index} style={styles.policyResourceCard}>
                        <select
                            style={{ ...styles.formInput, width: "auto", minWidth: 160 }}
                            value={resource.type}
                            onChange={(e) => {
                                const resources = [...statement.resources];
                                resources[index] = { ...resources[index], type: e.target.value };
                                onChange({ resources });
                            }}
                        >
                            {RESOURCE_TYPES.map((type) => (
                                <option key={type.id} value={type.id}>
                                    {type.label}
                                </option>
                            ))}
                        </select>

                        {resource.type === "prefix" && (
                            <input
                                type="text"
                                placeholder="images/"
                                style={styles.formInput}
                                value={resource.value}
                                onChange={(e) => {
                                    const resources = [...statement.resources];
                                    resources[index] = { ...resources[index], value: e.target.value };
                                    onChange({ resources });
                                }}
                            />
                        )}
                        {resource.type === "object" && (
                            <input
                                type="text"
                                placeholder="report.pdf"
                                style={styles.formInput}
                                value={resource.value}
                                onChange={(e) => {
                                    const resources = [...statement.resources];
                                    resources[index] = { ...resources[index], value: e.target.value };
                                    onChange({ resources });
                                }}
                            />
                        )}
                    </div>
                ))}

                <button
                    style={styles.bucketToolbarBtn}
                    onClick={() => {
                        onChange({
                            resources: [
                                ...statement.resources,
                                { type: "bucket-objects", value: "" }
                            ]
                        });
                    }}
                >
                    + Add Resource
                </button>
            </div>

            {/* Conditions */}
            <div style={styles.policySection}>
                <label style={styles.policySectionLabel}>
                    Conditions
                </label>
                <div style={styles.policyConditionCard}>
                    {/* HTTPS */}
                    <label style={styles.policyCheckbox}>
                        <input
                            type="checkbox"
                            style={styles.policyCheckboxInput}
                            checked={statement.conditions.secureTransport}
                            onChange={(e) =>
                                onChange({
                                    conditions: {
                                        ...statement.conditions,
                                        secureTransport: e.target.checked
                                    }
                                })
                            }
                        />
                        Require HTTPS (Secure Transport)
                    </label>

                    {/* Source IP */}
                    <div style={styles.policyConditionField}>
                        <label style={styles.policySectionLabel}>
                            Source IP
                        </label>
                        <input
                            type="text"
                            placeholder="192.168.1.0/24"
                            style={styles.formInput}
                            value={statement.conditions.sourceIp}
                            onChange={(e) =>
                                onChange({
                                    conditions: {
                                        ...statement.conditions,
                                        sourceIp: e.target.value
                                    }
                                })
                            }
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}