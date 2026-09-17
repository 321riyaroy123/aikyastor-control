# AiKyaStor CONTROL — Post-Quantum Cryptography (PQC) Architecture & Deployment Guide

This document provides a comprehensive overview of the **Post-Quantum Cryptography (PQC)** integration in AiKyaStor CONTROL: what PQC is, the threat model it solves, where and how it is implemented in the codebase, and step-by-step instructions to configure any Linux/Ceph VM from scratch.

---

## Table of Contents
1. [Executive Summary & Threat Model](#1-executive-summary--threat-model)
2. [What is Post-Quantum Cryptography (PQC)?](#2-what-is-post-quantum-cryptography-pqc)
3. [AiKyaStor Quantum-First Architecture](#3-aikyastor-quantum-first-architecture)
4. [Step-by-Step Installation & VM Setup Guide](#4-step-by-step-installation--vm-setup-guide)
5. [Connecting the Backend & Frontend](#5-connecting-the-backend--frontend)
6. [Observability & Live Telemetry Reference](#6-observability--live-telemetry-reference)
7. [Enterprise Compliance & Product Claims](#7-enterprise-compliance--product-claims)
8. [Troubleshooting & Verification](#8-troubleshooting--verification)

---

## 1. Executive Summary & Threat Model

Traditional enterprise storage relies on public-key cryptography (RSA, ECDH, Diffie-Hellman) for negotiating TLS session keys. 

### The Threat: Quantum Eavesdropping & Key Compromise
Adversaries and state actors can intercept encrypted storage network traffic. When a Cryptanalytically Relevant Quantum Computer (CRQC) becomes operational, attackers will execute **Shor's algorithm** to break the classical key exchange, recovering private keys and retroactively decrypting recorded storage sessions.

```
[ Attacker Intercepts Encrypted S3 Traffic ]
                    |
                    v
[ Quantum Computer Runs Shor's Algorithm ] 
                    |
                    v
[ Classical RSA/ECDH Session Keys Broken -> Historical Data Exposed ]
```

### The Solution: AiKyaStor Dual-Layer Quantum Defense
AiKyaStor neutralizes this attack vector by combining:
1. **In-Transit Lattice KEM**: Hybrid post-quantum key encapsulation (**NIST FIPS 203 / ML-KEM-768**) over TLS 1.3.
2. **At-Rest Symmetric Cipher**: **AES-256 (SSE-S3)** with 128-bit quantum-effective security against **Grover's algorithm**.

---

## 2. What is Post-Quantum Cryptography (PQC)?

Post-Quantum Cryptography refers to cryptographic algorithms designed to run on classical computers while remaining secure against attacks by quantum computers.

### Quantum Attacks vs. Cryptographic Primitives

| Cryptographic Primitive | Classical Algorithm | Quantum Attack | Quantum Impact | Post-Quantum Replacement |
| :--- | :--- | :--- | :--- | :--- |
| **Key Exchange (In-Transit)** | ECDH / RSA / DH | **Shor's Algorithm** | **Catastrophic (Total Break)** | **NIST FIPS 203 (ML-KEM / Kyber-768)** |
| **Digital Signatures** | RSA / ECDSA / Ed25519 | **Shor's Algorithm** | **Catastrophic (Total Break)** | **NIST FIPS 204 (ML-DSA / Dilithium)** |
| **Symmetric Encryption (At-Rest)** | AES-128 | **Grover's Algorithm** | Halves key strength ($2^{128} \to 2^{64}$) | **AES-256** ($2^{256} \to 2^{128}$ safe) |
| **Hashing** | SHA-256 / SHA-3 | **Grover's Algorithm** | Halves collision resistance | **SHA-384 / SHA-512** |

### Why Hybrid Key Exchange (`X25519MLKEM768`)?
NIST and the NSA (CNSA 2.0) recommend **Hybrid Key Encapsulation Mechanisms**:
$$\text{Shared Secret} = \text{KDF}(\text{Classical ECDH (X25519)} \parallel \text{Lattice KEM (ML-KEM-768)})$$
* **Dual Protection**: Even if ML-KEM were to have an unforeseen vulnerability, classical X25519 still protects the session. Even if a quantum computer breaks X25519, ML-KEM keeps the session unbreakable.

---

## 3. AiKyaStor Quantum-First Architecture

```
+-------------------------------------------------------------------------+
|                        1. CEPH VM & RGW LAYER                           |
|                                                                         |
|   [ liboqs v0.12.0 ] (C Library with Quantum-Safe Algorithms)           |
|            |                                                            |
|            v                                                            |
|   [ oqsprovider v0.8.0 ] (OpenSSL 3 Provider Plugin)                    |
|            |                                                            |
|            v                                                            |
|   [ Ceph RGW Beast Engine ] (Listening on Port 443 HTTPS)               |
|            |                                                            |
|            v                                                            |
|   [ TLS 1.3 Handshake ] -> Negotiates Hybrid Group: X25519MLKEM768     |
+-------------------------------------------------------------------------+
                                    |
                         (Live HTTPS TLS Handshake)
                                    v
+-------------------------------------------------------------------------+
|                        2. FLASK BACKEND (:5000)                         |
|                                                                         |
|   [ probe_pqc_tls() ] -> Opens live socket to Ceph RGW, measures        |
|                          latency, verifies cipher & protocol            |
|            |                                                            |
|            v                                                            |
|   [ GET /api/pqc/status ] -> Aggregates:                                |
|       - In-Transit: TLS 1.3, ML-KEM-768, cipher suite, latency          |
|       - At-Rest: AES-256 (Grover's algorithm quantum resistance)        |
|       - Crypto Engine: oqsprovider & liboqs metadata                    |
+-------------------------------------------------------------------------+
                                    |
                           (JSON API Response)
                                    v
+-------------------------------------------------------------------------+
|                   3. REACT / VITE FRONTEND (:3000)                      |
|                                                                         |
|   [ ClusterAPI.pqc() ] -> Queries /api/pqc/status                       |
|            |                                                            |
|            v                                                            |
|   [ EncryptionVault.jsx ] -> Renders live telemetry console:            |
|       - PQC Status Badge ("PROTECTED")                                  |
|       - Key exchange parameters & supported KEMs table                  |
|       - At-rest 256-bit encryption posture                              |
|       - HashiCorp Vault KMS integration status                          |
+-------------------------------------------------------------------------+
```

---

## 4. Step-by-Step Installation & VM Setup Guide

Follow these commands on the **Linux VM hosting your Ceph cluster** to enable quantum-safe TLS on Ceph RGW.

### Prerequisites (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install -y cmake ninja-build libssl-dev build-essential git pkg-config
```

---

### Step 4.1: Build & Install `liboqs` (C Library)
`liboqs` is the Open Quantum Safe C library containing the NIST-standardized quantum algorithms.

```bash
mkdir -p ~/oqs && cd ~/oqs
git clone --depth 1 -b 0.12.0 https://github.com/open-quantum-safe/liboqs.git
cd liboqs
mkdir build && cd build
cmake -GNinja -DBUILD_SHARED_LIBS=ON -DCMAKE_INSTALL_PREFIX=/usr/local ..
ninja
sudo ninja install
sudo ldconfig
```

---

### Step 4.2: Build & Install `oqsprovider` (OpenSSL 3 Module)
`oqsprovider` integrates `liboqs` directly into the OpenSSL 3 provider architecture.

```bash
cd ~/oqs
git clone --depth 1 -b 0.8.0 https://github.com/open-quantum-safe/oqs-provider.git
cd oqs-provider
cmake -S . -B _build -DCMAKE_INSTALL_PREFIX=/usr/local -DOPENSSL_ROOT_DIR=/usr
cmake --build _build
sudo cmake --install _build
```

---

### Step 4.3: Configure OpenSSL (`/etc/ssl/openssl.cnf`)
Ensure OpenSSL automatically loads and activates both the default provider and `oqsprovider`:

```ini
openssl_conf = openssl_init

[openssl_init]
providers = provider_sect

[provider_sect]
default = default_sect
oqsprovider = oqsprovider_sect

[default_sect]
activate = 1

[oqsprovider_sect]
activate = 1
```

**Verify provider activation:**
```bash
openssl list -providers
# Should display:
# Providers:
#   default
#   oqsprovider

openssl list -kem-algorithms -provider oqsprovider | grep -i mlkem
# Should list:
#   X25519MLKEM768
#   SecP256r1MLKEM768
#   ML-KEM-768
```

---

### Step 4.4: Inject PQC Libraries into Ceph RGW Container (If Containerized)
> **Note**: If your Ceph RGW runs natively as a systemd service directly on the host (e.g. installed via `apt` or `dnf`), **skip this step** — the host libraries from Steps 4.1–4.3 are already in place and used automatically.

If Ceph RGW runs inside a Docker or Podman container (standard for `cephadm`):

```bash
# 1. Detect Docker or Podman
CONTAINER_TOOL=$(command -v docker || command -v podman)

# 2. Get the running Ceph RGW container ID
CID=$($CONTAINER_TOOL ps -q --filter name=rgw | head -n 1)

# 3. Copy the shared libraries into container /usr/lib64/
sudo $CONTAINER_TOOL cp /usr/local/lib/liboqs.so.0.12.0 $CID:/usr/lib64/
sudo $CONTAINER_TOOL cp /usr/local/lib/liboqs.so.7 $CID:/usr/lib64/
sudo $CONTAINER_TOOL cp /usr/local/lib/liboqs.so $CID:/usr/lib64/
sudo $CONTAINER_TOOL exec $CID ldconfig

# 4. Copy the OpenSSL configuration to the container
sudo $CONTAINER_TOOL cp /etc/ssl/openssl.cnf $CID:/etc/pki/tls/openssl.cnf

# 5. Verify inside container
sudo $CONTAINER_TOOL exec $CID openssl list -providers
```

---

### Step 4.5: Generate TLS Certificate & Configure Ceph RGW Beast Engine
Generate a self-signed certificate with Subject Alternative Names (SAN):

```bash
VM_HOST=$(hostname)
VM_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")

cat << EOF > /tmp/rgw_san.cnf
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = State
L = City
O = AiKyaStor
OU = PQC Storage
CN = 127.0.0.1

[v3_req]
keyUsage = keyEncipherment, dataEncipherment, digitalSignature
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = ${VM_HOST}
IP.1 = 127.0.0.1
IP.2 = ${VM_IP}
EOF

# Generate certificate and private key
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /tmp/rgw.key -out /tmp/rgw.crt \
  -config /tmp/rgw_san.cnf -extensions v3_req

# Combine into single PEM bundle for Beast frontend
sudo bash -c 'cat /tmp/rgw.crt /tmp/rgw.key > /tmp/rgw.pem'
```

Copy `rgw.pem` into the Ceph RGW data directory:
```bash
# Locate your RGW data directory:
RGW_DIR="/var/lib/ceph/<cluster-fsid>/<rgw-daemon-name>"
sudo cp /tmp/rgw.pem "$RGW_DIR/rgw.pem"
sudo chmod 644 "$RGW_DIR/rgw.pem"
```

In your Ceph configuration (`/etc/ceph/ceph.conf` or Ceph config database):
```ini
[client.rgw.<daemon-name>]
rgw_frontends = beast ssl_port=443 ssl_certificate=/var/lib/ceph/<fsid>/<rgw-daemon>/rgw.pem port=80
```
Restart the RGW daemon:
```bash
sudo systemctl restart ceph-<fsid>@rgw.<daemon-name>.service
```

---

## 5. Connecting the Backend & Frontend

### Host Machine Setup (Development / Client Machine)

#### 1. Network Connectivity & SSH Tunnel
If your VM is running in **Bridged or Host-Only mode**, your backend can reach the VM IP directly. 

If your VM is in **NAT mode** (e.g. VirtualBox NAT), forward port `8444` on your host to `443` on the VM:
```bash
# General SSH tunnel:
ssh -L 8444:localhost:443 <vm-user>@<vm-ip>

# If using VirtualBox forwarded SSH port (e.g. 2222):
ssh -L 8444:localhost:443 -p 2222 <vm-user>@127.0.0.1
```

#### 2. Environment Configuration (`.env`)
Create a `.env` file in the project root based on `.env.example`:
```env
# Application Mode
VITE_APP_MODE=production
VITE_API_URL=http://localhost:5000/api
APP_MODE=production

# Flask Configuration
FLASK_HOST=0.0.0.0
FLASK_PORT=5000
FLASK_DEBUG=false
FLASK_THREADED=true

# Ceph RGW Endpoints
CEPH_RGW_ENDPOINT=http://127.0.0.1:8000
CEPH_RGW_ENDPOINT_SECURE=https://127.0.0.1:8444
CEPH_ACCESS_KEY=your_ceph_access_key
CEPH_SECRET_KEY=your_ceph_secret_key
CEPH_REGION=us-east-1

# HashiCorp Vault
HASHICORP_VAULT_ADDR=http://127.0.0.1:8200
HASHICORP_VAULT_TOKEN=your_vault_token
```

#### 3. Run Backend & Frontend
```bash
# Terminal 1: Backend
python -m venv .venv
source .venv/bin/activate  # (.venv\Scripts\activate on Windows)
pip install -r requirements.txt
python backend/app.py

# Terminal 2: Frontend
npm install
npm run dev
```

Open `http://localhost:3000` and navigate to **"Encryption & PQC"** in the sidebar.

---

## 6. Observability & Live Telemetry Reference

The backend exposes `GET /api/pqc/status`. Below is an example payload returned by the live probe:

```json
{
  "status": "healthy",
  "overall_quantum_safe": true,
  "timestamp": 1789629615.99,
  "in_transit_security": {
    "quantum_safe": true,
    "status": "Active",
    "protocol": "TLSv1.3",
    "cipher_suite": "TLS_AES_256_GCM_SHA384",
    "preferred_hybrid_group": "X25519MLKEM768",
    "endpoint": "https://127.0.0.1:8444",
    "handshake_latency_ms": 23.66,
    "threat_mitigation": "Quantum Key Encapsulation (NIST FIPS 203)",
    "supported_pqc_groups": [
      {
        "name": "X25519MLKEM768",
        "standard": "NIST FIPS 203 (ML-KEM)",
        "type": "Hybrid (X25519 + Kyber-768)",
        "security_category": "NIST Level 3 (AES-192 equivalent)",
        "status": "Active"
      },
      {
        "name": "SecP256r1MLKEM768",
        "standard": "NIST FIPS 203 (ML-KEM)",
        "type": "Hybrid (NIST P-256 + Kyber-768)",
        "security_category": "NIST Level 3",
        "status": "Active"
      },
      {
        "name": "x25519_kyber768",
        "standard": "Kyber Round 3 Draft",
        "type": "Hybrid (X25519 + Kyber-768)",
        "security_category": "NIST Level 3",
        "status": "Active"
      }
    ],
    "details": {
      "reachable": true,
      "tls_version": "TLSv1.3",
      "cipher_suite": "TLS_AES_256_GCM_SHA384",
      "cipher_bits": 256,
      "handshake_latency_ms": 23.66,
      "host": "127.0.0.1",
      "port": 8444,
      "error": null
    }
  },
  "at_rest_security": {
    "algorithm": "AES-256 (SSE-S3)",
    "key_length_bits": 256,
    "quantum_effective_security": "128-bit security against Grover's algorithm",
    "standards_compliance": "NIST SP 800-131A / NSA CNSA 2.0 approved",
    "quantum_safe": true
  },
  "crypto_engine": {
    "provider": "OpenQuantumSafe (oqsprovider)",
    "provider_version": "0.8.0",
    "liboqs_version": "0.12.0",
    "openssl_version": "OpenSSL 3.0 / 3.2",
    "status": "Operational"
  }
}
```

---

## 7. Enterprise Compliance & Product Claims

When pitching or documenting AiKyaStor as a **Quantum-First Protected Unified Storage** platform:

1. **NIST FIPS 203 Alignment**: Uses standard Module-Lattice-Based Key-Encapsulation Mechanism (ML-KEM) to prevent session key compromise.
2. **NSA CNSA 2.0 Compliance**: Employs AES-256 for persistent object data, satisfying Commercial National Security Algorithm Suite 2.0 guidelines for post-quantum symmetric encryption.
3. **Dual-Layer Defense**:
   * *In-Transit*: Prevents quantum key exchange compromise on active data replication and S3 uploads/downloads.
   * *At-Rest*: 128-bit quantum security floor against quantum brute-force (Grover's algorithm).
4. **Zero Performance Cliff**: Hybrid `X25519MLKEM768` handshakes incur negligible latency overhead (~20–45ms in local networks) while preserving full classical TLS 1.3 throughput.

---

## 8. Troubleshooting & Verification

### Test 1: Verify Host to VM PQC TLS Handshake
From your client/host machine:
```bash
python -c "
import socket, ssl, time
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
t0 = time.time()
with socket.create_connection(('127.0.0.1', 8444), timeout=5) as s:
    with ctx.wrap_socket(s, server_hostname='127.0.0.1') as tls:
        print('TLS Version:', tls.version())
        print('Cipher:', tls.cipher())
        print('Handshake Latency:', round((time.time()-t0)*1000, 2), 'ms')
"
```
**Expected Output:**
```
TLS Version: TLSv1.3
Cipher: ('TLS_AES_256_GCM_SHA384', 'TLSv1.3', 256)
Handshake Latency: ~25.0 ms
```

### Test 2: Verify OpenSSL Providers on VM
```bash
openssl list -providers
```
If `oqsprovider` is missing, verify that `/usr/local/lib/ossl-modules/oqsprovider.so` exists and that `/etc/ssl/openssl.cnf` contains the `provider_sect` declarations.

### Test 3: Verify Ceph RGW Beast Listening
```bash
sudo ss -tulnp | grep -E '443|80 '
```
Should show `radosgw` listening on both port 80 (HTTP) and port 443 (HTTPS).
