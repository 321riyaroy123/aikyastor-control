import { useState, useCallback, useEffect } from "react";
import { ObjectAPI } from "../api/objectStorage";

/**
 * useBuckets - extracted from App()'s inline buckets state and loadBuckets
 * callback in AiKyaStorCONTROL.jsx.
 */
export function useBuckets(autoLoad = true) {
  const [buckets, setBuckets] = useState([]);

  const loadBuckets = useCallback(async () => {
    try {
      const result = await ObjectAPI.buckets();
      setBuckets(result.buckets || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { if (autoLoad) loadBuckets(); }, [autoLoad, loadBuckets]);

  return { buckets, loadBuckets };
}
