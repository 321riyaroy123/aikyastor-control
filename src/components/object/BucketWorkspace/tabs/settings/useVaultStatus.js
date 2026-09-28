import { useCallback, useEffect, useRef, useState } from "react";
import { HashiCorpVaultAPI } from "../../../../../api/vault";

/**
 * HashiCorp Vault (transit / SSE-S3 dependency) status.
 * Read-only. Loads on mount and on manual refresh(). No polling.
 *
 * `checkedAt` is stamped client-side; the backend supplies no timestamp.
 * `unavailable` is true when the request itself failed (as opposed to
 * Vault reporting itself unhealthy), so the UI can tell those apart.
 */
export default function useVaultStatus() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [checkedAt, setCheckedAt] = useState(null);
    const requestId = useRef(0);

    const load = useCallback(async ({ silent = false } = {}) => {
        const myId = ++requestId.current;

        if (silent) setRefreshing(true);
        else setLoading(true);

        setError("");

        try {
            const result = await HashiCorpVaultAPI.status();

            if (myId !== requestId.current) return;

            setStatus(result);
            setCheckedAt(new Date());
        } catch (err) {
            if (myId !== requestId.current) return;

            setStatus(null);
            setError(err.message || "Failed to read HashiCorp Vault status.");
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

    return {
        status,
        loading,
        refreshing,
        error,
        checkedAt,
        unavailable: Boolean(error),
        refresh
    };
}