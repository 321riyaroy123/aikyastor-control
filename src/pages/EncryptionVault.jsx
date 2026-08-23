import { useState, useEffect, useCallback } from "react";
import StatCard from "../components/common/StatCard";
import StatusBadge from "../components/common/StatusBadge";
import { Th, TableWrap } from "../components/common/Table";
import { C, styles } from "../styles/theme";
import { EncryptionVaultAPI } from "../api/encryptionVault";

// Encryption Vault: health & status for the HashiCorp Vault server
// (Transit secrets engine) that backs Ceph RGW's SSE-S3 encryption.
//
// Read-only: this page cannot rotate tokens, create keys, or change
// Vault's seal state. Per-bucket encryption enable/disable already
// lives in that bucket's Settings -> Encryption tab (SettingsTab.jsx)
// and is intentionally NOT duplicated here, since Vault's health
// (reachable / sealed / transit mounted) is a cluster-wide property,
// not a per-bucket one -- every bucket depends on the same Vault
// instance, so there is nothing bucket-specific to show on this page.
export default function EncryptionVaultPage({ toast }) {
    const [statusData, setStatusData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadStatus = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError("");

        try {
            const result = await EncryptionVaultAPI.status();
            setStatusData(result);
        } catch (err) {
            setError(err.message || "Failed to load Encryption Vault status.");
            if (!silent && toast) {
                toast(err.message || "Failed to load Encryption Vault status.", "error");
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadStatus();
        const timer = setInterval(() => loadStatus(true), 20000);
        return () => clearInterval(timer);
    }, [loadStatus]);

    const health = statusData?.health;
    const transit = statusData?.transit;
    const token = statusData?.token;

    const reachable = health?.reachable;
    const sealed = health?.sealed;

    // Overall status pill shown in the summary card.
    let overallLabel = "Checking...";
    let overallColor = "blue";

    if (health) {
        if (!reachable) {
            overallLabel = "Unreachable";
            overallColor = "red";
        } else if (sealed) {
            overallLabel = "Sealed";
            overallColor = "orange";
        } else {
            overallLabel = "Unsealed & Healthy";
            overallColor = "green";
        }
    }

    const formatTtl = (seconds) => {
        if (seconds === null || seconds === undefined) return "—";
        if (seconds === 0) return "Never expires";

        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);

        if (days > 0) return `${days}d ${hours}h remaining`;
        return `${hours}h remaining`;
    };

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
                <div>
                    <h2 style={styles.pageHeaderTitle}>Encryption Vault</h2>
                    <p style={styles.pageHeaderSubtitle}>
                        HashiCorp Vault (Transit engine) status — the encryption backend behind Ceph RGW's SSE-S3.
                        Not related to "Vault Backup," which mirrors files/objects to a separate backup mount.
                    </p>
                </div>
                <button
                    style={{ ...styles.btn, ...styles.btnGhost, ...styles.btnSm }}
                    onClick={() => loadStatus()}
                    disabled={loading}
                >
                    {loading ? "Refreshing..." : "↻ Refresh"}
                </button>
            </div>

            {error && (
                <div style={{
                    marginBottom: "1.5rem",
                    padding: ".7rem .8rem",
                    background: "rgba(248,113,113,.1)",
                    border: "1px solid rgba(248,113,113,.3)",
                    borderRadius: 6,
                    color: C.red,
                    fontSize: ".82rem"
                }}>
                    {error}
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                <StatCard
                    label="Encryption Vault Status"
                    value={overallLabel}
                    sub={health?.version ? `v${health.version}` : "—"}
                />
                <StatCard
                    label="Transit Engine"
                    value={transit?.mounted === true ? "Mounted" : transit?.mounted === false ? "Not Mounted" : "—"}
                    sub="encryption-as-a-service"
                />
                <StatCard
                    label="Dashboard Token"
                    value={token?.valid ? "Valid" : token?.valid === false ? "Invalid" : "—"}
                    sub={token?.ttl_seconds !== undefined ? formatTtl(token.ttl_seconds) : "—"}
                />
                <StatCard
                    label="Standby Node"
                    value={health?.standby === true ? "Yes" : health?.standby === false ? "No (Active)" : "—"}
                    sub="cluster role"
                />
            </div>

            <TableWrap>
                <thead>
                    <tr style={{ background: C.surface2 }}>
                        {["Check", "Status", "Details"].map(h => <Th key={h}>{h}</Th>)}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style={{ padding: ".75rem 1rem", fontFamily: "'Space Mono',monospace", fontSize: ".85rem", borderBottom: `1px solid ${C.border}` }}>
                            Connectivity
                        </td>
                        <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}>
                            <StatusBadge color={reachable ? "green" : "red"}>
                                {reachable ? "Reachable" : "Unreachable"}
                            </StatusBadge>
                        </td>
                        <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: ".8rem" }}>
                            {health?.error || (reachable ? "Vault API responding" : "—")}
                        </td>
                    </tr>
                    <tr>
                        <td style={{ padding: ".75rem 1rem", fontFamily: "'Space Mono',monospace", fontSize: ".85rem", borderBottom: `1px solid ${C.border}` }}>
                            Seal Status
                        </td>
                        <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}>
                            <StatusBadge color={sealed === false ? "green" : sealed === true ? "orange" : "blue"}>
                                {sealed === false ? "Unsealed" : sealed === true ? "Sealed" : "Unknown"}
                            </StatusBadge>
                        </td>
                        <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: ".8rem" }}>
                            {sealed ? "Vault must be unsealed before RGW can encrypt/decrypt objects" : "Ready to serve requests"}
                        </td>
                    </tr>
                    <tr>
                        <td style={{ padding: ".75rem 1rem", fontFamily: "'Space Mono',monospace", fontSize: ".85rem", borderBottom: `1px solid ${C.border}` }}>
                            Transit Secrets Engine
                        </td>
                        <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}` }}>
                            <StatusBadge color={transit?.mounted ? "green" : transit?.mounted === false ? "red" : "blue"}>
                                {transit?.mounted === true ? "Mounted" : transit?.mounted === false ? "Not Mounted" : "Unknown"}
                            </StatusBadge>
                        </td>
                        <td style={{ padding: ".75rem 1rem", borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: ".8rem" }}>
                            {transit?.error || "Required for SSE-S3 encryption/decryption"}
                        </td>
                    </tr>
                    <tr>
                        <td style={{ padding: ".75rem 1rem", fontFamily: "'Space Mono',monospace", fontSize: ".85rem" }}>
                            Dashboard Token
                        </td>
                        <td style={{ padding: ".75rem 1rem" }}>
                            <StatusBadge color={token?.valid ? "green" : token?.valid === false ? "red" : "blue"}>
                                {token?.valid === true ? "Valid" : token?.valid === false ? "Invalid" : "Unknown"}
                            </StatusBadge>
                        </td>
                        <td style={{ padding: ".75rem 1rem", color: C.muted, fontSize: ".8rem" }}>
                            {token?.error
                                ? token.error
                                : token?.policies
                                    ? `Policies: ${token.policies.join(", ")} · ${formatTtl(token.ttl_seconds)}`
                                    : "—"}
                        </td>
                    </tr>
                </tbody>
            </TableWrap>

            <p style={{ marginTop: "1rem", fontSize: ".78rem", color: C.muted }}>
                This page is read-only. It reports the Encryption Vault's health and cannot modify seal state,
                tokens, or keys. To enable or disable encryption on a specific bucket, use that bucket's{" "}
                <strong style={{ color: C.text }}>Settings → Encryption</strong> tab.
            </p>
        </div>
    );
}