import { ArrowRight } from "lucide-react";
import { C, styles } from "../../../../../styles/theme.js";
import useReplicationSummary from "./useReplicationSummary.js";
import {
    SettingsSection, InfoGrid, InfoRow, StatusPill, SettingsButton,
    InlineNotice, InlineError, LoadingRow, RefreshButton, UnavailableCard
} from "./primitives.jsx";

const SYNC_STATE = {
    caught_up: { tone: "ok", text: "CAUGHT UP" },
    syncing: { tone: "warn", text: "SYNCING" },
    unknown: { tone: "muted", text: "UNKNOWN" }
};

function syncView(status) {
    return SYNC_STATE[(status || "unknown").toLowerCase()] || SYNC_STATE.unknown;
}

function ZoneCard({ zone, fallbackRole }) {
    if (!zone) return null;

    const role = (zone.role || fallbackRole || "").toUpperCase();
    const endpoints = Array.isArray(zone.endpoints) && zone.endpoints.length > 0
        ? zone.endpoints.join(", ")
        : null;

    return (
        <div style={styles.settingsZoneCard}>
            <div style={styles.settingsZoneRole}>{role}</div>
            <div style={styles.settingsZoneName}>{zone.name || "Unnamed zone"}</div>
            <div style={styles.settingsInfoNote}>{endpoints || "No endpoint configured"}</div>
        </div>
    );
}

export default function ReplicationSection({ bucket, onOpenReplication }) {
    const { data, state, loading, refreshing, checkedAt, refresh } = useReplicationSummary();

    const metadata = syncView(data?.sync?.metadata?.status);
    const dataSync = syncView(data?.sync?.data?.status);

    const statusPill = {
        loading: <StatusPill tone="muted">LOADING</StatusPill>,
        ready: <StatusPill tone="ok">ENABLED</StatusPill>,
        unreachable: <StatusPill tone="bad">SECONDARY UNREACHABLE</StatusPill>,
        unavailable: <StatusPill tone="muted">UNAVAILABLE</StatusPill>
    }[state];

    return (
        <div style={styles.settingsSectionStack}>
            <div style={styles.settingsHeaderRow}>
                <div>
                    <h3 style={styles.pageHeaderTitle}>Replication</h3>
                    <p style={styles.pageHeaderSubtitle}>
                        Multisite replication of the RGW realm that contains{" "}
                        <strong style={{ color: C.text }}>{bucket.name}</strong>.
                    </p>
                </div>

                <RefreshButton onClick={refresh} busy={refreshing || loading} />
            </div>

            <InlineNotice>
                <strong>Replication is configured for the whole realm, not per bucket.</strong> This
                console cannot switch replication on or off for a single bucket, and the summary below does
                not prove that this particular bucket has been replicated. Per-bucket object-count
                comparison is available in the Replication panel.
            </InlineNotice>

            <SettingsSection
                title="Realm Status"
                description="Read from Ceph RGW multisite configuration."
                status={statusPill}
                footer={
                    onOpenReplication && (
                        <SettingsButton onClick={onOpenReplication}>
                            Open Replication panel
                            <ArrowRight size={14} />
                        </SettingsButton>
                    )
                }
            >
                {state === "loading" ? (
                    <LoadingRow>Reading replication status...</LoadingRow>
                ) : state === "unavailable" ? (
                    <UnavailableCard title="Replication" reason="Unavailable">
                        Replication status could not be read, or multisite replication is not configured.
                        This feature only runs against a real Ceph cluster; it is not available in
                        simulation mode.
                        {data?.error && (
                            <div style={{ marginTop: ".5rem", color: C.red }}>
                                {data.error}
                            </div>
                        )}
                    </UnavailableCard>
                ) : (
                    <>
                        {state === "unreachable" && (
                            <div style={{ marginBottom: ".85rem" }}>
                                <InlineError>
                                    The secondary zone could not be reached
                                    {data?.error ? `: ${data.error}` : "."} Zone details below come from the
                                    primary cluster; sync state is unavailable.
                                </InlineError>
                            </div>
                        )}

                        <InfoGrid>
                            <InfoRow label="Realm" value={data?.realm?.name} mono />
                            <InfoRow label="Zonegroup" value={data?.zonegroup?.name} mono />
                            <InfoRow label="Master zone" value={data?.zonegroup?.master_zone} mono />

                            {state === "ready" && (
                                <>
                                    <InfoRow label="Metadata sync">
                                        <StatusPill tone={metadata.tone}>{metadata.text}</StatusPill>
                                    </InfoRow>
                                    <InfoRow label="Data sync">
                                        <StatusPill tone={dataSync.tone}>{dataSync.text}</StatusPill>
                                    </InfoRow>
                                </>
                            )}
                        </InfoGrid>

                        {state === "ready" && (data?.primary || data?.secondary) && (
                            <>
                                <div style={styles.settingsSubhead}>Topology</div>

                                <div style={styles.settingsZoneGrid}>
                                    <ZoneCard zone={data.primary} fallbackRole="primary" />
                                    <ZoneCard zone={data.secondary} fallbackRole="secondary" />
                                </div>
                            </>
                        )}
                    </>
                )}

                {checkedAt && (
                    <div style={{ ...styles.settingsInfoNote, marginTop: ".75rem", textAlign: "right" }}>
                        Checked at {checkedAt.toLocaleTimeString()}
                    </div>
                )}
            </SettingsSection>

            <UnavailableCard title="Per-Bucket Replication Controls" reason="Not exposed">
                The backend has no per-bucket replication settings. Configuring the secondary zone,
                provisioning a secondary cluster and resetting the connection circuit breaker are
                realm-level operations. Configure and Provision live in the Replication panel; the circuit
                breaker reset endpoint exists on the server but has no control in the UI yet.
            </UnavailableCard>
        </div>
    );
}