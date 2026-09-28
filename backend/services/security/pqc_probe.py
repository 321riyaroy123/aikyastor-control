"""
services/security/pqc_probe.py - Post-Quantum Cryptography (PQC) telemetry.

Answers one question honestly: does the Ceph RGW HTTPS endpoint actually
negotiate a post-quantum (ML-KEM) key exchange?

TLS 1.3 alone is NOT evidence of PQC -- a TLS 1.3 handshake over plain
X25519 looks identical at the protocol/cipher level. The only reliable
signal is the negotiated key-exchange *group*, and Python's ssl module
cannot report it before Python 3.14 (SSLSocket.group()), nor offer ML-KEM
unless it is linked against OpenSSL >= 3.5.

So the probe uses an external `openssl s_client` (PQC_OPENSSL_BIN) that
can offer ML-KEM -- OpenSSL >= 3.5 natively, or an older OpenSSL with
oqsprovider loaded via OPENSSL_CONF -- and runs two handshakes:

  1. pqc_only:  offers ONLY the expected PQC group. Success proves the
                server supports it; a handshake failure proves it does not.
  2. preferred: offers the PQC group first plus classical fallbacks, the
                way a modern client does. Reports what RGW actually picks.

Verdict (the "status" field) is one of:
  pqc_verified    - preferred handshake negotiated an ML-KEM group
  not_negotiated  - server reachable but a classical group was negotiated
                    or the PQC-only handshake was rejected
  unverified      - no probe client capable of offering ML-KEM; the TLS
                    facts are still reported, but no PQC claim is made
  unreachable     - the RGW HTTPS endpoint could not be reached at all

Results are cached (PQC_CACHE_SECONDS) because each probe spawns
subprocesses and opens network connections.
"""

import re
import socket
import ssl
import subprocess
import sys
import threading
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import config.config as config
from core.logger import logger


# ─── Group classification ────────────────────────────────────────────────────

# Classical fallbacks offered after the PQC group in the "preferred" probe.
_CLASSICAL_FALLBACK_GROUPS = ["X25519", "secp256r1", "secp384r1"]


def classify_group(name: Optional[str]) -> Optional[str]:
    """
    Classify a TLS key-exchange group name.

    Returns "ml-kem" (standardized FIPS 203 / hybrid), "kyber-draft"
    (pre-standard Kyber drafts -- post-quantum but obsolete), "classical",
    or None when the name is unknown/absent.
    """
    if not name:
        return None
    n = name.upper().replace("-", "").replace("_", "")
    if "MLKEM" in n:
        return "ml-kem"
    if "KYBER" in n:
        return "kyber-draft"
    return "classical"


def is_pqc_group(name: Optional[str]) -> bool:
    """True only for standardized ML-KEM groups (pure or hybrid)."""
    return classify_group(name) == "ml-kem"


# ─── openssl s_client output parsing ─────────────────────────────────────────

_RE_GROUP = [
    # OpenSSL 3.2+ prints this for KEM-based (incl. ML-KEM) groups.
    re.compile(r"Negotiated TLS1\.3 group:\s*([^\s,]+)"),
    # Classical ECDHE groups (and some provider groups) show up here.
    re.compile(r"(?:Server|Peer) Temp Key:\s*([^\n]+)"),
]
_RE_PROTOCOL = [
    re.compile(r"Protocol version:\s*(\S+)"),
    re.compile(r"^\s*Protocol\s*:\s*(\S+)", re.MULTILINE),
    re.compile(r"New,\s*(TLSv[\d.]+),\s*Cipher is"),
]
_RE_CIPHER = [
    re.compile(r"Ciphersuite:\s*(\S+)"),
    re.compile(r"Cipher is\s+(\S+)"),
    re.compile(r"^\s*Cipher\s*:\s*(\S+)", re.MULTILINE),
]

# The local openssl refused the -groups argument: the probe client cannot
# offer the group, so nothing can be concluded about the server.
_RE_CLIENT_UNSUPPORTED = re.compile(
    r"SSL_CONF_cmd|Error with command|Error setting groups|unknown group|"
    r"invalid group|no valid groups|Failed to set groups|group.*not supported",
    re.IGNORECASE,
)
# Could not reach the server at all.
_RE_CONNECT_ERROR = re.compile(
    r"connect:errno|Connection refused|BIO_connect|gethostbyname|"
    r"getaddrinfo|No route to host|Network is unreachable|timed out|"
    r"Name or service not known|nodename nor servname",
    re.IGNORECASE,
)
# Reached the server but the handshake was rejected (e.g. no shared group).
_RE_HANDSHAKE_REJECTED = re.compile(
    r"handshake failure|alert|no suitable key share|no shared|"
    r"wrong version number|unexpected eof|SSL routines",
    re.IGNORECASE,
)


def _first_match(patterns, text: str) -> Optional[str]:
    for pattern in patterns:
        m = pattern.search(text)
        if m:
            return m.group(1).strip()
    return None


def parse_s_client_output(text: str) -> Dict[str, Optional[str]]:
    """Extract protocol, cipher suite and negotiated group from s_client output."""
    group = _first_match(_RE_GROUP, text)
    if group:
        # "X25519, 253 bits" -> "X25519"; "ECDH, prime256v1, 256 bits" -> "prime256v1"
        parts = [p.strip() for p in group.split(",") if p.strip()]
        if parts and parts[0].upper() == "ECDH" and len(parts) > 1:
            group = parts[1]
        elif parts:
            group = parts[0]
    return {
        "protocol": _first_match(_RE_PROTOCOL, text),
        "cipher_suite": _first_match(_RE_CIPHER, text),
        "group": group,
    }


def classify_s_client_result(returncode: int, text: str) -> Dict[str, Any]:
    """
    Turn a raw s_client run into a structured handshake attempt.

    outcome is one of: "established", "rejected", "client_unsupported",
    "unreachable", "error".
    """
    parsed = parse_s_client_output(text)
    established = bool(parsed["protocol"]) and parsed["protocol"] != "(NONE)" and (
        parsed["cipher_suite"] not in (None, "(NONE)", "0000")
    )

    if established:
        outcome = "established"
    elif _RE_CLIENT_UNSUPPORTED.search(text):
        outcome = "client_unsupported"
    elif _RE_CONNECT_ERROR.search(text):
        outcome = "unreachable"
    elif _RE_HANDSHAKE_REJECTED.search(text):
        outcome = "rejected"
    else:
        outcome = "error"

    return {
        "outcome": outcome,
        "protocol": parsed["protocol"] if established else None,
        "cipher_suite": parsed["cipher_suite"] if established else None,
        "group": parsed["group"] if established else None,
        "group_family": classify_group(parsed["group"]) if established else None,
        "returncode": returncode,
    }


def _tail(text: str, limit: int = 400) -> str:
    """Last few lines of tool output, for the UI's error details."""
    text = (text or "").strip()
    return text[-limit:] if len(text) > limit else text


# ─── Probe primitives ────────────────────────────────────────────────────────

def _endpoint_parts(url: str) -> Tuple[str, int]:
    parsed = urlparse(url if "://" in url else f"https://{url}")
    return parsed.hostname or "127.0.0.1", parsed.port or 443


def _run_s_client(host: str, port: int, groups: str, timeout: float) -> Dict[str, Any]:
    """Run one `openssl s_client` handshake offering only `groups`."""
    cmd = [
        config.PQC_OPENSSL_BIN, "s_client",
        "-connect", f"{host}:{port}",
        "-servername", host,
        "-groups", groups,
        "-brief",
    ]
    started = time.perf_counter()
    try:
        result = subprocess.run(
            cmd,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        output = f"{result.stdout}\n{result.stderr}"
        attempt = classify_s_client_result(result.returncode, output)
        if attempt["outcome"] != "established":
            attempt["detail"] = _tail(result.stderr or result.stdout)
    except FileNotFoundError:
        attempt = {"outcome": "client_unsupported", "returncode": None,
                   "detail": f"openssl binary not found: {config.PQC_OPENSSL_BIN}"}
    except subprocess.TimeoutExpired:
        attempt = {"outcome": "unreachable", "returncode": None,
                   "detail": f"openssl s_client timed out after {timeout}s"}
    except Exception as e:
        logger.exception("pqc probe: s_client error")
        attempt = {"outcome": "error", "returncode": None, "detail": str(e)}

    attempt["groups_offered"] = groups.split(":")
    attempt["elapsed_ms"] = round((time.perf_counter() - started) * 1000, 2)
    return attempt


def get_probe_client_info() -> Dict[str, Any]:
    """Version and ML-KEM capability of the configured openssl binary."""
    info: Dict[str, Any] = {"binary": config.PQC_OPENSSL_BIN, "version": None, "error": None}
    try:
        result = subprocess.run(
            [config.PQC_OPENSSL_BIN, "version"],
            stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=5,
        )
        info["version"] = (result.stdout or result.stderr).strip() or None
    except FileNotFoundError:
        info["error"] = "openssl binary not found"
    except Exception as e:
        info["error"] = str(e)
    return info


def _python_tls_handshake(host: str, port: int, timeout: float) -> Dict[str, Any]:
    """
    Handshake with the backend's own Python ssl stack -- the same stack
    boto3/urllib3 use for SSE-S3 requests to RGW. Reports TLS facts and,
    on Python >= 3.14, the negotiated group.
    """
    started = time.perf_counter()
    try:
        ctx = ssl.create_default_context()
        # Certificate verification is intentionally off: this is a
        # telemetry probe against a (typically self-signed) dev cert. The
        # verdict records separately that verification is disabled.
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with socket.create_connection((host, port), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as tls:
                elapsed = round((time.perf_counter() - started) * 1000, 2)
                cipher = tls.cipher()
                group_fn = getattr(tls, "group", None)
                group = group_fn() if callable(group_fn) else None
                return {
                    "reachable": True,
                    "tls_version": tls.version(),
                    "cipher_suite": cipher[0] if cipher else None,
                    "cipher_bits": cipher[2] if cipher else None,
                    "group": group,
                    "group_family": classify_group(group),
                    "group_detectable": callable(group_fn),
                    # TCP connect + TLS handshake, not a PQC-specific cost.
                    "connect_and_handshake_ms": elapsed,
                    "error": None,
                }
    except Exception as e:
        return {
            "reachable": False,
            "tls_version": None,
            "cipher_suite": None,
            "cipher_bits": None,
            "group": None,
            "group_family": None,
            "group_detectable": callable(getattr(ssl.SSLSocket, "group", None)),
            "connect_and_handshake_ms": round((time.perf_counter() - started) * 1000, 2),
            "error": str(e),
        }


def get_backend_client_info() -> Dict[str, Any]:
    """Can the backend's own Python TLS stack (used by boto3) offer ML-KEM?"""
    return {
        "python_version": sys.version.split()[0],
        "openssl_version": ssl.OPENSSL_VERSION,
        # ML-KEM groups are built into OpenSSL from 3.5 onwards.
        "can_offer_mlkem": tuple(ssl.OPENSSL_VERSION_INFO[:2]) >= (3, 5),
        "group_detectable": callable(getattr(ssl.SSLSocket, "group", None)),
    }


# ─── Connection path inventory ───────────────────────────────────────────────

def _scheme(url: str) -> str:
    return (urlparse(url).scheme or "").lower() if url else ""


def _display(url: str) -> str:
    """scheme://host:port only -- never leak userinfo/paths."""
    if not url:
        return ""
    p = urlparse(url)
    host = p.hostname or ""
    if p.port:
        host = f"{host}:{p.port}"
    return f"{p.scheme}://{host}" if p.scheme else host


def get_connection_paths(pqc_status: str) -> List[Dict[str, Any]]:
    """
    Every network path the dashboard itself uses, with its real transport.
    A path can only be PQC-protected if it is TLS *and* the RGW probe
    verified ML-KEM -- plaintext paths are reported as such.
    """
    rgw_http = config.CEPH_RGW_ENDPOINT
    rgw_https = config.CEPH_RGW_ENDPOINT_SECURE
    vault = config.HASHICORP_VAULT_ADDR
    backend = get_backend_client_info()

    def transport(url: str) -> str:
        return "tls" if _scheme(url) == "https" else "plaintext"

    rgw_https_pqc = pqc_status == "pqc_verified" and backend["can_offer_mlkem"]

    return [
        {
            "id": "backend_rgw_default",
            "label": "Backend → RGW (S3 operations)",
            "endpoint": _display(rgw_http),
            "transport": transport(rgw_http),
            "cert_verified": None if transport(rgw_http) == "plaintext" else True,
            "pqc": False if transport(rgw_http) == "plaintext" else None,
            "note": "Used by get_s3_client() for bucket listing, uploads, policies and lifecycle.",
        },
        {
            "id": "backend_rgw_sse",
            "label": "Backend → RGW (SSE-S3 requests)",
            "endpoint": _display(rgw_https),
            "transport": transport(rgw_https),
            # object_storage.get_s3_client(secure=True) passes verify=False.
            "cert_verified": False if transport(rgw_https) == "tls" else None,
            "pqc": rgw_https_pqc if transport(rgw_https) == "tls" else False,
            "note": (
                "boto3 uses the backend's Python ssl stack, which can offer ML-KEM"
                if backend["can_offer_mlkem"] else
                f"boto3 uses the backend's Python ssl stack ({backend['openssl_version']}), "
                "which cannot offer ML-KEM -- this path is classical even if RGW supports PQC"
            ),
        },
        {
            "id": "backend_vault",
            "label": "Backend → HashiCorp Vault (KMS)",
            "endpoint": _display(vault),
            "transport": transport(vault),
            "cert_verified": None,
            "pqc": False if transport(vault) == "plaintext" else None,
            "note": "Read-only health/transit/token checks.",
        },
    ]


# ─── Cached transit probe ────────────────────────────────────────────────────

_cache_lock = threading.Lock()
_probe_lock = threading.Lock()
_cache: Dict[str, Any] = {"result": None, "at": 0.0}


def _derive_status(python_tls: Dict[str, Any], pqc_only: Dict[str, Any],
                   preferred: Dict[str, Any]) -> Tuple[str, str, Optional[str]]:
    """Combine the three handshakes into (status, reason, negotiated_group)."""
    outcomes = {pqc_only["outcome"], preferred["outcome"]}
    # A handshake that offered ONLY the PQC group can only have succeeded
    # on that group, even if this openssl build doesn't print it.
    pqc_supported = pqc_only["outcome"] == "established"

    if preferred["outcome"] == "established":
        group = preferred.get("group")
        if is_pqc_group(group):
            return "pqc_verified", f"RGW negotiated {group} with a PQC-capable client.", group
        if group is None:
            return ("unverified",
                    "Handshake succeeded but the probe client did not report the negotiated group.",
                    None)
        if pqc_supported:
            return ("not_negotiated",
                    f"RGW supports {config.PQC_EXPECTED_GROUP} but chose {group} "
                    "when classical groups were also offered.", group)
        return "not_negotiated", f"RGW negotiated {group}; no ML-KEM key exchange.", group

    if pqc_supported:
        group = pqc_only.get("group") or config.PQC_EXPECTED_GROUP
        return "pqc_verified", f"RGW completed a handshake offering only {group}.", group

    if pqc_only["outcome"] == "rejected":
        return "not_negotiated", "RGW rejected a handshake offering only the ML-KEM group.", None

    if not python_tls["reachable"] and outcomes & {"unreachable", "client_unsupported"}:
        return "unreachable", python_tls.get("error") or "RGW HTTPS endpoint unreachable.", None

    if "client_unsupported" in outcomes:
        return ("unverified",
                "The probe client cannot offer ML-KEM (set PQC_OPENSSL_BIN to OpenSSL >= 3.5 "
                "or an oqsprovider-enabled openssl). TLS details below are not evidence of PQC.",
                None)

    return "unverified", "PQC probe did not complete; see handshake details.", None


def _run_transit_probe() -> Dict[str, Any]:
    endpoint = config.PQC_PROBE_ENDPOINT
    host, port = _endpoint_parts(endpoint)
    timeout = config.PQC_PROBE_TIMEOUT
    expected = config.PQC_EXPECTED_GROUP

    python_tls = _python_tls_handshake(host, port, timeout)
    pqc_only = _run_s_client(host, port, expected, timeout)
    preferred = _run_s_client(host, port, ":".join([expected, *_CLASSICAL_FALLBACK_GROUPS]), timeout)

    status, reason, negotiated = _derive_status(python_tls, pqc_only, preferred)

    return {
        "status": status,
        "reason": reason,
        "pqc_verified": True if status == "pqc_verified" else (False if status == "not_negotiated" else None),
        "expected_group": expected,
        "negotiated_group": negotiated,
        "negotiated_group_family": classify_group(negotiated),
        "endpoint": f"https://{host}:{port}",
        "rgw_tls": {
            "reachable": python_tls["reachable"],
            "tls_version": python_tls["tls_version"],
            "cipher_suite": python_tls["cipher_suite"],
            "cipher_bits": python_tls["cipher_bits"],
            "connect_and_handshake_ms": python_tls["connect_and_handshake_ms"],
            "cert_verified": False,
            "error": python_tls["error"],
        },
        "handshakes": {"pqc_only": pqc_only, "preferred": preferred},
        "probe_client": get_probe_client_info(),
        "backend_client": {
            **get_backend_client_info(),
            "negotiated_group": python_tls["group"],
        },
        "connections": get_connection_paths(status),
        "checked_at": time.time(),
        "simulated": False,
    }


def get_transit_status(block: bool = True, force: bool = False) -> Optional[Dict[str, Any]]:
    """
    Cached PQC transit probe.

    block=False never waits on the network: it returns the cached result
    (possibly stale) or None, and kicks off a background refresh if the
    cache is expired. Used by /api/dashboard, which polls every few seconds.
    """
    with _cache_lock:
        cached, at = _cache["result"], _cache["at"]
    fresh = cached is not None and (time.time() - at) < config.PQC_CACHE_SECONDS

    if fresh and not force:
        return {**cached, "cached": True}

    if not block:
        if _probe_lock.acquire(blocking=False):
            threading.Thread(target=_refresh_in_background, daemon=True).start()
        return {**cached, "cached": True, "stale": True} if cached else None

    with _probe_lock:
        # Another thread may have refreshed while we waited for the lock.
        with _cache_lock:
            if not force and _cache["result"] is not None and \
                    (time.time() - _cache["at"]) < config.PQC_CACHE_SECONDS:
                return {**_cache["result"], "cached": True}
        return _store(_run_transit_probe())


def _refresh_in_background():
    # _probe_lock is already held by the caller that started this thread.
    try:
        _store(_run_transit_probe())
    except Exception:
        logger.exception("pqc probe: background refresh failed")
    finally:
        _probe_lock.release()


def _store(result: Dict[str, Any]) -> Dict[str, Any]:
    with _cache_lock:
        _cache["result"] = result
        _cache["at"] = time.time()
    return {**result, "cached": False}


def summarize_for_dashboard(result: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Compact `security` block for GET /api/dashboard."""
    if not result:
        return {"available": False, "pending": True, "error": None}
    plaintext = [c["label"] for c in result.get("connections", []) if c["transport"] == "plaintext"]
    return {
        "available": True,
        "status": result["status"],
        "reason": result["reason"],
        "negotiated_group": result.get("negotiated_group"),
        "expected_group": result.get("expected_group"),
        "tls_version": result.get("rgw_tls", {}).get("tls_version"),
        "endpoint": result.get("endpoint"),
        "plaintext_paths": plaintext,
        "checked_at": result.get("checked_at"),
        "stale": bool(result.get("stale")),
        "simulated": bool(result.get("simulated")),
    }
