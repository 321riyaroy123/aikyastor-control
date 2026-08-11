import { req, BASE } from "./client";

export const FileAPI = {
  browse: (path = "") => req(`/file/browse?path=${encodeURIComponent(path)}`),

  upload: (path, file, toVault) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("path", path);
    fd.append("vault", toVault ? "true" : "false");
    return req("/file/upload", { method: "POST", body: fd });
  },

  downloadUrl: (path) => `${BASE}/file/download?path=${encodeURIComponent(path)}`,

  delete: (path) => req(`/file/delete?path=${encodeURIComponent(path)}`, { method: "DELETE" }),

  mkdir: (path) => req("/file/mkdir", {
    method: "POST",
    body: JSON.stringify({ path }),
  }),

  stats: (path = "") => req(`/file/stats?path=${encodeURIComponent(path)}`),

  syncVault: () => req("/file/sync-vault", { method: "POST" }),
};
