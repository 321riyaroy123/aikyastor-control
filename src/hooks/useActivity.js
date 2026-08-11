import { useState, useCallback, useEffect } from "react";
import { ClusterAPI } from "../api/cluster";

/**
 * useActivity - extracted from App()'s inline activity state, loadActivity
 * callback, and the 10s polling interval in AiKyaStorCONTROL.jsx.
 */
export function useActivity(pollMs = 10000) {
  const [activity, setActivity] = useState([]);

  const loadActivity = useCallback(async () => {
    try { setActivity(await ClusterAPI.activity()); } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    loadActivity();
    const timer = setInterval(loadActivity, pollMs);
    return () => clearInterval(timer);
  }, [loadActivity, pollMs]);

  return { activity, loadActivity };
}
