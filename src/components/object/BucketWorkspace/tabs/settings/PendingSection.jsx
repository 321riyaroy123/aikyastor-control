import { C, styles } from "../../../../../styles/theme.js";
import { UnavailableCard } from "./primitives.jsx";

/**
 * Placeholder for sections that are planned but not built yet. It is an
 * explicit, labelled placeholder rather than a disabled/fake control.
 */
export default function PendingSection({ title, bucket }) {
    return (
        <div style={styles.settingsSectionStack}>
            <div style={styles.settingsHeaderRow}>
                <div>
                    <h3 style={styles.pageHeaderTitle}>{title}</h3>
                    <p style={styles.pageHeaderSubtitle}>
                        <strong style={{ color: C.text }}>{bucket.name}</strong>
                    </p>
                </div>
            </div>

            <UnavailableCard title={title} reason="Coming soon">
                This section is not built yet. It will appear here once its backing
                API has been wired in.
            </UnavailableCard>
        </div>
    );
}