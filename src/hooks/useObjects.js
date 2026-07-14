import { useState, useCallback } from "react";
import { ObjectAPI } from "../api/objectStorage";

/**
 * useObjects - extracted from ObjectStorage's inline objects/currentBucket
 * state, openBucket/closeBucket handlers in AiKyaStorCONTROL.jsx.
 */
export function useObjects(toast) {
  const [objects, setObjects] = useState(null);
  const [currentBucket, setCurrentBucket] = useState(null);

  const openBucket = useCallback(async (b) => {
    setCurrentBucket(b);
    try {
      const result = await ObjectAPI.objects(b.name);
      setObjects(result.objects || []);
    } catch (err) {
      toast?.(err.message, "error");
      setObjects([]);
    }
  }, [toast]);

  const closeBucket = useCallback(() => {
    setCurrentBucket(null);
    setObjects([]);
  }, []);

  const refreshObjects = useCallback(async () => {
    if (!currentBucket) return;
    const refreshed = await ObjectAPI.objects(currentBucket.name);
    setObjects(refreshed.objects || []);
  }, [currentBucket]);

  return { objects, currentBucket, openBucket, closeBucket, refreshObjects };
}
