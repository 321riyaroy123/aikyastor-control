import { C } from "../../styles/theme";
import Card from "../common/Card";
import StatusBadge from "../common/StatusBadge";
import PqcBadge from "../security/PqcBadge";
import { pqcVerdict, formatCheckedAt } from "../security/pqcVerdict";

/**
 * SecurityPosture - compact PQC summary for the Overview page.
 *
 * Props:
 *   security - `security` block from GET /api/dashboard:
 *              { available, pending, status, reason, negotiated_group,
 *                expected_group, tls_version, endpoint, plaintext_paths,
 *                checked_at, stale }
 *
 * The backend serves this from the cached PQC probe without blocking, so
 * it is "pending" for the first few seconds after startup. Full details
 * (handshakes, connection paths, at-rest) live on the Encryption Vault page.
 */
export default function SecurityPosture({ security }) {
  if (!security) return null;

  const title = (
    <div style={{ fontFamily: "'Space Mono',monospace", fontSize: ".8rem", fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: ".03em" }}>
      Security Posture
    </div>
  );

  if (!security.available) {
    return (
      <Card style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        {title}
        <span style={{ fontSize: ".78rem", color: security.error ? C.red : C.muted }}>
          {security.error || "Running first PQC probe…"}
        </span>
      </Card>
    );
  }

  const verdict = pqcVerdict(security.status);
  const plaintext = security.plaintext_paths || [];

  return (
    <Card style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: ".75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        {title}
        <div style={{ fontSize: ".72rem", color: C.muted }}>
          {security.checked_at ? `probed ${formatCheckedAt(security.checked_at)}` : ""}
          {security.stale ? " · refreshing" : ""}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: ".75rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: ".82rem", color: C.muted, minWidth: 160 }}>RGW HTTPS key exchange</span>
        <PqcBadge status={security.status} group={security.negotiated_group} simulated={security.simulated} />
        {security.tls_version && (
          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: ".72rem", color: C.muted }}>{security.tls_version}</span>
        )}
      </div>
      <div style={{ fontSize: ".8rem", color: C.text }}>{security.reason || verdict.summary}</div>

      {plaintext.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
          <StatusBadge color="orange">Plaintext</StatusBadge>
          <span style={{ fontSize: ".78rem", color: C.muted }}>{plaintext.join(" · ")}</span>
        </div>
      )}
    </Card>
  );
}
