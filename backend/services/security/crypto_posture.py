"""
services/security/crypto_posture.py - at-rest and Ceph-internal crypto posture.

Complements pqc_probe.py (RGW in-transit). Every value here is read from
the cluster or Vault -- nothing is asserted from configuration intent:

  object     - per-bucket SSE state, read from RGW via list_buckets()
  vault      - HashiCorp Vault (SSE-S3 KMS) health/transit/token
  messenger  - Ceph msgr2 modes (ms_cluster/service/client_mode). RBD and
               CephFS traffic uses msgr2, not TLS, so TLS PQC does not
               apply; msgr2 "secure" mode is AES-GCM keyed from cephx
               shared secrets (no public-key exchange for Shor to attack).
  block/file - AiKyaStor applies no encryption to RBD/CephFS data. OSD
               dm-crypt cannot be read from the ceph CLI, so it is
               reported as unknown rather than guessed.

AES-256 retains ~128-bit security against Grover's algorithm, which is why
it is considered quantum-resistant for data at rest -- but only for the
buckets that actually have SSE enabled.
"""

import threading
import time
from typing import Any, Dict

import config.config as config
from core.logger import logger
from services.cluster.ceph_ops import run_ceph_cmd
from services.object.object_storage import list_buckets
from services.vault.vault_health import get_full_vault_status

_MSGR_OPTIONS = ("ms_cluster_mode", "ms_service_mode", "ms_client_mode")

_lock = threading.Lock()
_cache: Dict[str, Any] = {"result": None, "at": 0.0}


def get_object_encryption_summary() -> Dict[str, Any]:
    """Count buckets with SSE enabled, straight from RGW."""
    result = list_buckets()
    if "error" in result:
        return {"available": False, "error": result["error"]}

    buckets = [
        {
            "name": b["name"],
            "enabled": bool((b.get("encryption") or {}).get("enabled")),
            "type": (b.get("encryption") or {}).get("type"),
        }
        for b in result.get("buckets", [])
    ]
    encrypted = [b for b in buckets if b["enabled"]]
    return {
        "available": True,
        "total_buckets": len(buckets),
        "encrypted_buckets": len(encrypted),
        "unencrypted_buckets": [b["name"] for b in buckets if not b["enabled"]],
        "algorithms": sorted({b["type"] for b in encrypted if b["type"]}),
        "buckets": buckets,
    }


def get_messenger_modes() -> Dict[str, Any]:
    """Read Ceph msgr2 on-wire modes from the mon config database."""
    modes: Dict[str, Any] = {}
    errors = []
    for option in _MSGR_OPTIONS:
        out, err, rc = run_ceph_cmd(f"ceph config get mon {option}")
        if rc == 0 and out:
            modes[option] = out.strip()
        else:
            modes[option] = None
            errors.append(f"{option}: {err or 'no value'}")

    values = [v for v in modes.values() if v]
    # Mode strings are preference lists, e.g. "crc secure". The first
    # entry is what a connection prefers.
    all_secure = bool(values) and all(v.split()[0] == "secure" for v in values)
    return {
        "available": bool(values),
        "modes": modes,
        "all_secure": all_secure,
        "tls_pqc_applicable": False,
        "error": "; ".join(errors) if errors and not values else None,
    }


def simulated_posture() -> Dict[str, Any]:
    return {
        "simulated": True,
        "checked_at": time.time(),
        "object": {
            "available": True, "total_buckets": 3, "encrypted_buckets": 1,
            "unencrypted_buckets": ["media-assets", "logs-archive"],
            "algorithms": ["AES256"], "buckets": [],
        },
        "vault": {
            "health": {"reachable": True, "initialized": True, "sealed": False, "standby": False, "version": "simulation"},
            "transit": {"mounted": True},
            "token": {"valid": True, "policies": ["default"], "ttl_seconds": 3600, "renewable": True},
        },
        "messenger": {
            "available": True,
            "modes": {"ms_cluster_mode": "crc secure", "ms_service_mode": "crc secure", "ms_client_mode": "crc secure"},
            "all_secure": False, "tls_pqc_applicable": False, "error": None,
        },
        "block": {"encrypted_by_aikyastor": False, "osd_dmcrypt": None},
        "file": {"encrypted_by_aikyastor": False, "osd_dmcrypt": None},
    }


def _collect() -> Dict[str, Any]:
    def safe(fn, label):
        try:
            return fn()
        except Exception as e:
            logger.exception(f"crypto posture: {label} failed")
            return {"available": False, "error": str(e)}

    unknown_dmcrypt = {
        "encrypted_by_aikyastor": False,
        # dm-crypt state lives in ceph-volume on each OSD host and is not
        # exposed by `ceph osd metadata`; never guess it.
        "osd_dmcrypt": None,
    }
    return {
        "simulated": False,
        "checked_at": time.time(),
        "object": safe(get_object_encryption_summary, "object"),
        "vault": safe(get_full_vault_status, "vault"),
        "messenger": safe(get_messenger_modes, "messenger"),
        "block": dict(unknown_dmcrypt),
        "file": dict(unknown_dmcrypt),
    }


def get_crypto_posture(force: bool = False) -> Dict[str, Any]:
    """Cached (PQC_CACHE_SECONDS) at-rest + messenger posture."""
    if config.IS_SIMULATION:
        return simulated_posture()

    with _lock:
        cached, at = _cache["result"], _cache["at"]
        if cached is not None and not force and (time.time() - at) < config.PQC_CACHE_SECONDS:
            return {**cached, "cached": True}

        result = _collect()
        _cache["result"] = result
        _cache["at"] = time.time()
        return {**result, "cached": False}
