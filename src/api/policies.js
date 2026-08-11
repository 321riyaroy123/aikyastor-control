import { req } from "./client";

export const PolicyAPI = {
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


export const LifecycleAPI = {
    listPolicies() {
        return req("/policies");
    },

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
    },

    create(data) {
        return req(
            "/policies",
            {
                method: "POST",
                body: JSON.stringify(data)
            }
        );
    },

    delete(policyId) {
        return req(
            `/policies/${policyId}`,
            {
                method: "DELETE"
            }
        );
    },

    usage(policyId) {
        return req(
            `/policies/${policyId}/usage`
        );
    }
};