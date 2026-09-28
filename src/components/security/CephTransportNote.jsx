import { useEffect, useState } from "react";
import { C } from "../../styles/theme";
import StatusBadge from "../common/StatusBadge";
import { SecurityAPI } from "../../api/security";

/**
 * CephTransportNote - one-line transport security note for the Block and
 * File pages. RBD and CephFS clients talk to OSDs/MDSs over Ceph msgr2,
 * not TLS, so the RGW PQC verdict does not apply to them. msgr2 "secure"
 * mode is AES-GCM keyed from cephx shared secrets (no public-key exchange).
 */
export default function CephTransportNote({ service, style }) {
  const [msgr, setMsgr] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    SecurityAPI.messenger()
      .then(data => { if (!cancelled) setMsgr(data); })
      .catch(err => { if (!cancelled) setError(err.message || "Unavailable"); });
    return () => { cancelled = true; };
  }, []);

  // A client's data path uses ms_client_mode on its side and
  // ms_service_mode on the daemon side; the first entry is preferred.
  const mode = msgr?.modes?.ms_client_mode || msgr?.modes?.ms_service_mode;
  const preferred = mode ? mode.split(" ")[0] : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap", fontSize: ".75rem", color: C.muted, margin: "-.75rem 0 1.25rem", ...style }}>
      <span style={{ fontFamily: "'Space Mono',monospace" }}>Transport: Ceph msgr2</span>
      {preferred ? (
        <StatusBadge color={preferred === "secure" ? "green" : "orange"}>
          {preferred === "secure" ? "Encrypted (secure mode)" : "Integrity only (crc mode)"}
        </StatusBadge>
      ) : (
        <StatusBadge color="blue">{error || (msgr ? "Mode unknown" : "Checking…")}</StatusBadge>
      )}
      {msgr?.simulated && <StatusBadge color="vault">SIM</StatusBadge>}
      <span>
        {service} traffic is not TLS, so TLS post-quantum key exchange does not apply
        {mode ? ` · client mode: ${mode}` : ""}.
      </span>
    </div>
  );
}
