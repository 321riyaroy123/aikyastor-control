import { req } from "./client";

export const BlockAPI = {
  images: () => req("/block/images"),
  mapped: () => req("/block/mapped"),

  createImage: (name, size) => req("/block/images", {
    method: "POST",
    body: JSON.stringify({ name, size }),
  }),

  deleteImage: (name) => req(`/block/images/${name}`, { method: "DELETE" }),

  mapImage: (name) => req(`/block/images/${name}/map`, { method: "POST" }),
  unmapImage: (name) => req(`/block/images/${name}/unmap`, { method: "POST" }),

  exportVault: (name) => req(`/block/images/${name}/export-vault`, { method: "POST" }),

  createSnapshot: (name, snapName) => req(`/block/images/${name}/snapshot`, {
    method: "POST",
    body: JSON.stringify({ snap_name: snapName }),
  }),

  snapshots: (name) => req(`/block/images/${name}/snapshots`),
};
