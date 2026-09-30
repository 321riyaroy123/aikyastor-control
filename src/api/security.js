import { req } from "./client";

// Post-Quantum Cryptography telemetry (backend: routes/pqc_routes.py).
//   pqcStatus - negotiated TLS key-exchange group on the RGW HTTPS endpoint.
//               The verdict is `status`; TLS 1.3 alone is never PQC.
//   posture   - per-bucket SSE, HashiCorp Vault KMS and Ceph msgr2 modes.
//   messenger - Ceph msgr2 modes only (RBD/CephFS transport).
export const SecurityAPI = {
  pqcStatus: (refresh = false) => req(`/pqc/status${refresh ? "?refresh=1" : ""}`),
  posture: (refresh = false) => req(`/pqc/posture${refresh ? "?refresh=1" : ""}`),
  messenger: () => req("/pqc/messenger"),
};
