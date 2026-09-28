import { useCallback, useEffect, useRef, useState } from "react";
import { BucketPolicyAPI } from "../../../../../api/bucketPolicies";

/**
 * Independent, read-only view of the policy currently applied in RGW.
 * Separate from useBucketPolicy (the editor's draft state) so that:
 *   - load errors are surfaced instead of swallowed
 *   - the status banner can refresh without remounting the editor
 *
 * Phase 6: added remove(), used by the Danger Zone. It deletes the policy
 * and then RE-READS from RGW to verify, instead of trusting the DELETE
 * response. Returns { ok, message?|error? } and never throws.
 */
export default function useBucketPolicyStatus(bucketName) {
    const [policy, setPolicy] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    const requestId = useRef(0);

    // Resolves { ok: true, policy } on success, { ok: false } on failure or
    // when a newer request superseded this one.
    const load = useCallback(async ({ silent = false } = {}) => {
        if (!bucketName) return { ok: false };

        const myId = ++requestId.current;

        if (silent) setRefreshing(true);
        else setLoading(true);

        setError("");

        try {
            const result = await BucketPolicyAPI.get(bucketName);
            if (myId !== requestId.current) return { ok: false, stale: true };

            const next = result.policy ?? null;
            setPolicy(next);
            return { ok: true, policy: next };
        } catch (err) {
            if (myId !== requestId.current) return { ok: false, stale: true };
            setError(err.message || "Failed to load the bucket policy.");
            return { ok: false };
        } finally {
            if (myId === requestId.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [bucketName]);

    useEffect(() => {
        setPolicy(null);
        load();
    }, [load]);

    const refresh = useCallback(() => load({ silent: true }), [load]);

    const remove = useCallback(async () => {
        try {
            const result = await BucketPolicyAPI.remove(bucketName);
            const after = await load({ silent: true });

            // If the re-read succeeded and RGW still reports statements, the
            // delete did not actually take effect. Say so rather than
            // claiming success.
            if (after.ok && (after.policy?.statements?.length ?? 0) > 0) {
                return {
                    ok: false,
                    error: "RGW accepted the request, but a bucket policy is still attached. The status shown reflects what RGW currently has."
                };
            }

            return { ok: true, message: result?.message };
        } catch (err) {
            return { ok: false, error: err.message || "Failed to remove the bucket policy." };
        }
    }, [bucketName, load]);

    return { policy, loading, refreshing, error, refresh, remove };
}