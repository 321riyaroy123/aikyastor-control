import { useMemo, useState } from "react";
import { C, styles } from "../../../../styles/theme.js";
import useBucketInfo from "./settings/useBucketInfo.js";
import GeneralSection from "./settings/GeneralSection.jsx";
import PendingSection from "./settings/PendingSection.jsx";

/**
 * Section registry. Later phases replace `PendingSection` entries with real
 * components; the shell itself does not need to change.
 *
 * group:  visual grouping in the sidebar
 * danger: renders the label in the danger colour
 */
function buildSections(ctx) {
    const pending = (title) => () => <PendingSection title={title} bucket={ctx.bucket} />;

    return [
        {
            id: "general",
            label: "General",
            group: "Overview",
            render: () => (
                <GeneralSection
                    bucket={ctx.bucket}
                    objects={ctx.objects}
                    bucketInfo={ctx.bucketInfo}
                />
            )
        },
        { id: "security", label: "Security & Access", group: "Protection", render: pending("Security & Access") },
        { id: "encryption", label: "Encryption", group: "Protection", render: pending("Encryption") },
        { id: "lifecycle", label: "Lifecycle", group: "Data Management", render: pending("Lifecycle") },
        { id: "versioning", label: "Versioning & Data Protection", group: "Data Management", render: pending("Versioning & Data Protection") },
        { id: "replication", label: "Replication", group: "Data Management", render: pending("Replication") },
        { id: "danger", label: "Danger Zone", group: "Danger", danger: true, render: pending("Danger Zone") }
    ];
}

export default function SettingsTab({ bucket, objects, toast }) {
    const [activeId, setActiveId] = useState("general");

    // Loaded once here so General (now) and other sections (later phases)
    // share a single fetch instead of each calling /info separately.
    const bucketInfo = useBucketInfo(bucket?.name);

    const sections = useMemo(
        () => buildSections({ bucket, objects, toast, bucketInfo }),
        [bucket, objects, toast, bucketInfo]
    );

    const active = sections.find((s) => s.id === activeId) || sections[0];

    // Keep group order stable as first-seen order in the registry.
    const groups = [];
    sections.forEach((s) => {
        if (!groups.includes(s.group)) groups.push(s.group);
    });

    return (
        <div style={styles.settingsPage}>
            <nav style={styles.settingsSidebar} aria-label="Bucket settings sections">
                {groups.map((group) => (
                    <div key={group}>
                        <div style={styles.settingsNavGroupLabel}>{group}</div>

                        {sections
                            .filter((s) => s.group === group)
                            .map((section) => {
                                const isActive = section.id === active.id;

                                return (
                                    <button
                                        key={section.id}
                                        type="button"
                                        style={{
                                            ...styles.settingsNavItem,
                                            width: "100%",
                                            ...(section.danger ? styles.settingsNavItemDanger : {}),
                                            ...(isActive ? styles.settingsNavItemActive : {})
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,.05)";
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isActive) e.currentTarget.style.background = "transparent";
                                        }}
                                        onClick={() => setActiveId(section.id)}
                                        aria-current={isActive ? "page" : undefined}
                                    >
                                        <span>{section.label}</span>
                                    </button>
                                );
                            })}
                    </div>
                ))}
            </nav>

            <div style={styles.settingsContent}>
                {active.render()}
            </div>
        </div>
    );
}