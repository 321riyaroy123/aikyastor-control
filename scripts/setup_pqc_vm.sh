#!/bin/bash
set -e

apt-get update
apt-get install -y cmake ninja-build libssl-dev build-essential git pkg-config

mkdir -p /tmp/oqs_build
cd /tmp/oqs_build

git clone --depth 1 -b 0.12.0 https://github.com/open-quantum-safe/liboqs.git
cd liboqs
mkdir build && cd build
cmake -GNinja -DBUILD_SHARED_LIBS=ON -DCMAKE_INSTALL_PREFIX=/usr/local ..
ninja
ninja install
ldconfig

cd /tmp/oqs_build
git clone --depth 1 -b 0.8.0 https://github.com/open-quantum-safe/oqs-provider.git
cd oqs-provider
cmake -S . -B _build -DCMAKE_INSTALL_PREFIX=/usr/local -DOPENSSL_ROOT_DIR=/usr
cmake --build _build
cmake --install _build

python3 -c "
with open('/etc/ssl/openssl.cnf', 'r') as f:
    c = f.read()
if 'openssl_conf = openssl_init' not in c:
    c = 'openssl_conf = openssl_init\n' + c
if '[openssl_init]' not in c:
    c += '\n[openssl_init]\nproviders = provider_sect\n'
p = '''[provider_sect]
default = default_sect
oqsprovider = oqsprovider_sect

[default_sect]
activate = 1

[oqsprovider_sect]
activate = 1
'''
import re
if '[provider_sect]' in c:
    c = re.sub(r'\[provider_sect\].*?(\n\[|\Z)', p + '\n', c, flags=re.DOTALL)
else:
    c += '\n' + p
with open('/etc/ssl/openssl.cnf', 'w') as f:
    f.write(c)
"

VM_HOST=$(hostname)
VM_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")

mkdir -p /etc/ceph
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

openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout /tmp/rgw.key -out /tmp/rgw.crt -config /tmp/rgw_san.cnf -extensions v3_req
cat /tmp/rgw.crt /tmp/rgw.key > /etc/ceph/rgw.pem
chmod 644 /etc/ceph/rgw.pem

CONTAINER_TOOL=""
if command -v docker &>/dev/null; then
  CONTAINER_TOOL="docker"
elif command -v podman &>/dev/null; then
  CONTAINER_TOOL="podman"
fi

if [ -n "$CONTAINER_TOOL" ]; then
  CID=$($CONTAINER_TOOL ps -q --filter name=rgw | head -n 1 || true)
  if [ -n "$CID" ]; then
    $CONTAINER_TOOL cp /usr/local/lib/liboqs.so.0.12.0 "$CID:/usr/lib64/" 2>/dev/null || true
    $CONTAINER_TOOL cp /usr/local/lib/liboqs.so.7 "$CID:/usr/lib64/" 2>/dev/null || true
    $CONTAINER_TOOL cp /usr/local/lib/liboqs.so "$CID:/usr/lib64/" 2>/dev/null || true
    $CONTAINER_TOOL exec "$CID" ldconfig 2>/dev/null || true
    $CONTAINER_TOOL cp /etc/ssl/openssl.cnf "$CID:/etc/pki/tls/openssl.cnf" 2>/dev/null || true
  fi
fi

rm -rf /tmp/oqs_build /tmp/rgw_san.cnf /tmp/rgw.crt /tmp/rgw.key

openssl list -providers
