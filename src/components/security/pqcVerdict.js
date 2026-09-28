// Shared mapping from the backend's PQC `status` to UI label/colour, so
// every page words the verdict identically. `color` values match
// StatusBadge; `tone` values match the bucket-settings StatusPill.
const VERDICTS = {
  pqc_verified: {
    label: "PQC Verified",
    color: "green",
    tone: "ok",
    summary: "RGW negotiated an ML-KEM hybrid key exchange with a PQC-capable client.",
  },
  not_negotiated: {
    label: "Not Negotiated",
    color: "red",
    tone: "bad",
    summary: "RGW is using a classical key exchange. TLS is active but not quantum-resistant.",
  },
  unverified: {
    label: "Unverified",
    color: "orange",
    tone: "warn",
    summary: "The backend's probe client cannot offer ML-KEM, so PQC cannot be confirmed either way.",
  },
  unreachable: {
    label: "Unreachable",
    color: "red",
    tone: "bad",
    summary: "The RGW HTTPS endpoint could not be reached.",
  },
};

const UNKNOWN = {
  label: "Checking…",
  color: "blue",
  tone: "muted",
  summary: "Waiting for the first PQC probe.",
};

export function pqcVerdict(status) {
  return VERDICTS[status] || UNKNOWN;
}

export function formatCheckedAt(epochSeconds) {
  if (!epochSeconds) return null;
  return new Date(epochSeconds * 1000).toLocaleTimeString();
}
