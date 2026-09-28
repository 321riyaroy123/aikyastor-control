import { useCallback, useEffect, useRef, useState } from "react";
import { ReplicationAPI } from "../../../../../api/replication";

/**
 * Read-only realm/zone/sync summary via ReplicationAPI.getStatusSafe().
 *
 * getStatusSafe never throws: it returns { httpOk, enabled, reachable,
 * error?, ... }. So this hook classifies the result into one `state`:
 *
 *   loading      first load in progress
 *   ready        enabled && reachable
 *   unreachable  enabled but the secondary could not be reached
 *   unavailable  replication not enabled / status could not be read
 *
 * Loads once on mount and on manual refresh(). No polling: the SSH-backed
 * status call is heavy and the backend already caches/circuit-breaks it.
 */
export default function useReplicationSummary() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [checkedAt, setCheckedAt] = useState(null);
    const requestId = useRef(0);

    const load = useCallback(async ({ silent = false } = {}) => {
        const myId = ++requestId.current;

        if (silent) setRefreshing(true);
        else setLoading(true);

        try {
            const result = await ReplicationAPI.getStatusSafe();

            if (myId !== requestId.current) return;

            setData(result);
            setCheckedAt(new Date());
        } finally {
            if (myId === requestId.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const refresh = useCallback(() => load({ silent: true }), [load]);

    let state = "loading";

    if (data) {
        if (data.enabled && data.reachable === false) state = "unreachable";
        else if (data.enabled) state = "ready";
        else state = "unavailable";
    }

    return { data, state, loading, refreshing, checkedAt, refresh };
}