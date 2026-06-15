"""
config.py - Application configuration
Loads settings from environment variables; no secrets are hardcoded.
"""

import os

# ─── App Mode ──────────────────────────────────────────────────────────────
APP_MODE = os.environ.get("APP_MODE", "simulation")
IS_SIMULATION = APP_MODE.lower() == "simulation"

def get_app_mode() -> str:
    return APP_MODE

# ─── Flask ─────────────────────────────────────────────────────────────────
FLASK_HOST = os.environ.get("FLASK_HOST", "0.0.0.0")
FLASK_PORT = int(os.environ.get("FLASK_PORT", "5000"))
FLASK_DEBUG = os.environ.get("FLASK_DEBUG", "false").lower() == "true"

# ─── Logging ───────────────────────────────────────────────────────────────
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
LOG_FORMAT = os.environ.get("LOG_FORMAT", "standard")

# ─── Ceph ──────────────────────────────────────────────────────────────────
CEPH_CONF = os.environ.get("CEPH_CONF", "/etc/ceph/ceph.conf")
CMD_TIMEOUT = int(os.environ.get("CMD_TIMEOUT", "30"))
RBD_POOL = os.environ.get("RBD_POOL", "rbd")

# ─── RGW / S3 ──────────────────────────────────────────────────────────────
CEPH_RGW_ENDPOINT = os.environ.get("CEPH_RGW_ENDPOINT", "")
CEPH_REGION = os.environ.get("CEPH_REGION", "default")

# Credentials must be supplied via environment / .env — no insecure defaults.
CEPH_ACCESS_KEY = os.environ.get("CEPH_ACCESS_KEY")
CEPH_SECRET_KEY = os.environ.get("CEPH_SECRET_KEY")

if not IS_SIMULATION and (not CEPH_ACCESS_KEY or not CEPH_SECRET_KEY):
    raise RuntimeError(
        "CEPH_ACCESS_KEY and CEPH_SECRET_KEY must be set via environment "
        "variables (e.g. in a .env file) when running outside simulation mode."
    )

# ─── CephFS ────────────────────────────────────────────────────────────────
CEPHFS_MOUNT = os.environ.get("CEPHFS_MOUNT", "/mnt/cephfs")

# ─── Vault ─────────────────────────────────────────────────────────────────
VAULT_PATH = os.environ.get("VAULT_PATH", "/vault")
