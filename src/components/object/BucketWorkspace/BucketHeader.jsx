import { ArrowLeft, Calendar, Database, HardDrive, Shield, Clock3, Lock } from "lucide-react";

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
    const totalSize = objects.reduce((sum, object) => sum + (object.size || 0), 0);

    // Placeholder until bucket quotas are implemented.
    const usagePercent = 35;

    return (
        <div className="bucket-header">
            {/* Navigation */}
            <div className="bucket-header-top">
                <button className="bucket-back-btn" onClick={onBack}>
                    <ArrowLeft size={18} />
                    Object Storage
                </button>
            </div>

            {/* Bucket Identity */}
            <div className="bucket-header-main">
                <div className="bucket-title-section">
                    <div className="bucket-icon">
                        🪣
                    </div>

                    <div>
                        <h2 className="bucket-title">
                            {bucket.name}
                        </h2>
                        <p className="bucket-subtitle">
                            Object Storage Bucket
                        </p>
                    </div>

                </div>

                {/* Summary Cards */}
                <div className="bucket-info-grid">
                    <div className="bucket-info-card">
                        <div>
                            <span className="bucket-info-label">
                                Owner
                            </span>
                            <strong>
                                {bucket.owner || "admin"}
                            </strong>
                        </div>
                    </div>

                    <div className="bucket-info-card">
                        <div>
                            <span className="bucket-info-label">
                                Created
                            </span>
                            <strong>
                                {bucket.created
                                    ? new Date(
                                          bucket.created
                                      ).toLocaleDateString()
                                    : "-"}
                            </strong>
                        </div>
                    </div>

                    <div className="bucket-info-card">
                        <div>
                            <span className="bucket-info-label">
                                Objects
                            </span>
                            <strong>
                                {objects.length}
                            </strong>
                        </div>
                    </div>

                    <div className="bucket-info-card">
                        <div>
                            <span className="bucket-info-label">
                                Storage Used
                            </span>
                            <strong>
                                {formatBytes(totalSize)}
                            </strong>
                        </div>
                    </div>
                </div>
            </div>

            {/* Storage Usage */}
            <div className="bucket-storage">
                <div className="bucket-storage-header">
                    <span>
                        Storage Usage
                    </span>
                    <strong>
                        {formatBytes(totalSize)}
                    </strong>
                </div>

                <div className="bucket-progress">
                    <div
                        className="bucket-progress-fill"
                        style={{
                            width: `${usagePercent}%`
                        }}
                    />
                </div>

                <span className="bucket-storage-note">
                    Unlimited quota configured
                </span>
            </div>

            {/* Status Badges */}
            <div className="bucket-status-row">
                <span className="bucket-badge success">
                    <Shield size={14} />
                    Private
                </span>

                <span className="bucket-badge warning">
                    <Clock3 size={14} />
                    {bucketPolicy?.lifecycle?.policy_name
                        ? bucketPolicy.lifecycle.policy_name
                        : "No Lifecycle"}
                </span>

                <span className="bucket-badge info">
                    <Database size={14} />
                    Versioning Disabled
                </span>

                <span className="bucket-badge secondary">
                    <Lock size={14} />
                    Object Lock Disabled
                </span>
            </div>
        </div>
    );
}