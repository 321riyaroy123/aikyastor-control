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

  getBucketEncryption: (bucket) =>
      req(`/object/buckets/${bucket}/encryption`),

  setBucketEncryption: (bucket, enabled, type = "AES256") =>
      req(`/object/buckets/${bucket}/encryption`, {
          method: "PUT",
          body: JSON.stringify({
              enabled,
              type,
          }),
      }),

  deleteBucketEncryption: (bucket) =>
      req(`/object/buckets/${bucket}/encryption`, {
          method: "DELETE",
      }),
};

