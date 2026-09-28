#!/usr/bin/env bash
# setup_pqc_vm.sh - check / prepare post-quantum (ML-KEM) TLS for Ceph RGW.
#
# Usage:
#   sudo ./setup_pqc_vm.sh check [rgw_host:port]   (default, read-only)
#   sudo ./setup_pqc_vm.sh build-oqs-client        build an ML-KEM-capable openssl
#                                                  wrapper under /opt/oqs
#   sudo ./setup_pqc_vm.sh gen-cert                self-signed RGW cert + cephadm hints
#
# Design rules (lessons from the first PQC attempt):
#   * Never rewrite the system /etc/ssl/openssl.cnf -- every program on the
#     host reads it. The oqsprovider config lives in /opt/oqs only.
#   * Never `docker cp` into cephadm-managed containers: the change is lost
#     whenever cephadm recreates the daemon, and the provider module
#     (oqsprovider.so) must match the container's own OpenSSL build.
#     The supported way for RGW to offer ML-KEM is an RGW image whose
#     OpenSSL is >= 3.5 (ML-KEM is built in from 3.5).
#   * TLS 1.3 is not proof of PQC. The only proof is a handshake that
#     offers ONLY an ML-KEM group and succeeds.
set -euo pipefail

OQS_PREFIX="${OQS_PREFIX:-/opt/oqs}"
LIBOQS_VERSION="${LIBOQS_VERSION:-0.12.0}"
OQS_PROVIDER_VERSION="${OQS_PROVIDER_VERSION:-0.8.0}"
PQC_GROUP="${PQC_GROUP:-X25519MLKEM768}"
CERT_OUT="${CERT_OUT:-/etc/ceph/rgw-pqc.pem}"

log()  { printf '\n== %s\n' "$*"; }
info() { printf '   %s\n' "$*"; }

container_tool() {
  if command -v podman >/dev/null 2>&1; then echo podman
  elif command -v docker >/dev/null 2>&1; then echo docker
  fi
}

# Pick an openssl that can offer ML-KEM, if any: native >= 3.5, or the
# /opt/oqs wrapper built by `build-oqs-client`.
pqc_openssl() {
  if [ -n "${OPENSSL_BIN:-}" ]; then echo "$OPENSSL_BIN"; return; fi
  if [ -x "$OQS_PREFIX/bin/openssl-oqs" ]; then echo "$OQS_PREFIX/bin/openssl-oqs"; return; fi
  echo openssl
}

handshake() {
  # $1 = openssl binary, $2 = host:port, $3 = groups
  local host="${2%:*}"
  timeout 10 "$1" s_client -connect "$2" -servername "$host" -groups "$3" -brief </dev/null 2>&1 || true
}

cmd_check() {
  local target="${1:-}"

  log "RGW daemons"
  if command -v ceph >/dev/null 2>&1; then
    ceph orch ps --daemon-type rgw 2>/dev/null || pgrep -a radosgw || info "no radosgw process found"
    log "RGW frontend configuration"
    ceph config dump 2>/dev/null | grep -E 'rgw_frontends' || info "rgw_frontends not set in the config database"
    ceph orch ls rgw --export 2>/dev/null || true
  else
    info "ceph CLI not available on this host"
  fi

  log "OpenSSL inside the RGW container (decides whether RGW can offer ML-KEM)"
  local tool cid
  tool="$(container_tool)"
  if [ -n "$tool" ]; then
    cid="$($tool ps -q --filter name=rgw | head -n1 || true)"
    if [ -n "$cid" ]; then
      $tool exec "$cid" sh -c 'rpm -q openssl-libs 2>/dev/null || dpkg -l libssl3 2>/dev/null | tail -1 || true'
      $tool exec "$cid" sh -c 'command -v openssl >/dev/null && openssl version && openssl list -kem-algorithms 2>/dev/null | grep -i mlkem || echo "   no ML-KEM KEMs listed (needs OpenSSL >= 3.5)"' || true
    else
      info "no running RGW container found"
    fi
  else
    info "no podman/docker -- RGW is not containerized here; system OpenSSL applies:"
    openssl version
  fi

  if [ -z "$target" ]; then
    info "pass rgw_host:port to run the handshake test, e.g. $0 check 127.0.0.1:443"
    return
  fi

  local bin out
  bin="$(pqc_openssl)"
  log "Handshake test against $target using: $bin ($("$bin" version 2>/dev/null || echo unknown))"

  out="$(handshake "$bin" "$target" "$PQC_GROUP")"
  if echo "$out" | grep -qiE "SSL_CONF_cmd|Error with command|cannot be set"; then
    info "UNVERIFIED: this openssl cannot offer $PQC_GROUP."
    info "Run '$0 build-oqs-client' or set OPENSSL_BIN to OpenSSL >= 3.5."
    return 2
  fi
  if echo "$out" | grep -q "Protocol version"; then
    info "PASS: RGW completed a handshake offering ONLY $PQC_GROUP."
    echo "$out" | grep -E "Protocol version|Ciphersuite|Negotiated TLS1.3 group|Temp Key" | sed 's/^/   /'
  else
    info "FAIL: RGW rejected a handshake offering only $PQC_GROUP (or was unreachable):"
    echo "$out" | tail -3 | sed 's/^/   /'
    return 1
  fi

  log "What a modern client gets ($PQC_GROUP preferred, classical fallback)"
  handshake "$bin" "$target" "$PQC_GROUP:X25519:secp256r1" \
    | grep -E "Protocol version|Negotiated TLS1.3 group|Temp Key" | sed 's/^/   /' || true
}

cmd_build_oqs_client() {
  log "Building liboqs $LIBOQS_VERSION + oqs-provider $OQS_PROVIDER_VERSION into $OQS_PREFIX"
  apt-get update
  apt-get install -y cmake ninja-build libssl-dev build-essential git pkg-config

  local build
  build="$(mktemp -d)"
  trap 'rm -rf "$build"' EXIT

  git clone --depth 1 -b "$LIBOQS_VERSION" https://github.com/open-quantum-safe/liboqs.git "$build/liboqs"
  cmake -S "$build/liboqs" -B "$build/liboqs/_build" -GNinja \
    -DCMAKE_INSTALL_PREFIX="$OQS_PREFIX" -DBUILD_SHARED_LIBS=OFF -DCMAKE_POSITION_INDEPENDENT_CODE=ON
  cmake --build "$build/liboqs/_build"
  cmake --install "$build/liboqs/_build"

  git clone --depth 1 -b "$OQS_PROVIDER_VERSION" https://github.com/open-quantum-safe/oqs-provider.git "$build/oqs-provider"
  cmake -S "$build/oqs-provider" -B "$build/oqs-provider/_build" \
    -Dliboqs_DIR="$OQS_PREFIX/lib/cmake/liboqs"
  cmake --build "$build/oqs-provider/_build"
  install -D -m 0755 "$build/oqs-provider/_build/lib/oqsprovider.so" \
    "$OQS_PREFIX/lib/ossl-modules/oqsprovider.so"

  # Private config: default provider + oqsprovider. The system
  # /etc/ssl/openssl.cnf is left untouched.
  cat > "$OQS_PREFIX/openssl-oqs.cnf" <<EOF
openssl_conf = openssl_init

[openssl_init]
providers = provider_sect

[provider_sect]
default = default_sect
oqsprovider = oqsprovider_sect

[default_sect]
activate = 1

[oqsprovider_sect]
module = $OQS_PREFIX/lib/ossl-modules/oqsprovider.so
activate = 1
EOF

  install -d "$OQS_PREFIX/bin"
  cat > "$OQS_PREFIX/bin/openssl-oqs" <<EOF
#!/bin/sh
# openssl with oqsprovider loaded -- use as PQC_OPENSSL_BIN for the backend.
OPENSSL_CONF="$OQS_PREFIX/openssl-oqs.cnf" exec openssl "\$@"
EOF
  chmod 0755 "$OQS_PREFIX/bin/openssl-oqs"

  log "Providers visible to $OQS_PREFIX/bin/openssl-oqs"
  "$OQS_PREFIX/bin/openssl-oqs" list -providers
  info "Set PQC_OPENSSL_BIN=$OQS_PREFIX/bin/openssl-oqs in backend/.env"
}

cmd_gen_cert() {
  log "Generating self-signed RGW certificate at $CERT_OUT"
  local host ip tmp
  host="$(hostname)"
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  ip="${ip:-127.0.0.1}"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  cat > "$tmp/san.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = v3_req
prompt = no
[dn]
O = AiKyaStor
CN = $host
[v3_req]
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:localhost, DNS:$host, IP:127.0.0.1, IP:$ip
EOF

  openssl req -x509 -nodes -days 825 -newkey rsa:3072 \
    -keyout "$tmp/rgw.key" -out "$tmp/rgw.crt" -config "$tmp/san.cnf" -extensions v3_req
  install -d -m 0755 "$(dirname "$CERT_OUT")"
  cat "$tmp/rgw.crt" "$tmp/rgw.key" > "$CERT_OUT"
  chmod 0600 "$CERT_OUT"

  info "Certificate + key written to $CERT_OUT (mode 0600)."
  info "Note: the certificate signature (RSA) is classical; ML-KEM protects the"
  info "session keys against harvest-now-decrypt-later, not authentication."
  cat <<EOF

   cephadm-managed RGW: apply SSL through the service spec, not ceph.conf:

     service_type: rgw
     service_id: <your-rgw-service>
     placement: { hosts: [ $host ] }
     spec:
       ssl: true
       rgw_frontend_port: 443
       rgw_frontend_ssl_certificate: |
         <paste the contents of $CERT_OUT>

     ceph orch apply -i rgw-spec.yaml

   Then verify:  $0 check $ip:443
EOF
}

case "${1:-check}" in
  check) shift || true; cmd_check "${1:-}" ;;
  build-oqs-client) cmd_build_oqs_client ;;
  gen-cert) cmd_gen_cert ;;
  *) echo "usage: $0 {check [host:port]|build-oqs-client|gen-cert}" >&2; exit 64 ;;
esac
