import { req } from "./client";

export const BucketPolicyAPI = {
    async get(bucket) {
        return req(`/object/buckets/${bucket}/policy`);
    },

    async put(bucket, policy) {
        return req(`/object/buckets/${bucket}/policy`,
            {
                method: "PUT",
                body: JSON.stringify({
                    policy
                })
            }
        );
    },

    async remove(bucket) {
        return req(
            `/object/buckets/${bucket}/policy`,
            {
                method: "DELETE"
            }
        );
    }
};