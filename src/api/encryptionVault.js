// api/encryptionVault.js
//
// API client for the Encryption Vault -- the HashiCorp Vault server
// running the Transit secrets engine that backs Ceph RGW's SSE-S3
// server-side encryption.
//
// NAMING: deliberately called "Encryption Vault" everywhere in this
// codebase (file names, component names, API names, sidebar label) to
// stay unambiguous against the UNRELATED "Vault Backup" system
// (api/vault.js -> VaultAPI, pages/Vault.jsx), which is a CephFS/RBD
// backup mirror mount (VAULT_PATH in backend config). Both systems are
// internally called "vault" by their respective tools (HashiCorp Vault
// the product; the /vault backup mount by convention) but they are
// otherwise completely unrelated -- different backend, different
// purpose, different failure modes. Do not merge or rename these to
// share a common "Vault" label; that ambiguity previously caused real
// confusion while debugging the Ceph RGW <-> HashiCorp Vault integration.
//
// Matches the fetch/JSON convention used by ObjectAPI, VaultAPI, etc.
// Adjust the base fetch helper below if your other api/*.js files import
// a shared `request()`/`apiFetch()` utility instead of calling fetch()
// directly -- wire this to whichever your codebase already uses.

const BASE = "/api/vault/hashicorp";
// ^ Backend route path is unchanged (kept as /api/vault/hashicorp/status
//   to match routes/vault_routes.py and services/vault/vault_health.py,
//   which use "hashicorp" as the backend-side disambiguator). Only the
//   FRONTEND-facing names below use "Encryption Vault" terminology.

async function get(path) {
    const res = await fetch(`${BASE}${path}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
    }

    return data;
}

export const EncryptionVaultAPI = {
    /**
     * Returns combined health / transit-mount / token status for the
     * Encryption Vault:
     * {
     *   health: { reachable, initialized, sealed, standby, version, ... },
     *   transit: { mounted } | { mounted: null, error },
     *   token: { valid, policies, ttl_seconds, renewable } | { valid: null, error }
     * }
     */
    status: () => get("/status"),
};