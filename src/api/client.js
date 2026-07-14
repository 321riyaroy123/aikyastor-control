// client.js - the only file that touches fetch() or the in-memory SIM store.
// Extracted unchanged (byte-for-byte behavior) from the original api.js.

import { SIM } from "../simulationData";

export const MODE = import.meta.env.VITE_APP_MODE || "simulation";
export const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function simDelay(ms = 250) {
  return new Promise(r => setTimeout(r, ms));
}

function nowStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function logActivity(action, target, status, detail = "", vault = false) {
  SIM.activity.unshift({ time: nowStamp(), action, target, status, detail, vault });
  if (SIM.activity.length > 100) SIM.activity.pop();
}

function parseBody(opts) {
  if (!opts.body) return {};
  if (opts.body instanceof FormData) return opts.body;
  try { return JSON.parse(opts.body); } catch { return {}; }
}

// Matches paths like /object/buckets/<bucket>/objects/<key>
function matchPath(path, pattern) {
  const pParts = path.split("/").filter(Boolean);
  const tParts = pattern.split("/").filter(Boolean);
  if (pParts.length !== tParts.length) return null;
  const result = {};
  for (let i = 0; i < tParts.length; i++) {
    if (tParts[i].startsWith(":")) {
      result[tParts[i].slice(1)] = decodeURIComponent(pParts[i]);
    } else if (tParts[i] !== pParts[i]) {
      return null;
    }
  }
  return result;
}

async function simRequest(rawPath, opts) {
  await simDelay();

  const method = (opts.method || "GET").toUpperCase();
  const [path, query] = rawPath.split("?");
  const params = new URLSearchParams(query || "");
  const body = parseBody(opts);

  // ── CLUSTER ──────────────────────────────────────────────────────────────
  if (path === "/stats" && method === "GET") return SIM.stats;
  if (path === "/health" && method === "GET") return SIM.health;
  if (path === "/activity" && method === "GET") return { log: SIM.activity };

  // ── VAULT ────────────────────────────────────────────────────────────────
  if (path === "/vault/status" && method === "GET") return SIM.vault;

  // ── OBJECT STORAGE ───────────────────────────────────────────────────────
  if (path === "/object/buckets" && method === "GET") {
    return { buckets: SIM.buckets };
  }

  if (path === "/object/buckets" && method === "POST") {
    const { bucket, owner, acl, versioning, object_locking } = body;
    if (!bucket || !bucket.trim()) return { error: "Bucket name is required" };
    if (SIM.buckets.find(b => b.name === bucket)) return { error: `Bucket '${bucket}' already exists` };
    SIM.buckets.push({ name: bucket, created: new Date().toISOString() });
    SIM.objects[bucket] = [];
    const detail = `Owner:${owner || "default"} ACL:${acl || "private"} Versioning:${!!versioning} ObjLock:${!!object_locking}`;
    logActivity("CREATE BUCKET", bucket, "success", detail);
    return { message: `Bucket '${bucket}' created successfully`, bucket };
  }

  if (path === "/object/users" && method === "GET") return { users: SIM.rgwUsers };

  {
    const m = matchPath(path, "/object/buckets/:bucket");
    if (m && method === "DELETE") {
      const { bucket } = m;
      const count = (SIM.objects[bucket] || []).length;
      SIM.buckets = SIM.buckets.filter(b => b.name !== bucket);
      delete SIM.objects[bucket];
      logActivity("DELETE BUCKET", bucket, "success", `Removed ${count} objects`);
      return { message: `Bucket '${bucket}' deleted` };
    }
  }

  {
    const m = matchPath(path, "/object/buckets/:bucket/objects");
    if (m && method === "GET") return { objects: SIM.objects[m.bucket] || [] };
  }

  {
    const m = matchPath(path, "/object/buckets/:bucket/upload");
    if (m && method === "POST") {
      const { bucket } = m;
      const file = body instanceof FormData ? body.get("file") : null;
      const toVault = body instanceof FormData ? body.get("vault") === "true" : false;
      if (!file) return { error: "No file provided" };
      if (!SIM.objects[bucket]) SIM.objects[bucket] = [];
      SIM.objects[bucket].push({ key: file.name, size: file.size, modified: new Date().toISOString() });
      logActivity("UPLOAD", `${bucket}/${file.name}`, "success", "Saved to Ceph Object Storage");
      let vaultResult = "";
      if (toVault) {
        vaultResult = ` + copied to Vault at /vault/object/${bucket}/`;
        logActivity("VAULT SYNC", `${bucket}/${file.name}`, "success", `Copied to /vault/object/${bucket}/`, true);
      }
      return { message: `'${file.name}' uploaded to '${bucket}'${vaultResult}` };
    }
  }

  {
    const m = matchPath(path, "/object/buckets/:bucket/objects/:key");
    if (m && method === "DELETE") {
      const { bucket, key } = m;
      SIM.objects[bucket] = (SIM.objects[bucket] || []).filter(o => o.key !== key);
      logActivity("DELETE OBJECT", `${bucket}/${key}`, "success");
      return { message: `'${key}' deleted from '${bucket}'` };
    }
  }

  {
    const m = matchPath(path, "/object/buckets/:bucket/sync-vault");
    if (m && method === "POST") {
      const { bucket } = m;
      logActivity("VAULT SYNC (BUCKET)", bucket, "success", `rclone synced to /vault/object/${bucket}/`, true);
      return { message: `Vault sync started for bucket '${bucket}' in background` };
    }
  }

  // ── BLOCK STORAGE ────────────────────────────────────────────────────────
  if (path === "/block/images" && method === "GET") return { images: SIM.rbdImages };

  if (path === "/block/images" && method === "POST") {
    const { name, size } = body;
    if (!name || !name.trim()) return { error: "name required" };
    if (SIM.rbdImages.find(i => i.name === name)) return { error: `Image '${name}' already exists` };
    const sizeMB = parseInt(size, 10) || 1024;
    SIM.rbdImages.push({ name, size: sizeMB * 1024 * 1024, format: 2, features: ["layering"] });
    logActivity("CREATE IMAGE", name, "success", `${sizeMB}MB in pool rbd`);
    return { message: `Image '${name}' (${sizeMB}MB) created` };
  }

  if (path === "/block/mapped" && method === "GET") return { mapped: SIM.mapped };

  {
    const m = matchPath(path, "/block/images/:name");
    if (m && method === "DELETE") {
      const { name } = m;
      SIM.rbdImages = SIM.rbdImages.filter(i => i.name !== name);
      SIM.mapped = SIM.mapped.filter(x => x.name !== name);
      logActivity("DELETE IMAGE", name, "success");
      return { message: `Image '${name}' deleted` };
    }
  }

  {
    const m = matchPath(path, "/block/images/:name/map");
    if (m && method === "POST") {
      const { name } = m;
      if (SIM.mapped.find(x => x.name === name)) return { error: `'${name}' is already mapped` };
      const device = `/dev/rbd${SIM.mapped.length}`;
      SIM.mapped.push({ device, pool: "rbd", name });
      logActivity("MAP IMAGE", name, "success", `Device: ${device}`);
      return { message: `'${name}' mapped to ${device}`, device };
    }
  }

  {
    const m = matchPath(path, "/block/images/:name/unmap");
    if (m && method === "POST") {
      const { name } = m;
      SIM.mapped = SIM.mapped.filter(x => x.name !== name);
      logActivity("UNMAP IMAGE", name, "success");
      return { message: `'${name}' unmapped` };
    }
  }

  {
    const m = matchPath(path, "/block/images/:name/snapshot");
    if (m && method === "POST") {
      const { name } = m;
      const snapName = body.snap_name || `snap-${name}`;
      logActivity("SNAPSHOT", `${name}@${snapName}`, "success");
      return { message: `Snapshot '${snapName}' created for '${name}'` };
    }
  }

  {
    const m = matchPath(path, "/block/images/:name/snapshots");
    if (m && method === "GET") return { snapshots: [] };
  }

  {
    const m = matchPath(path, "/block/images/:name/export-vault");
    if (m && method === "POST") {
      const { name } = m;
      logActivity("VAULT EXPORT (RBD)", name, "success", `Exported to /vault/block/${name}.img`, true);
      return { message: `RBD export of '${name}' to Vault started in background` };
    }
  }

  // ── FILE STORAGE (CephFS) ────────────────────────────────────────────────
  if (path === "/file/browse" && method === "GET") {
    const p = params.get("path") || "";
    if (!(p in SIM.cephfs)) return { error: "Path not found" };
    return { path: p, entries: SIM.cephfs[p] };
  }

  if (path === "/file/upload" && method === "POST") {
    const file = body instanceof FormData ? body.get("file") : null;
    const relPath = body instanceof FormData ? (body.get("path") || "") : "";
    const toVault = body instanceof FormData ? body.get("vault") === "true" : false;
    if (!file) return { error: "No file provided" };
    if (!SIM.cephfs[relPath]) SIM.cephfs[relPath] = [];
    SIM.cephfs[relPath].push({ name: file.name, type: "file", size: file.size, modified: String(Date.now() / 1000) });
    logActivity("UPLOAD (CephFS)", `${relPath || "/"}/${file.name}`, "success", "Saved to CephFS");
    let vaultResult = "";
    if (toVault) {
      vaultResult = " + copied to Vault";
      logActivity("VAULT SYNC (CephFS)", file.name, "success", `rsync → /vault/file/${relPath || "root"}/`, true);
    }
    return { message: `'${file.name}' uploaded to CephFS:${relPath || "/"}${vaultResult}` };
  }

  if (path === "/file/delete" && method === "DELETE") {
    const p = params.get("path") || "";
    const parts = p.split("/").filter(Boolean);
    const name = parts.pop();
    const parent = parts.join("/");
    SIM.cephfs[parent] = (SIM.cephfs[parent] || []).filter(e => e.name !== name);
    delete SIM.cephfs[p];
    logActivity("DELETE (CephFS)", p, "success");
    return { message: `'${p}' deleted from CephFS` };
  }

  if (path === "/file/mkdir" && method === "POST") {
    const fullPath = body.path || "";
    const parts = fullPath.split("/").filter(Boolean);
    const name = parts.pop();
    const parent = parts.join("/");
    if (!SIM.cephfs[parent]) SIM.cephfs[parent] = [];
    SIM.cephfs[parent].push({ name, type: "dir", size: 0, modified: String(Date.now() / 1000) });
    if (!SIM.cephfs[fullPath]) SIM.cephfs[fullPath] = [];
    logActivity("MKDIR (CephFS)", fullPath, "success");
    return { message: `Directory '${fullPath}' created` };
  }

  if (path === "/file/sync-vault" && method === "POST") {
    logActivity("VAULT SYNC (CephFS)", "entire mount", "success", "rsync → /vault/file/", true);
    return { message: "CephFS → Vault sync started in background" };
  }

  // ── FALLBACK ─────────────────────────────────────────────────────────────
  return { error: `Simulation: no handler for ${method} ${path}` };
}

/**
 * req() - the single request dispatcher every api/*.js domain file calls.
 * In simulation MODE, requests are served from the in-memory SIM store.
 * Otherwise, they hit the real Flask backend at BASE.
 */
export async function req(path, opts = {}) {
  if (MODE === "simulation") {
    return simRequest(path, opts);
  }

  const r = await fetch(`${BASE}${path}`, {
    headers: opts.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...opts,
  });

  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data;
}
