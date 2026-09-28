# AiKyaStor CONTROL — Post-Quantum Cryptography (PQC)

This document covers how AiKyaStor CONTROL **verifies** post-quantum key
exchange on Ceph RGW, what the dashboard reports, and how to set up a VM so
the verification can pass.

> **Rule:** TLS 1.3 is not PQC. A TLS 1.3 handshake over classical X25519
> looks identical at the protocol and cipher level. The dashboard only
> reports PQC when it has observed an ML-KEM group being negotiated.

---

## 1. What is protected, and by what

| Path | Transport | PQC applicable? |
|---|---|---|
| S3 client → RGW HTTPS | TLS 1.3 | Yes, if RGW negotiates `X25519MLKEM768` |
| Backend → RGW, most S3 calls (`get_s3_client()`) | `CEPH_RGW_ENDPOINT`, typically **plain HTTP** | No: plaintext |
| Backend → RGW, SSE-S3 calls (`get_s3_client(secure=True)`) | TLS, **certificate not verified** | Only if the backend's own Python/OpenSSL can offer ML-KEM (OpenSSL ≥ 3.5) |
| Backend → HashiCorp Vault | `HASHICORP_VAULT_ADDR`, typically plain HTTP | No: plaintext |
| RBD / CephFS clients ↔ OSD/MDS | Ceph msgr2 (not TLS) | No TLS PQC. msgr2 `secure` mode is AES-GCM keyed from cephx shared secrets, so there is no public-key exchange for Shor's algorithm to attack |
| Object data at rest | SSE-S3 AES-256, **per bucket** | AES-256 keeps ~128-bit strength against Grover, but only for buckets with SSE enabled |
| RBD / CephFS data at rest | None applied by AiKyaStor; OSD dm-crypt is per host | Not detectable from the ceph CLI; reported as unknown |

ML-KEM protects session keys against *harvest-now, decrypt-later*. The RGW
certificate signature is still classical (RSA/ECDSA), so authentication is
not post-quantum.

## 2. How verification works

`backend/services/security/pqc_probe.py` runs three handshakes against
`PQC_PROBE_ENDPOINT` (defaults to `CEPH_RGW_ENDPOINT_SECURE`):

1. **Python `ssl`** (the stack boto3 uses): reports TLS version and cipher,
   and the negotiated group on Python ≥ 3.14.
2. **`openssl s_client -groups X25519MLKEM768`** (ML-KEM *only*). Success
   proves RGW supports it; a handshake failure proves it does not.
3. **`openssl s_client -groups X25519MLKEM768:X25519:secp256r1:secp384r1`**
   shows what RGW actually picks for a modern client.

`PQC_OPENSSL_BIN` must be able to *offer* ML-KEM: OpenSSL ≥ 3.5, or the
`/opt/oqs/bin/openssl-oqs` wrapper built by `scripts/setup_pqc_vm.sh`.

### Verdicts (`status`)

| status | Meaning |
|---|---|
| `pqc_verified` | An ML-KEM group was negotiated |
| `not_negotiated` | RGW is reachable, but a classical group was chosen or the ML-KEM-only offer was rejected |
| `unverified` | The probe client cannot offer ML-KEM, so no PQC claim is made either way |
| `unreachable` | The RGW HTTPS endpoint could not be reached |

Results are cached for `PQC_CACHE_SECONDS` (60 s by default).
`/api/dashboard` reads the cache without blocking and refreshes it in the
background.

## 3. API

| Endpoint | Returns |
|---|---|
| `GET /api/pqc/status[?refresh=1]` | `status`, `reason`, `negotiated_group`, `rgw_tls`, `handshakes.{pqc_only,preferred}`, `probe_client`, `backend_client`, `connections[]` |
| `GET /api/pqc/posture[?refresh=1]` | `object` (per-bucket SSE counts from RGW), `vault` (HashiCorp Vault status), `messenger` (msgr2 modes), `block`/`file` |
| `GET /api/pqc/messenger` | msgr2 modes only (used by the Block and File pages) |
| `GET /api/dashboard` → `security` | Compact cached summary for the Overview page |

In simulation mode every payload carries `simulated: true`, and the UI
labels it **SIMULATED**.

## 4. Where it appears in the UI

- **Encryption Vault page:** the existing Vault checks are unchanged. Below
  them, the PQC panel shows the verdict, the handshake probes, the
  connection paths, and the at-rest / msgr2 posture.
- **Overview:** a Security Posture card with the verdict and any plaintext
  paths.
- **Object Storage → bucket Settings → General:** an "HTTPS key exchange"
  badge. Once the Encryption section is enabled, it also shows an
  "In transit" row.
- **Block Storage / File Storage:** a msgr2 transport note (TLS PQC is not
  applicable there).

## 5. VM setup

```bash
# 1. Read-only check: RGW daemons, the RGW container's OpenSSL, and a
#    forced ML-KEM handshake.
sudo scripts/setup_pqc_vm.sh check 127.0.0.1:443

# 2. If the host openssl can't offer ML-KEM, build a private
#    oqsprovider-enabled wrapper. This does not touch /etc/ssl/openssl.cnf.
sudo scripts/setup_pqc_vm.sh build-oqs-client

# 3. Optional: a self-signed RGW certificate, plus cephadm spec instructions.
sudo scripts/setup_pqc_vm.sh gen-cert
```

**Making RGW itself offer ML-KEM:** RGW uses the OpenSSL inside its
container image. ML-KEM is built into OpenSSL from 3.5 onward. If
`check` shows the container's OpenSSL is older, use a Ceph image built
against OpenSSL ≥ 3.5. Do not copy libraries or configs into cephadm
containers: cephadm recreates containers, so the change is lost, and the
provider module must match the container's OpenSSL build. Also make sure
the image's crypto policy does not remove ML-KEM groups.

### Backend configuration (`backend/.env`)

```ini
CEPH_RGW_ENDPOINT_SECURE=https://<rgw-host>:443
# Only needed when probing through a tunnel, e.g. ssh -L 8444:localhost:443 ...
PQC_PROBE_ENDPOINT=https://127.0.0.1:8444
# ML-KEM-capable openssl (OpenSSL >= 3.5, or the wrapper from step 2)
PQC_OPENSSL_BIN=/opt/oqs/bin/openssl-oqs
```

## 6. Manual verification

```bash
# Must SUCCEED for RGW to count as PQC-capable (offers ML-KEM only):
openssl s_client -connect <rgw>:443 -groups X25519MLKEM768 -brief </dev/null
#   -> "Negotiated TLS1.3 group: X25519MLKEM768"

# If this fails with "SSL_CONF_cmd ... cannot be set", your openssl cannot
# offer ML-KEM, which says nothing about RGW. Use OpenSSL >= 3.5 or openssl-oqs.
```

Unit tests for the probe logic:

```bash
cd backend && python -m pytest tests/test_pqc_probe.py
```
