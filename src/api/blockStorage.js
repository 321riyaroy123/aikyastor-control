import { req } from "./client";

export const BlockAPI = {
  pools: () => req("/block/pools"),

  createPool: (name) => req("/block/pools", {
    method: "POST",
    body: JSON.stringify({ name }),
  }),

  images: (pool) =>
    req(`/block/images?pool=${encodeURIComponent(pool)}`),

  mapped: () => req("/block/mapped"),

  createImage: (name, size, pool) => req("/block/images", {
    method: "POST",
    body: JSON.stringify({ name, size, pool }),
  }),

  deleteImage: (name, pool) =>
    req(
      `/block/images/${encodeURIComponent(name)}?pool=${encodeURIComponent(pool)}`,
      { method: "DELETE" }
    ),

  mapImage: (name, pool) =>
    req(
      `/block/images/${encodeURIComponent(name)}/map?pool=${encodeURIComponent(pool)}`,
      { method: "POST" }
    ),

  unmapImage: (target, pool) =>
    req(
      `/block/images/${encodeURIComponent(target)}/unmap?pool=${encodeURIComponent(pool)}`,
      { method: "POST" }
    ),

  exportVault: (name, pool) => req(
    `/block/images/${encodeURIComponent(name)}/export-vault?pool=${encodeURIComponent(pool)}`,
    { method: "POST" }
  ),

  createSnapshot: (name, snapName, pool) =>
    req(`/block/images/${encodeURIComponent(name)}/snapshot`, {
      method: "POST",
      body: JSON.stringify({
        snap_name: snapName,
        pool,
      }),
    }),

  snapshots: (name, pool) =>
    req(
      `/block/images/${encodeURIComponent(name)}/snapshots?pool=${encodeURIComponent(pool)}`
    ),

  downloadSnapshotUrl: (imageName, snapshotName, pool) =>
    `/api/block/images/${encodeURIComponent(
      imageName
    )}/snapshots/${encodeURIComponent(
      snapshotName
    )}/download?pool=${encodeURIComponent(pool)}`,

  deleteSnapshot: (imageName, snapshotName, pool) =>
  req(
    `/block/images/${encodeURIComponent(
      imageName
    )}/snapshots/${encodeURIComponent(
      snapshotName
    )}?pool=${encodeURIComponent(pool)}`,
    {
      method: "DELETE",
    }
  ),
};