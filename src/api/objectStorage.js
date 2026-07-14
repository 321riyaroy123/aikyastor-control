import { req, BASE } from "./client";

export const ObjectAPI = {
  buckets: () => req("/object/buckets"),
  users: () => req("/object/users"),

  createBucket: (payload) => req("/object/buckets", {
    method: "POST",
    body: JSON.stringify(payload),
  }),

  deleteBucket: (bucket) => req(`/object/buckets/${bucket}`, { method: "DELETE" }),

  objects: (bucket) => req(`/object/buckets/${bucket}/objects`),

  uploadObject: (bucket, file, toVault) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("vault", toVault ? "true" : "false");
    return req(`/object/buckets/${bucket}/upload`, { method: "POST", body: fd });
  },

  downloadObjectUrl: (bucket, key) => `${BASE}/object/buckets/${bucket}/objects/${encodeURIComponent(key)}`,

  deleteObject: (bucket, key) => req(`/object/buckets/${bucket}/objects/${key}`, { method: "DELETE" }),

  syncBucketVault: (bucket) => req(`/object/buckets/${bucket}/sync-vault`, { method: "POST" }),

  // Bucket-level lifecycle policy (not wired into any component today —
  // this is the API surface for the future LifecycleSelector UI)
  getBucketPolicy: (bucket) => req(`/object/buckets/${bucket}/policy`),
  assignBucketPolicy: (bucket, policyId) => req(`/object/buckets/${bucket}/policy`, {
    method: "POST",
    body: JSON.stringify({ policy: policyId }),
  }),
  updateBucketPolicy: (bucket, lifecycle) => {
    return req(`/object/buckets/${bucket}/policy`, {
      method: "PUT",
      body: JSON.stringify({
        lifecycle
      })
    });
  },
};

