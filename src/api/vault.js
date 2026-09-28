import { req } from "./client";

export const VaultAPI = {
  status: () => req("/vault/status"),
};

import { req } from "./client";

// Read-only HashiCorp Vault (transit / SSE-S3) status. Distinct from
// /vault/status, which reports on the local backup mount (VAULT_PATH).
export const HashiCorpVaultAPI = {
    status() {
        return req("/vault/hashicorp/status");
    },
    health() {
        return req("/vault/hashicorp/health");
    },
    transit() {
        return req("/vault/hashicorp/transit");
    },
    token() {
        return req("/vault/hashicorp/token");
    }
};