import { useState } from "react";
import { C, styles } from "../../../../styles/theme.js";

const sections = ["General", "Versioning", "Object Lock", "Replication", "Encryption", "Notifications", "Tags", "Quotas"];

export default function SettingsTab({ bucket }) {
    const [activeSection, setActiveSection] = useState("General");

    return (
        <div style={styles.settingsPage}>
            <div style={styles.settingsSidebar}>
                {sections.map((section) => {
                    const isActive = section === activeSection;

                    return (
                        <button
                            key={section}
                            style={
                                isActive
                                    ? { ...styles.settingsNavItem, background: "rgba(249,115,22,.12)", color: C.accent }
                                    : styles.settingsNavItem
                            }
                            onMouseEnter={(e) => {
                                if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,.05)";
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) e.currentTarget.style.background = "transparent";
                            }}
                            onClick={() => setActiveSection(section)}
                        >
                            <span>{section}</span>
                        </button>
                    );
                })}
            </div>

            <div style={styles.settingsContent}>
                <h2 style={styles.pageHeaderTitle}>Bucket Settings</h2>
                <p style={styles.pageHeaderSubtitle}>
                    Configure <strong style={{ color: C.text }}>{bucket.name}</strong> and its advanced storage features.
                </p>
                <p style={styles.settingsPlaceholder}>
                    Select a category from the left to begin.
                </p>
            </div>
        </div>
    );
}