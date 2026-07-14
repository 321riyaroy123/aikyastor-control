"""
routes/vault_routes.py - Vault Backup Blueprint

Moved from: app.py
    - GET  /api/vault/status
    - POST /api/block/images/<name>/export-vault
    - POST /api/file/sync-vault

Responsibility:
    Thin HTTP layer for vault mount status and the two "bulk" vault
    operations (RBD export, full CephFS sync). The bucket-level
    sync-vault endpoint lives in object_routes.py since it's namespaced
    under /api/object/ in the original app — kept there to avoid
    changing any URL.
"""

from flask import Blueprint, jsonify
import config.config as config
from core.logger import logger
from core.activity import log_activity
from services.vault.vault_ops import (
    get_vault_status, start_rbd_export_background, start_cephfs_sync_background
)
import simulation.simulation as simulation

vault_bp = Blueprint("vault", __name__, url_prefix="/api")


@vault_bp.route("/vault/status", methods=["GET"])
def vault_status():
    """Get vault status"""
    try:
        if config.IS_SIMULATION:
            return jsonify(simulation.get_mock_vault())
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
        result = start_cephfs_sync_background(config.CEPHFS_MOUNT)
        return jsonify(result)
    except Exception as e:
        logger.exception("sync_cephfs error")
        return jsonify({"error": str(e)}), 500