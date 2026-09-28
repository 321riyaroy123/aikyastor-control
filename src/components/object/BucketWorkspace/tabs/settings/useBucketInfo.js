import { useCallback, useEffect, useRef, useState } from "react";
import { ObjectAPI } from "../../../../../api/objectStorage";

/**
 * Loads read-only bucket metadata from GET /object/buckets/<bucket>/info.
 *
 * Loads once when the bucket changes and on manual refresh(). No polling.
 * `checkedAt` is stamped client-side; the backend does not supply one.
 */
export default function useBucketInfo(bucketName) {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [checkedAt, setCheckedAt] = useState(null);

    // Guards against a slow response for a previously selected bucket
    // overwriting state for the current one.
    const requestId = useRef(0);

    const load = useCallback(async ({ silent = false } = {}) => {
        if (!bucketName) return;

        const myId = ++requestId.current;

        if (silent) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        setError("");

        try {
            const result = await ObjectAPI.getBucketInfo(bucketName);

            if (myId !== requestId.current) return;

            setInfo(result);
            setCheckedAt(new Date());
        } catch (err) {
            if (myId !== requestId.current) return;

            setError(err.message || "Failed to load bucket information.");
        } finally {
            if (myId === requestId.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [bucketName]);

    useEffect(() => {
        setInfo(null);
        load();
    }, [load]);

    const refresh = useCallback(() => load({ silent: true }), [load]);

    return { info, loading, refreshing, error, checkedAt, refresh };
}