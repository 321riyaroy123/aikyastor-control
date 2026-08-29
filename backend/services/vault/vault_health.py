"""
Read-only HashiCorp Vault health checks for Encryption Vault.

The functions here call Vault's HTTP API to report reachability, seal
state, transit-engine availability, and dashboard-token metadata for the
Vault instance backing Ceph RGW SSE-S3 encryption. This is separate from
the filesystem backup vault managed by `services.vault.vault_ops`.
"""

import requests
from typing import Dict, Any
from core.logger import logger
from config.config import HASHICORP_VAULT_ADDR, HASHICORP_VAULT_TOKEN, CMD_TIMEOUT

_HEADERS = {"X-Vault-Token": HASHICORP_VAULT_TOKEN}


def get_vault_health() -> Dict[str, Any]:
    """
    Check HashiCorp Vault's health/seal status via its public,
    unauthenticated /sys/health endpoint.

    Returns:
        {
            "reachable": bool,
            "initialized": bool | None,
            "sealed": bool | None,
            "standby": bool | None,
            "version": str | None,
            "error": str  (only present on failure)
        }
    """
    try:
        resp = requests.get(
            f"{HASHICORP_VAULT_ADDR}/v1/sys/health",
            timeout=CMD_TIMEOUT,
            # Vault returns non-200 codes for sealed/standby states by
            # design (e.g. 503 sealed) -- we still want the JSON body,
            # so we don't raise_for_status() here.
        )

        data = resp.json() if resp.content else {}

        return {
            "reachable": True,
            "initialized": data.get("initialized"),
            "sealed": data.get("sealed"),
            "standby": data.get("standby"),
            "version": data.get("version"),
            "server_time_utc": data.get("server_time_utc"),
        }

    except requests.exceptions.ConnectionError as e:
        logger.warning(f"Vault unreachable at {HASHICORP_VAULT_ADDR}: {e}")
        return {
            "reachable": False,
            "initialized": None,
            "sealed": None,
            "standby": None,
            "version": None,
            "error": "Could not connect to Vault. Is it running and is HASHICORP_VAULT_ADDR correct?",
        }
    except requests.exceptions.Timeout:
        logger.warning(f"Vault health check timed out after {CMD_TIMEOUT}s")
        return {
            "reachable": False,
            "initialized": None,
            "sealed": None,
            "standby": None,
            "version": None,
            "error": f"Vault health check timed out after {CMD_TIMEOUT}s.",
        }
    except Exception as e:
        logger.exception("get_vault_health error")
        return {
            "reachable": False,
            "initialized": None,
            "sealed": None,
            "standby": None,
            "version": None,
            "error": str(e),
        }


def get_transit_status() -> Dict[str, Any]:
    """
    Confirm whether the transit/ secrets engine is mounted -- the
    specific engine Ceph RGW's SSE-S3 integration depends on.

    Requires a valid, authenticated token with at least read access to
    sys/mounts.

    Returns:
        {
            "mounted": bool,
            "error": str  (only present on failure)
        }
    """
    try:
        resp = requests.get(
            f"{HASHICORP_VAULT_ADDR}/v1/sys/mounts",
            headers=_HEADERS,
            timeout=CMD_TIMEOUT,
        )

        if resp.status_code == 403:
            return {
                "mounted": None,
                "error": "Vault token lacks permission to read sys/mounts.",
            }

        resp.raise_for_status()
        mounts = resp.json()

        return {"mounted": "transit/" in mounts}

    except requests.exceptions.ConnectionError:
        return {"mounted": None, "error": "Could not connect to Vault."}
    except Exception as e:
        logger.exception("get_transit_status error")
        return {"mounted": None, "error": str(e)}


def get_token_status() -> Dict[str, Any]:
    """
    Look up metadata about the token this app is currently using
    (NOT RGW's token -- this app's own, separate, read-only token).

    Useful for catching an expiring/misconfigured dashboard token before
    it silently starts failing.

    Returns:
        {
            "valid": bool,
            "policies": list[str] | None,
            "ttl_seconds": int | None,
            "renewable": bool | None,
            "error": str  (only present on failure)
        }
    """
    try:
        resp = requests.get(
            f"{HASHICORP_VAULT_ADDR}/v1/auth/token/lookup-self",
            headers=_HEADERS,
            timeout=CMD_TIMEOUT,
        )

        if resp.status_code == 403:
            return {
                "valid": False,
                "policies": None,
                "ttl_seconds": None,
                "renewable": None,
                "error": "Token is invalid or expired.",
            }

        resp.raise_for_status()
        data = resp.json().get("data", {})

        return {
            "valid": True,
            "policies": data.get("policies"),
            "ttl_seconds": data.get("ttl"),
            "renewable": data.get("renewable"),
        }

    except requests.exceptions.ConnectionError:
        return {
            "valid": False,
            "policies": None,
            "ttl_seconds": None,
            "renewable": None,
            "error": "Could not connect to Vault.",
        }
    except Exception as e:
        logger.exception("get_token_status error")
        return {
            "valid": False,
            "policies": None,
            "ttl_seconds": None,
            "renewable": None,
            "error": str(e),
        }


def get_full_vault_status() -> Dict[str, Any]:
    """
    Convenience aggregator combining health, transit-mount, and token
    status into a single response for the dashboard's Vault tab.
    """
    health = get_vault_health()

    result = {"health": health}

    # Only bother checking transit/token if Vault is actually reachable
    # and unsealed -- calling authenticated endpoints against a sealed
    # or unreachable Vault will just fail redundantly.
    if health.get("reachable") and health.get("sealed") is False:
        result["transit"] = get_transit_status()
        result["token"] = get_token_status()
    else:
        result["transit"] = {"mounted": None, "error": "Skipped -- Vault is not reachable or is sealed."}
        result["token"] = {"valid": None, "error": "Skipped -- Vault is not reachable or is sealed."}

    return result
