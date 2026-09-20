import { useState, useCallback, useEffect, useRef } from "react";
import { ClusterAPI } from "../api/cluster";

/**
 * useDashboardMetrics - polling hook for GET /api/dashboard.
 *
 * Follows the same shape as useActivity.js (fetcher in useCallback, poll
 * via useEffect + setInterval, cleanup on unmount) rather than introducing
 * a new hook pattern.
 *
 * Deliberately does NOT clear `data` when a poll fails (Section 18 of the
 * redesign brief: "Do not erase previously valid data simply because one
 * polling request failed"). Instead it tracks `stale` + `lastUpdated`
 * separately so the UI can show "⚠ Data may be stale" while still
 * rendering the last good values, and a relative "Updated Ns ago" string.
 *
 * PHASE 1: only the `health` block exists in the response. Consumers
 * should treat `data?.capacity`, `data?.services`, etc. as undefined until
 * those phases land server-side — this hook itself needs no changes when
 * they do, since it just passes through whatever /api/dashboard returns.
 */
export function useDashboardMetrics(pollMs = 8000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    // Avoid overlapping requests if one poll is slow (e.g. a sluggish
    // ceph command) and the next interval tick fires before it resolves.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await ClusterAPI.dashboard();
      setData(result);
      setStale(false);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      console.error(err);
      setError(err.message || "Unknown error");
      // Keep previous `data` as-is; only mark it stale.
      setStale(true);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, pollMs);
    return () => clearInterval(timer);
  }, [load, pollMs]);

  return { data, loading, stale, lastUpdated, error, refresh: load };
}
