import { styles } from "../../../styles/theme.js";

const tabs = [
    { id: "objects", label: "Objects" },
    { id: "policies", label: "Policies" },
    { id: "lifecycle", label: "Lifecycle" },
    { id: "settings", label: "Settings" }
];

export default function BucketTabs({ activeTab, onChange }) {
    return (
        <div style={styles.bucketTabs}>
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;

                return (
                    <button
                        key={tab.id}
                        style={isActive ? { ...styles.bucketTab, ...styles.bucketTabActive } : styles.bucketTab}
                        onClick={() => onChange(tab.id)}
                    >
                        <span>{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
}