import StatCard from "../common/StatCard";
import StatusBadge from "../common/StatusBadge";
import { Th, Td, TableWrap, EmptyRow } from "../common/Table";
import { C, styles } from "../../styles/theme";
import usePqcStatus from "../../hooks/usePqcStatus";
import PqcBadge from "./PqcBadge";
import { pqcVerdict, formatCheckedAt } from "./pqcVerdict";

// Post-Quantum Cryptography section of the Encryption Vault page.
//
// Every value comes from GET /api/pqc/status and /api/pqc/posture. There
// are deliberately no fallback strings like "TLSv1.3" or "X25519MLKEM768":
// a missing value renders as "—", never as a PQC claim.

const OUTCOME_META = {
  established: { label: "Established", color: "green" },
  rejected: { label: "Rejected by RGW", color: "red" },
  client_unsupported: { label: "Client can't offer", color: "orange" },
  unreachable: { label: "Unreachable", color: "red" },
  error: { label: "Error", color: "red" },
};

const HANDSHAKE_LABELS = {
  pqc_only: "ML-KEM only",
  preferred: "ML-KEM preferred + classical",
};

function SectionTitle({ children, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".6rem" }}>
      <div style={{ fontFamily: "'Space Mono',monospace", fontSize: ".8rem", color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
        {children}
      </div>
      {right}
    </div>
  );
}

function Mono({ children, color }) {
  return <span style={{ fontFamily: "'Space Mono',monospace", fontSize: ".8rem", color }}>{children ?? "—"}</span>;
}

function yesNoBadge(value, { yes = "Yes", no = "No", unknown = "Unknown", noColor = "red" } = {}) {
  if (value === true) return <StatusBadge color="green">{yes}</StatusBadge>;
  if (value === false) return <StatusBadge color={noColor}>{no}</StatusBadge>;
  return <StatusBadge color="blue">{unknown}</StatusBadge>;
}

function HandshakeTable({ handshakes }) {
  const rows = Object.entries(handshakes || {});
  return (
    <TableWrap>
      <thead>
        <tr>{["Probe", "Groups offered", "Outcome", "Negotiated group", "Protocol / cipher"].map(h => <Th key={h}>{h}</Th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0 && <EmptyRow colSpan={5}>No probe results yet</EmptyRow>}
        {rows.map(([key, h]) => {
          const meta = OUTCOME_META[h.outcome] || { label: h.outcome, color: "blue" };
          return (
            <tr key={key}>
              <Td><Mono>{HANDSHAKE_LABELS[key] || key}</Mono></Td>
              <Td><Mono color={C.muted}>{(h.groups_offered || []).join(" : ")}</Mono></Td>
              <Td>
                <StatusBadge color={meta.color}>{meta.label}</StatusBadge>
                {h.detail && (
                  <div style={{ fontSize: ".72rem", color: C.muted, marginTop: ".35rem", maxWidth: 360, wordBreak: "break-word" }}>
                    {h.detail}
                  </div>
                )}
              </Td>
              <Td>
                <Mono color={h.group_family === "ml-kem" ? C.green : h.group ? C.yellow : undefined}>{h.group}</Mono>
              </Td>
              <Td><Mono color={C.muted}>{h.protocol ? `${h.protocol} · ${h.cipher_suite}` : null}</Mono></Td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}

function ConnectionsTable({ connections }) {
  return (
    <TableWrap>
      <thead>
        <tr>{["Path", "Endpoint", "Transport", "Cert verified", "PQC"].map(h => <Th key={h}>{h}</Th>)}</tr>
      </thead>
      <tbody>
        {(!connections || connections.length === 0) && <EmptyRow colSpan={5}>No connection data</EmptyRow>}
        {(connections || []).map(c => (
          <tr key={c.id}>
            <Td>
              <div>{c.label}</div>
              {c.note && <div style={{ fontSize: ".72rem", color: C.muted, marginTop: ".2rem" }}>{c.note}</div>}
            </Td>
            <Td><Mono>{c.endpoint}</Mono></Td>
            <Td>
              <StatusBadge color={c.transport === "tls" ? "blue" : "red"}>
                {c.transport === "tls" ? "TLS" : "Plaintext"}
              </StatusBadge>
            </Td>
            <Td>{c.transport === "tls" ? yesNoBadge(c.cert_verified, { no: "Disabled" }) : <Mono color={C.muted}>n/a</Mono>}</Td>
            <Td>{yesNoBadge(c.pqc)}</Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

function PostureTable({ posture, error }) {
  if (error && !posture) {
    return <div style={{ fontSize: ".82rem", color: C.red, marginBottom: "1.5rem" }}>{error}</div>;
  }
  if (!posture) {
    return <div style={{ fontSize: ".82rem", color: C.muted, marginBottom: "1.5rem" }}>Loading encryption posture…</div>;
  }

  const obj = posture.object || {};
  const msgr = posture.messenger || {};
  const modes = msgr.modes || {};
  const allEncrypted = obj.available && obj.total_buckets > 0 && obj.encrypted_buckets === obj.total_buckets;

  return (
    <TableWrap>
      <thead>
        <tr>{["Storage", "Mechanism", "Status", "Quantum note"].map(h => <Th key={h}>{h}</Th>)}</tr>
      </thead>
      <tbody>
        <tr>
          <Td>Object (RGW)</Td>
          <Td><Mono>SSE-S3 {obj.algorithms?.length ? `(${obj.algorithms.join(", ")})` : ""}</Mono></Td>
          <Td>
            {obj.available ? (
              <>
                <StatusBadge color={allEncrypted ? "green" : obj.encrypted_buckets > 0 ? "orange" : "red"}>
                  {obj.encrypted_buckets}/{obj.total_buckets} buckets encrypted
                </StatusBadge>
                {obj.unencrypted_buckets?.length > 0 && (
                  <div style={{ fontSize: ".72rem", color: C.muted, marginTop: ".35rem" }}>
                    Unencrypted: {obj.unencrypted_buckets.slice(0, 5).join(", ")}
                    {obj.unencrypted_buckets.length > 5 ? ` +${obj.unencrypted_buckets.length - 5} more` : ""}
                  </div>
                )}
              </>
            ) : (
              <StatusBadge color="red">{obj.error || "Unavailable"}</StatusBadge>
            )}
          </Td>
          <Td style={{ color: C.muted, fontSize: ".78rem" }}>
            AES-256 keeps ~128-bit strength against Grover — only for buckets with SSE enabled.
          </Td>
        </tr>
        {["block", "file"].map(kind => (
          <tr key={kind}>
            <Td>{kind === "block" ? "Block (RBD)" : "File (CephFS)"}</Td>
            <Td><Mono>OSD dm-crypt</Mono></Td>
            <Td>
              {yesNoBadge(posture[kind]?.osd_dmcrypt, { yes: "Encrypted", no: "Not encrypted", unknown: "Not detectable" })}
            </Td>
            <Td style={{ color: C.muted, fontSize: ".78rem" }}>
              AiKyaStor applies no encryption here; dm-crypt is configured per OSD host.
            </Td>
          </tr>
        ))}
        <tr>
          <Td>Ceph internal (msgr2)</Td>
          <Td>
            {msgr.available ? (
              <div style={{ display: "flex", flexDirection: "column", gap: ".15rem" }}>
                {Object.entries(modes).map(([k, v]) => (
                  <Mono key={k} color={C.muted}>{k.replace("ms_", "").replace("_mode", "")}: {v ?? "—"}</Mono>
                ))}
              </div>
            ) : <Mono color={C.muted}>{msgr.error || "Unavailable"}</Mono>}
          </Td>
          <Td>
            {msgr.available
              ? <StatusBadge color={msgr.all_secure ? "green" : "orange"}>{msgr.all_secure ? "Secure mode" : "CRC preferred"}</StatusBadge>
              : <StatusBadge color="blue">Unknown</StatusBadge>}
          </Td>
          <Td style={{ color: C.muted, fontSize: ".78rem" }}>
            Not TLS — TLS PQC does not apply. Secure mode uses AES-GCM keyed from cephx shared secrets.
          </Td>
        </tr>
      </tbody>
    </TableWrap>
  );
}

export default function PqcPanel() {
  const { status, posture, loading, refreshing, error, postureError, refresh } =
    usePqcStatus({ includePosture: true, pollMs: 30000 });

  const verdict = pqcVerdict(status?.status);
  const tls = status?.rgw_tls || {};
  const backend = status?.backend_client || {};
  const probe = status?.probe_client || {};
  const simulated = status?.simulated || posture?.simulated;

  return (
    <div style={{ marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h3 style={{ ...styles.pageHeaderTitle, fontSize: "1rem" }}>
            Post-Quantum Cryptography {simulated && <StatusBadge color="vault">SIMULATED</StatusBadge>}
          </h3>
          <p style={styles.pageHeaderSubtitle}>
            Verified by probing the RGW HTTPS endpoint for the negotiated key-exchange group.
            TLS 1.3 alone is not treated as quantum-resistant.
          </p>
        </div>
        <button
          style={{ ...styles.btn, ...styles.btnGhost, ...styles.btnSm }}
          onClick={refresh}
          disabled={loading || refreshing}
        >
          {refreshing ? "Probing..." : "↻ Re-probe"}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: "1rem", padding: ".7rem .8rem", background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 6, color: C.red, fontSize: ".82rem" }}>
          {error}{status ? " — showing last successful probe." : ""}
        </div>
      )}

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1rem 1.25rem", marginBottom: "1rem", display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        <PqcBadge status={status?.status} group={status?.negotiated_group} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: ".88rem", color: C.text }}>{status?.reason || verdict.summary}</div>
          <div style={{ fontSize: ".75rem", color: C.muted, marginTop: ".3rem" }}>
            {status?.endpoint && <>Endpoint <Mono>{status.endpoint}</Mono> · </>}
            {status?.checked_at && <>checked {formatCheckedAt(status.checked_at)}{status.cached ? " (cached)" : ""}</>}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="PQC Key Exchange" value={verdict.label} sub={`expected ${status?.expected_group || "—"}`} />
        <StatCard label="Negotiated Group" value={status?.negotiated_group || "—"} sub={status?.negotiated_group_family || "not determined"} />
        <StatCard label="RGW TLS" value={tls.tls_version || "—"} sub={tls.cipher_suite || (tls.error ? "handshake failed" : "—")} />
        <StatCard
          label="Connect + Handshake"
          value={tls.connect_and_handshake_ms != null ? `${tls.connect_and_handshake_ms} ms` : "—"}
          sub="TCP + TLS, backend → RGW"
        />
      </div>

      <SectionTitle>Handshake probes</SectionTitle>
      <HandshakeTable handshakes={status?.handshakes} />
      <div style={{ fontSize: ".75rem", color: C.muted, marginTop: "-1rem", marginBottom: "1.5rem" }}>
        Probe client: <Mono>{probe.version || probe.error || "—"}</Mono> ({probe.binary || "openssl"}).
        Backend TLS stack used by boto3: <Mono>{backend.openssl_version || "—"}</Mono> —{" "}
        {backend.can_offer_mlkem ? "can offer ML-KEM." : "cannot offer ML-KEM."}
      </div>

      <SectionTitle>Connection paths used by this dashboard</SectionTitle>
      <ConnectionsTable connections={status?.connections} />

      <SectionTitle>Data at rest & Ceph internal traffic</SectionTitle>
      <PostureTable posture={posture} error={postureError} />
    </div>
  );
}
