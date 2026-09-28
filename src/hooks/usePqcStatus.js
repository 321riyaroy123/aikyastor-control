import { useCallback, useEffect, useRef, useState } from "react";
import { SecurityAPI } from "../api/security";

/**
 * usePqcStatus - loads GET /api/pqc/status (and optionally /api/pqc/posture).
 *
 * The backend caches probes (PQC_CACHE_SECONDS), so polling here is cheap.
 * refresh() forces a new probe. Keeps the last good data on a failed poll
 * and exposes `error` separately so the UI never shows a failed request
 * as a healthy state.
 */
export default function usePqcStatus({ includePosture = false, pollMs = 0 } = {}) {
  const [status, setStatus] = useState(null);
  const [posture, setPosture] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [postureError, setPostureError] = useState("");
  const requestId = useRef(0);

  const load = useCallback(async ({ force = false } = {}) => {
    const myId = ++requestId.current;
    if (force) setRefreshing(true);

    const [statusRes, postureRes] = await Promise.allSettled([
      SecurityAPI.pqcStatus(force),
      includePosture ? SecurityAPI.posture(force) : Promise.resolve(null),
    ]);
    if (myId !== requestId.current) return;

    if (statusRes.status === "fulfilled") {
      setStatus(statusRes.value);
      setError("");
    } else {
      setError(statusRes.reason?.message || "Failed to load PQC status.");
    }

    if (includePosture) {
      if (postureRes.status === "fulfilled") {
        setPosture(postureRes.value);
        setPostureError("");
      } else {
        setPostureError(postureRes.reason?.message || "Failed to load encryption posture.");
      }
    }

    setLoading(false);
    setRefreshing(false);
  }, [includePosture]);

  useEffect(() => {
    load();
    if (!pollMs) return undefined;
    const timer = setInterval(() => load(), pollMs);
    return () => clearInterval(timer);
  }, [load, pollMs]);

  const refresh = useCallback(() => load({ force: true }), [load]);

  return { status, posture, loading, refreshing, error, postureError, refresh };
}
