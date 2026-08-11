"""
config/config.py - Configuration management with .env support

Moved from: config.py (project root)

Responsibility:
    Single source of truth for all environment-driven settings
    (app mode, Flask host/port, Ceph/RGW credentials, CephFS mount,
    RBD pool, vault path, logging, and command timeouts).

Behavior preserved exactly from the original config.py:
    - APP_MODE defaults to "simulation"; IS_SIMULATION is derived from it.
    - Outside simulation mode, CEPH_ACCESS_KEY and CEPH_SECRET_KEY are
      REQUIRED and the app refuses to start (RuntimeError) if missing.
      There are no built-in default/hardcoded credentials.
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

# ─── Ceph RGW (S3) Configuration ─────────────────────────────────────────────
CEPH_RGW_ENDPOINT = os.getenv("CEPH_RGW_ENDPOINT", "http://192.168.29.252:80")
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

# ─── Vault Configuration ─────────────────────────────────────────────────────
VAULT_PATH = os.getenv("VAULT_PATH", "/vault")

# ─── Logging ──────────────────────────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.getenv("LOG_FORMAT", "standard")

# ─── Command Execution ────────────────────────────────────────────────────────
CMD_TIMEOUT = int(os.getenv("CMD_TIMEOUT", "30"))