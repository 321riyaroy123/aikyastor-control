import os
from typing import Any, Dict, List, Optional

import requests


PROMETHEUS_URL = os.getenv(
    "PROMETHEUS_URL",
    "http://192.168.56.110:9095",
)

DEFAULT_TIMEOUT = float(
    os.getenv("PROMETHEUS_TIMEOUT", "5")
)


class PrometheusError(RuntimeError):
    """Raised when Prometheus cannot be queried successfully."""


def _url(path: str) -> str:
    return f"{PROMETHEUS_URL.rstrip('/')}{path}"


def query(
    promql: str,
    timeout: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """
    Execute an instant PromQL query.

    Returns the Prometheus result list.

    Raises:
        PrometheusError: if Prometheus is unavailable or returns
        an unsuccessful API response.
    """
    try:
        response = requests.get(
            _url("/api/v1/query"),
            params={"query": promql},
            timeout=timeout or DEFAULT_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        raise PrometheusError(
            f"Prometheus request failed: {exc}"
        ) from exc
    except ValueError as exc:
        raise PrometheusError(
            "Prometheus returned invalid JSON"
        ) from exc

    if payload.get("status") != "success":
        error = payload.get("error", "unknown Prometheus error")
        raise PrometheusError(str(error))

    return payload.get("data", {}).get("result", [])


def query_range(
    promql: str,
    start: float,
    end: float,
    step: float = 10,
    timeout: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """
    Execute a PromQL range query.

    start/end are Unix timestamps in seconds.
    step is the query resolution in seconds.
    """
    try:
        response = requests.get(
            _url("/api/v1/query_range"),
            params={
                "query": promql,
                "start": start,
                "end": end,
                "step": step,
            },
            timeout=timeout or DEFAULT_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        raise PrometheusError(
            f"Prometheus range request failed: {exc}"
        ) from exc
    except ValueError as exc:
        raise PrometheusError(
            "Prometheus returned invalid JSON"
        ) from exc

    if payload.get("status") != "success":
        error = payload.get("error", "unknown Prometheus error")
        raise PrometheusError(str(error))

    return payload.get("data", {}).get("result", [])


def is_available() -> bool:
    """Return True when Prometheus is reachable and ready."""
    try:
        response = requests.get(
            _url("/-/ready"),
            timeout=DEFAULT_TIMEOUT,
        )
        return response.ok
    except requests.RequestException:
        return False