import { ArrowLeft, Database, Shield, Clock3, Lock } from "lucide-react";
import { C, styles } from "../../../styles/theme.js";

function formatBytes(bytes = 0) {
    if (!bytes) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];

    let value = bytes;
    let index = 0;

    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index++;
    }

    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function BucketHeader({ bucket, objects = [], bucketPolicy, onBack }) {
    const safeObjects = objects ?? [];
    const totalSize = safeObjects.reduce((sum, object) => sum + (object.size || 0), 0);

    // Placeholder until bucket quotas are implemented.
    const usagePercent = 35;

    return (
        <div style={styles.bucketHeader}>
            {/* Navigation */}
            <div style={styles.bucketHeaderTop}>
                <button
                    style={styles.bucketBackBtn}
                    onMouseEnter={(e) => (e.currentTarget.style.color = C.text)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
                    onClick={onBack}
                >
                    <ArrowLeft size={18} />
                    Object Storage
                </button>
            </div>

            {/* Bucket Identity */}
            <div style={styles.bucketHeaderMain}>
                <div style={styles.bucketTitleSection}>
                    <div style={styles.bucketIcon}>
                        🪣
                    </div>

                    <div>
                        <h2 style={styles.bucketTitle}>
                            {bucket.name}
                        </h2>
                        <p style={styles.bucketSubtitle}>
                            Object Storage Bucket
                        </p>
                    </div>

                </div>

                {/* Summary Cards */}
                <div style={styles.bucketInfoGrid}>
                    <div style={styles.bucketInfoCard}>
                        <div>
                            <span style={styles.bucketInfoLabel}>
                                Owner
                            </span>
                            <strong style={styles.bucketInfoValue}>
                                {bucket.owner || "admin"}
                            </strong>
                        </div>
                    </div>

                    <div style={styles.bucketInfoCard}>
                        <div>
                            <span style={styles.bucketInfoLabel}>
                                Created
                            </span>
                            <strong style={styles.bucketInfoValue}>
                                {bucket.created
                                    ? new Date(
                                          bucket.created
                                      ).toLocaleDateString()
                                    : "-"}
                            </strong>
                        </div>
                    </div>

                    <div style={styles.bucketInfoCard}>
                        <div>
                            <span style={styles.bucketInfoLabel}>
                                Objects
                            </span>
                            <strong style={styles.bucketInfoValue}>
                                {safeObjects.length}
                            </strong>
                        </div>
                    </div>

                    <div style={styles.bucketInfoCard}>
                        <div>
                            <span style={styles.bucketInfoLabel}>
                                Storage Used
                            </span>
                            <strong style={styles.bucketInfoValue}>
                                {formatBytes(totalSize)}
                            </strong>
                        </div>
                    </div>
                </div>
            </div>

            {/* Storage Usage */}
            <div style={styles.bucketStorage}>
                <div style={styles.bucketStorageHeader}>
                    <span>
                        Storage Usage
                    </span>
                    <strong style={{ color: C.text }}>
                        {formatBytes(totalSize)}
                    </strong>
                </div>

                <div style={styles.bucketProgress}>
                    <div
                        style={{
                            ...styles.bucketProgressFill,
                            width: `${usagePercent}%`
                        }}
                    />
                </div>

                <span style={styles.bucketStorageNote}>
                    Unlimited quota configured
                </span>
            </div>

            {/* Status Badges */}
            <div style={styles.bucketStatusRow}>
                <span style={{ ...styles.bucketBadge, ...styles.bucketBadgeSuccess }}>
                    <Shield size={14} />
                    Private
                </span>

                <span style={{ ...styles.bucketBadge, ...styles.bucketBadgeWarning }}>
                    <Clock3 size={14} />
                    {bucketPolicy?.lifecycle?.policy_name
                        ? bucketPolicy.lifecycle.policy_name
                        : "No Lifecycle"}
                </span>

                <span style={{ ...styles.bucketBadge, ...styles.bucketBadgeInfo }}>
                    <Database size={14} />
                    Versioning Disabled
                </span>

                <span style={{ ...styles.bucketBadge, ...styles.bucketBadgeSecondary }}>
                    <Lock size={14} />
                    Object Lock Disabled
                </span>
            </div>
        </div>
    );
}