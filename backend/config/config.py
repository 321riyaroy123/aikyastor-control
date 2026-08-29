"""
Centralized runtime configuration for AiKyaStor CONTROL.

This module loads environment-backed settings for Flask, Ceph RGW,
CephFS, RBD, the backup vault mount, HashiCorp Vault status checks,
replication, logging, and command execution timeouts.

Outside simulation mode the app refuses to start unless both Ceph
credentials and the HashiCorp Vault dashboard token are provided.
"""

import os
from dotenv import load_dotenv
 
load_dotenv()
 
# ─── Application Mode ────────────────────────────────────────────────────────
APP_MODE = os.getenv("APP_MODE", "simulation")
IS_SIMULATION = APP_MODE.lower() == "simulation"
 
def get_app_mode() -> str:
    """Return the current application mode string."""
    return APP_MODE
 
# ─── Flask Configuration ─────────────────────────────────────────────────────
FLASK_DEBUG = os.getenv("FLASK_DEBUG", "false").lower() == "true"
FLASK_HOST = os.getenv("FLASK_HOST", "0.0.0.0")
FLASK_PORT = int(os.getenv("FLASK_PORT", "5000"))
# Dev server only (app.py's __main__ block). Ignored entirely when running
# behind a real WSGI server (gunicorn/uwsgi), where concurrency is controlled
# by worker/thread count on the command line instead. Left True by default
# because a single blocking replication SSH call must never be able to
# freeze every other unrelated endpoint (bucket list, cluster stats, etc.)
# on the one and only request-handling thread.
FLASK_THREADED = os.getenv("FLASK_THREADED", "true").lower() == "true"
 
# ─── Ceph RGW (S3) Configuration ─────────────────────────────────────────────
CEPH_RGW_ENDPOINT = os.getenv("CEPH_RGW_ENDPOINT", "http://192.168.29.252:80")
CEPH_RGW_ENDPOINT_SECURE = os.getenv("CEPH_RGW_ENDPOINT_SECURE", "https://192.168.56.110:443")
CEPH_ACCESS_KEY = os.getenv("CEPH_ACCESS_KEY", "")
CEPH_SECRET_KEY = os.getenv("CEPH_SECRET_KEY", "")
CEPH_REGION = os.getenv("CEPH_REGION", "us-east-1")
 
# No hardcoded credentials: outside simulation mode, both keys are mandatory.
if not IS_SIMULATION and (not CEPH_ACCESS_KEY or not CEPH_SECRET_KEY):
    raise RuntimeError(
        "CEPH_ACCESS_KEY and CEPH_SECRET_KEY must be set via environment "
        "variables when APP_MODE != simulation. There are no default "
        "credentials for production mode."
    )
 
# ─── Ceph Storage Configuration ──────────────────────────────────────────────
CEPHFS_MOUNT = os.getenv("CEPHFS_MOUNT", "/mnt/cephfs")
RBD_POOL = os.getenv("RBD_POOL", "rbd")
CEPH_CONF = os.getenv("CEPH_CONF", "/etc/ceph/ceph.conf")
 
# ─── Vault Configuration (CephFS mirror vault — file/RBD backups) ────────────
VAULT_PATH = os.getenv("VAULT_PATH", "/vault")
 
# ─── HashiCorp Vault Configuration (direct API — encryption backend) ────────
# This is a SEPARATE Vault connection from VAULT_PATH above. VAULT_PATH is
# a local mount used for filesystem/RBD backup mirroring (see
# services/vault/vault_ops.py). VAULT_ADDR/VAULT_TOKEN below are for the
# Flask app to talk directly to the HashiCorp Vault server that backs
# Ceph RGW's SSE-S3 encryption (Transit secrets engine), used only by the
# read-only Vault health/status dashboard tab.
#
# This should be a narrowly-scoped, read-only token (e.g. read access to
# sys/health and transit/keys/*) — NOT the same token provisioned into
# RGW's container, and NEVER the Vault root token.
HASHICORP_VAULT_ADDR = os.getenv("HASHICORP_VAULT_ADDR", "http://127.0.0.1:8200")
HASHICORP_VAULT_TOKEN = os.getenv("HASHICORP_VAULT_TOKEN", "")
 
# No hardcoded credentials: outside simulation mode, a Vault token is
# mandatory if the app is expected to report real Vault health/status.
if not IS_SIMULATION and not HASHICORP_VAULT_TOKEN:
    raise RuntimeError(
        "HASHICORP_VAULT_TOKEN must be set via environment variables when "
        "APP_MODE != simulation. There is no default credential for "
        "production mode. Use a narrowly-scoped, read-only Vault token — "
        "not the RGW integration token, and never the Vault root token."
    )
 
# ─── Logging ──────────────────────────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.getenv("LOG_FORMAT", "standard")
 
# ─── Command Execution ────────────────────────────────────────────────────────
CMD_TIMEOUT = int(os.getenv("CMD_TIMEOUT", "30"))
 
REPLICATION_SECONDARY_HOST = os.getenv(
    "REPLICATION_SECONDARY_HOST",
    ""
)
 
REPLICATION_SECONDARY_USER = os.getenv(
    "REPLICATION_SECONDARY_USER",
    ""
)
 
# ─── Replication (RGW multisite) SSH / resiliency tuning ─────────────────────
REPLICATION_SSH_CONNECT_TIMEOUT = int(
    os.getenv("REPLICATION_SSH_CONNECT_TIMEOUT", "5")
)

REPLICATION_SSH_TIMEOUT = int(
    os.getenv("REPLICATION_SSH_TIMEOUT", "20")
)
 
REPLICATION_SSH_SNAPSHOT_TIMEOUT = int(
    os.getenv("REPLICATION_SSH_SNAPSHOT_TIMEOUT", "45")
)

REPLICATION_CIRCUIT_BREAKER_COOLDOWN = int(
    os.getenv("REPLICATION_CIRCUIT_BREAKER_COOLDOWN", "30")
)
 
