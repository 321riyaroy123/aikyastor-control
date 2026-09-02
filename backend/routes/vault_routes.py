"""
Vault-related HTTP endpoints.

This blueprint serves two distinct workflows:
- backup-vault endpoints for the local `VAULT_PATH` mirror used by object,
  block, and file backup actions
- read-only HashiCorp Vault status endpoints used by the Encryption Vault
  page to inspect the transit-backed SSE-S3 dependency
"""
import os
from flask import Blueprint, jsonify
import config.config as config
from core.logger import logger
from core.activity import log_activity
from services.vault.vault_ops import (
    get_vault_status, start_rbd_export_background, start_cephfs_sync_background
)
from services.vault.vault_health import (
    get_full_vault_status, get_vault_health, get_transit_status, get_token_status
)
import simulation.simulation as simulation

vault_bp = Blueprint("vault", __name__, url_prefix="/api")


@vault_bp.route("/vault/status", methods=["GET"])
def vault_status():
    """Get vault status"""
    try:
        if config.IS_SIMULATION:
            return jsonify(simulation.get_mock_vault())
        
        if not os.path.ismount(config.VAULT_PATH):
            return jsonify({
                "error": f"Vault is not mounted at {config.VAULT_PATH}"
            }), 503
        return jsonify(get_vault_status())
    except Exception as e:
        logger.exception("vault_status error")
        return jsonify({"error": str(e)}), 500


@vault_bp.route("/block/images/<name>/export-vault", methods=["POST"])
def api_export_rbd(name):
    """Export RBD image to vault"""
    if config.IS_SIMULATION:
        log_activity("VAULT EXPORT (RBD)", name, "info", "Simulation mode", vault=True)
        return jsonify({"message": f"RBD export of '{name}' to Vault started"})

    try:
        if not os.path.ismount(config.VAULT_PATH):
            return jsonify({
                "error": f"Vault is not mounted at {config.VAULT_PATH}"
            }), 503

        result = start_rbd_export_background(name, config.RBD_POOL)
        return jsonify(result)
    except Exception as e:
        logger.exception(f"export_rbd error for {name}")
        return jsonify({"error": str(e)}), 500


@vault_bp.route("/file/sync-vault", methods=["POST"])
def api_sync_cephfs():
    """Sync CephFS to vault"""
    if config.IS_SIMULATION:
        log_activity("VAULT SYNC (CephFS)", "entire mount", "info", "Simulation mode", vault=True)
        return jsonify({"message": "CephFS → Vault sync started"})

    try:
        if not os.path.ismount(config.VAULT_PATH):
            return jsonify({
                "error": f"Vault is not mounted at {config.VAULT_PATH}"
            }), 503

        result = start_cephfs_sync_background(config.CEPHFS_MOUNT)
        return jsonify(result), 202
    except Exception as e:
        logger.exception("sync_cephfs error")
        return jsonify({"error": str(e)}), 503


# ─── HashiCorp Vault (SSE-S3 / Transit) — read-only dashboard status ─────────
#
# Distinct from /api/vault/status above: that endpoint reports on VAULT_PATH,
# the local mount used for filesystem/RBD backup mirroring. Everything below
# talks directly to the HashiCorp Vault server backing RGW's SSE-S3
# encryption (see services/vault/vault_health.py docstring for the full
# distinction). This page is read-only by design — it cannot modify seal
# state, tokens, or keys.

@vault_bp.route("/vault/hashicorp/status", methods=["GET"])
def api_hashicorp_vault_status():
    """
    Aggregate HashiCorp Vault status for the Encryption Vault dashboard tab:
    connectivity/seal state, transit engine mount status, and dashboard
    token validity in a single response.
    """
    if config.IS_SIMULATION:
        return jsonify({
            "health": {
                "reachable": True,
                "initialized": True,
                "sealed": False,
                "standby": False,
                "version": "2.0.4",
            },
            "transit": {"mounted": True},
            "token": {"valid": True, "policies": ["default", "aikyastor-rgw"], "ttl_seconds": 3600, "renewable": True},
        })

    try:
        return jsonify(get_full_vault_status())
    except Exception as e:
        logger.exception("hashicorp_vault_status error")
        return jsonify({"error": str(e)}), 500


@vault_bp.route("/vault/hashicorp/health", methods=["GET"])
def api_hashicorp_vault_health():
    """HashiCorp Vault reachability/seal status only (unauthenticated check)."""
    if config.IS_SIMULATION:
        return jsonify({
            "reachable": True,
            "initialized": True,
            "sealed": False,
            "standby": False,
            "version": "2.0.4",
        })

    try:
        return jsonify(get_vault_health())
    except Exception as e:
        logger.exception("hashicorp_vault_health error")
        return jsonify({"error": str(e)}), 500


@vault_bp.route("/vault/hashicorp/transit", methods=["GET"])
def api_hashicorp_vault_transit():
    """Whether the transit/ secrets engine Ceph RGW depends on is mounted."""
    if config.IS_SIMULATION:
        return jsonify({"mounted": True})

    try:
        return jsonify(get_transit_status())
    except Exception as e:
        logger.exception("hashicorp_vault_transit error")
        return jsonify({"error": str(e)}), 500


@vault_bp.route("/vault/hashicorp/token", methods=["GET"])
def api_hashicorp_vault_token():
    """Metadata about the dashboard's own read-only Vault token (not RGW's)."""
    if config.IS_SIMULATION:
        return jsonify({
            "valid": True,
            "policies": ["default", "aikyastor-rgw"],
            "ttl_seconds": 3600,
            "renewable": True,
        })

    try:
        return jsonify(get_token_status())
    except Exception as e:
        logger.exception("hashicorp_vault_token error")
        return jsonify({"error": str(e)}), 500
