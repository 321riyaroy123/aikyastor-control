import { req } from "./client";

// Definitions of lifecycle (retention) policies themselves — the reusable
// "Keep 7 Days" / "Keep 30 Days" / custom templates a bucket can be
// assigned. For a BUCKET's currently-assigned lifecycle, see
// BucketLifecycleAPI below. For AWS S3-style bucket ACCESS policies
// (who can do what), see BucketPolicyAPI in ./bucketPolicies.js.
export const LifecyclePolicyAPI = {
    list() {
        return req("/policies");
    },

    create(payload) {
        return req("/policies", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },

    delete(policyId) {
        return req(`/policies/${policyId}`, {
            method: "DELETE"
        });
    },

    usage(policyId) {
        return req(`/policies/${policyId}/usage`);
    },

    run() {
        return req("/policies/run", {
            method: "POST"
        });
    }
};

// A single bucket's assigned lifecycle policy (which LifecyclePolicyAPI
// definition is currently applied to that bucket).
export const BucketLifecycleAPI = {
    get(bucket) {
        return req(
            `/object/buckets/${bucket}/lifecycle`
        );
    },

    put(bucket, lifecycle) {
        return req(
            `/object/buckets/${bucket}/lifecycle`,
            {
                method: "PUT",
                body: JSON.stringify({
                    lifecycle
                })
            }
        );
    },

    remove(bucket) {
        return req(
            `/object/buckets/${bucket}/lifecycle`,
            {
                method: "DELETE"
            }
        );
    }
};