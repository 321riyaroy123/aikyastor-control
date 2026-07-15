const sections = [ "General", "Versioning", "Object Lock", "Replication", "Encryption", "Notifications", "Tags", "Quotas" ];

export default function SettingsTab({ bucket }) {
    return (
        <div className="settings-page">
            <div className="settings-sidebar">
                {sections.map((section) => (
                    <button
                        key={section}
                        className="settings-nav-item"
                    >
                        <span>{section}</span>
                    </button>
                ))}
            </div>

            <div className="settings-content">
                <h2>Bucket Settings</h2>
                <p>
                    Configure <strong>{bucket.name}</strong> and its advanced storage features.
                </p>
                <p className="settings-placeholder">
                    Select a category from the left to begin.
                </p>
            </div>
        </div>
    );
}