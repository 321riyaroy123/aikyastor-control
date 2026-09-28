"""
routes/pqc_routes.py - Post-Quantum Cryptography (PQC) telemetry Blueprint

    - GET /api/pqc/status   in-transit: negotiated TLS key-exchange group on
                            the RGW HTTPS endpoint (see pqc_probe.py), plus
                            the transport of every path the backend uses.
                            ?refresh=1 bypasses the cache.
    - GET /api/pqc/posture  at-rest + Ceph-internal: per-bucket SSE, Vault
                            KMS status, msgr2 modes (see crypto_posture.py).
    - GET /api/pqc/messenger  msgr2 modes only -- cheap, for the Block and
                            File pages (RBD/CephFS traffic is msgr2, not TLS).

All are read-only. None ever reports quantum-safe from TLS 1.3 alone.
"""
import time
from flask import Blueprint, jsonify, request

import config.config as config
from core.logger import logger
from services.security.pqc_probe import get_transit_status
from services.security.crypto_posture import get_crypto_posture, get_messenger_modes, simulated_posture

pqc_bp = Blueprint("pqc", __name__, url_prefix="/api")


def _simulated_transit():
    group = config.PQC_EXPECTED_GROUP
    return {
        "status": "pqc_verified",
        "reason": f"Simulation: RGW negotiated {group}.",
        "pqc_verified": True,
        "expected_group": group,
        "negotiated_group": group,
        "negotiated_group_family": "ml-kem",
        "endpoint": "https://simulation:443",
        "rgw_tls": {
            "reachable": True, "tls_version": "TLSv1.3", "cipher_suite": "TLS_AES_256_GCM_SHA384",
            "cipher_bits": 256, "connect_and_handshake_ms": 12.5, "cert_verified": False, "error": None,
        },
        "handshakes": {
            "pqc_only": {"outcome": "established", "protocol": "TLSv1.3", "cipher_suite": "TLS_AES_256_GCM_SHA384",
                         "group": group, "group_family": "ml-kem", "groups_offered": [group], "elapsed_ms": 14.0},
            "preferred": {"outcome": "established", "protocol": "TLSv1.3", "cipher_suite": "TLS_AES_256_GCM_SHA384",
                          "group": group, "group_family": "ml-kem",
                          "groups_offered": [group, "X25519", "secp256r1", "secp384r1"], "elapsed_ms": 13.2},
        },
        "probe_client": {"binary": "openssl", "version": "simulation", "error": None},
        "backend_client": {"python_version": "simulation", "openssl_version": "simulation",
                           "can_offer_mlkem": False, "group_detectable": False, "negotiated_group": None},
        "connections": [
            {"id": "backend_rgw_default", "label": "Backend → RGW (S3 operations)", "endpoint": "http://simulation:80",
             "transport": "plaintext", "cert_verified": None, "pqc": False, "note": "Simulation"},
            {"id": "backend_rgw_sse", "label": "Backend → RGW (SSE-S3 requests)", "endpoint": "https://simulation:443",
             "transport": "tls", "cert_verified": False, "pqc": False, "note": "Simulation"},
            {"id": "backend_vault", "label": "Backend → HashiCorp Vault (KMS)", "endpoint": "http://simulation:8200",
             "transport": "plaintext", "cert_verified": None, "pqc": False, "note": "Simulation"},
        ],
        "checked_at": time.time(),
        "cached": False,
        "simulated": True,
    }


@pqc_bp.route("/pqc/status", methods=["GET"])
def pqc_status():
    """Live, cached PQC in-transit verdict for the RGW HTTPS endpoint."""
    if config.IS_SIMULATION:
        return jsonify(_simulated_transit())
    try:
        force = request.args.get("refresh") in ("1", "true")
        return jsonify(get_transit_status(block=True, force=force))
    except Exception as e:
        logger.exception("pqc_status error")
        return jsonify({"error": str(e)}), 500


@pqc_bp.route("/pqc/posture", methods=["GET"])
def pqc_posture():
    """At-rest encryption, Vault KMS and Ceph messenger posture."""
    try:
        force = request.args.get("refresh") in ("1", "true")
        return jsonify(get_crypto_posture(force=force))
    except Exception as e:
        logger.exception("pqc_posture error")
        return jsonify({"error": str(e)}), 500


@pqc_bp.route("/pqc/messenger", methods=["GET"])
def pqc_messenger():
    """Ceph msgr2 on-wire modes (RBD/CephFS transport)."""
    if config.IS_SIMULATION:
        return jsonify({**simulated_posture()["messenger"], "simulated": True})
    try:
        return jsonify({**get_messenger_modes(), "simulated": False})
    except Exception as e:
        logger.exception("pqc_messenger error")
        return jsonify({"error": str(e)}), 500
