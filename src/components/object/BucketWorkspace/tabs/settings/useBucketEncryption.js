import { useCallback, useEffect, useRef, useState } from "react";
import { ObjectAPI } from "../../../../../api/objectStorage";

/**
 * Encryption state for one bucket, read from RGW (the source of truth).
 *
 * After every write we re-read from RGW rather than trusting the PUT/DELETE
 * response, so the UI shows what Ceph actually accepted.
 *
 * enable()/disable() return { ok: boolean, message?: string, error?: string }
 * so callers decide how to toast; they never throw.
 *
 * Phase 6: optional `onChanged` callback, fired after a SUCCESSFUL write
 * (once the re-read has completed). BucketWorkspace uses it to refresh the
 * header's encryption badge, which otherwise only loads on bucket change.
 * The callback is kept in a ref so passing an inline function doesn't
 * retrigger effects.
 */
export default function useBucketEncryption(bucketName, { onChanged } = {}) {
    const [encryption, setEncryption] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const requestId = useRef(0);
    const onChangedRef = useRef(onChanged);

    useEffect(() => {
        onChangedRef.current = onChanged;
    });

    const load = useCallback(async ({ silent = false } = {}) => {
        if (!bucketName) return;

        const myId = ++requestId.current;

        if (silent) setRefreshing(true);
        else setLoading(true);

        setError("");

        try {
            const result = await ObjectAPI.getBucketEncryption(bucketName);
            if (myId !== requestId.current) return;
            setEncryption(result);
        } catch (err) {
            if (myId !== requestId.current) return;
            setError(err.message || "Failed to load encryption status.");
        } finally {
            if (myId === requestId.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [bucketName]);

    useEffect(() => {
        setEncryption(null);
        load();
    }, [load]);

    const refresh = useCallback(() => load({ silent: true }), [load]);

    const enable = useCallback(async () => {
        setSaving(true);

        try {
            const result = await ObjectAPI.setBucketEncryption(bucketName, true, "AES256");
            await load({ silent: true });
            onChangedRef.current?.();
            return { ok: true, message: result.message };
        } catch (err) {
            return { ok: false, error: err.message || "Failed to enable encryption." };
        } finally {
            setSaving(false);
        }
    }, [bucketName, load]);

    const disable = useCallback(async () => {
        setSaving(true);

        try {
            const result = await ObjectAPI.deleteBucketEncryption(bucketName);
            await load({ silent: true });
            onChangedRef.current?.();
            return { ok: true, message: result.message };
        } catch (err) {
            return { ok: false, error: err.message || "Failed to disable encryption." };
        } finally {
            setSaving(false);
        }
    }, [bucketName, load]);

    return { encryption, loading, refreshing, saving, error, refresh, enable, disable };
}