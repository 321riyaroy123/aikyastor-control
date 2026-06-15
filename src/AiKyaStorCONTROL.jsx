import { useState, useEffect, useRef, useCallback } from "react";
import { ClusterAPI, VaultAPI, ObjectAPI, BlockAPI, FileAPI } from "./api";

// ─── UTILS ────────────────────────────────────────────────────────────────────
function fmt(bytes) {
  if (bytes === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + " " + u[i];
}
function pct(used, total) { return total ? Math.round((used / total) * 100) : 0; }

// ─── TOAST ────────────────────────────────────────────────────────────────────
let toastId = 0;
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, type = "info", dur = 4000) => {
    const id = ++toastId;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), dur);
  }, []);
  return [toasts, toast];
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, width = 440 }) {
  useEffect(() => {
    if (!open) return;
    const h = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div style={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...styles.modal, width }}>
        <div style={styles.modalTitle}>{title}</div>
        {children}
      </div>
    </div>
  );
}

// ─── VAULT POPUP ─────────────────────────────────────────────────────────────
function VaultPopup({ file, onDecide, onClose }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modal, width: 400, textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: ".75rem" }}>🔒</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: "1rem", marginBottom: ".4rem" }}>Save to Vault?</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: ".78rem", color: "var(--accent)", marginBottom: ".5rem", wordBreak: "break-all" }}>{file.name}</div>
        <div style={{ fontSize: ".82rem", color: "var(--muted)", marginBottom: "1.75rem", lineHeight: 1.5 }}>
          Do you also want to back up this file to the Vault (cold storage) after uploading to Ceph?
        </div>
        <div style={{ display: "flex", gap: ".75rem", justifyContent: "center" }}>
          <button style={{ ...styles.btn, ...styles.btnGhost, flex: 1, justifyContent: "center" }} onClick={() => onDecide(false)}>Ceph Only</button>
          <button style={{ ...styles.btn, ...styles.btnVault, flex: 1, justifyContent: "center" }} onClick={() => onDecide(true)}>🔒 + Vault</button>
        </div>
      </div>
    </div>
  );
}

// ─── STYLES (CSS-in-JS mirroring original design tokens) ──────────────────────
const C = {
  bg: "#0a0c10", surface: "#111318", surface2: "#181c24", border: "#1e2430",
  accent: "#f97316", accent2: "#fb923c", blue: "#38bdf8", green: "#4ade80",
  red: "#f87171", yellow: "#fbbf24", purple: "#a78bfa", text: "#e2e8f0", muted: "#64748b",
};
const styles = {
  modalOverlay: { position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000 },
  modal: { background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"1.75rem",maxWidth:"90vw",maxHeight:"90vh",overflowY:"auto" },
  modalTitle: { fontFamily:"'Space Mono',monospace",fontSize:".95rem",marginBottom:"1.25rem",color:C.accent },
  btn: { display:"inline-flex",alignItems:"center",gap:".5rem",padding:".5rem 1rem",borderRadius:5,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:".85rem",fontWeight:500,transition:"all .15s" },
  btnPrimary: { background:C.accent,color:"#000" },
  btnGhost: { background:"transparent",color:C.muted,border:`1px solid ${C.border}` },
  btnDanger: { background:"transparent",color:C.red,border:`1px solid rgba(248,113,113,.3)` },
  btnBlue: { background:"transparent",color:C.blue,border:`1px solid rgba(56,189,248,.3)` },
  btnGreen: { background:"transparent",color:C.green,border:`1px solid rgba(74,222,128,.3)` },
  btnVault: { background:"rgba(167,139,250,.12)",color:C.purple,border:`1px solid rgba(167,139,250,.3)` },
  btnSm: { padding:".3rem .7rem",fontSize:".78rem" },
  formInput: { width:"100%",background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:".55rem .75rem",borderRadius:5,fontFamily:"inherit",fontSize:".85rem",outline:"none",boxSizing:"border-box" },
  tableWrap: { background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",marginBottom:"1.5rem" },
};

function Btn({ variant = "ghost", size, onClick, children, style, disabled, as: Tag = "button", href, download }) {
  const variantStyle = styles[`btn${variant.charAt(0).toUpperCase()+variant.slice(1)}`] || {};
  const sizeStyle = size === "sm" ? styles.btnSm : {};
  const props = { onClick, disabled, style: { ...styles.btn, ...variantStyle, ...sizeStyle, ...style, opacity: disabled ? .5 : 1 } };
  if (Tag === "a") return <a href={href} download={download} {...props}>{children}</a>;
  return <button {...props}>{children}</button>;
}

function Badge({ color = "blue", children }) {
  const colors = {
    blue: { background:"rgba(56,189,248,.1)",color:C.blue,border:"1px solid rgba(56,189,248,.25)" },
    green: { background:"rgba(74,222,128,.1)",color:C.green,border:"1px solid rgba(74,222,128,.25)" },
    orange: { background:"rgba(249,115,22,.1)",color:C.accent,border:"1px solid rgba(249,115,22,.25)" },
    red: { background:"rgba(248,113,113,.1)",color:C.red,border:"1px solid rgba(248,113,113,.25)" },
    vault: { background:"rgba(167,139,250,.1)",color:C.purple,border:"1px solid rgba(167,139,250,.25)" },
  };
  return <span style={{ display:"inline-block",padding:".15rem .5rem",borderRadius:3,fontFamily:"'Space Mono',monospace",fontSize:".68rem",...colors[color] }}>{children}</span>;
}

function StatCard({ label, value, sub, pctVal, vault }) {
  return (
    <div style={{ background: vault ? "rgba(167,139,250,.04)" : C.surface, border: `1px solid ${vault ? "rgba(167,139,250,.3)" : C.border}`, borderRadius:8, padding:"1.25rem 1.5rem" }}>
      <div style={{ fontFamily:"'Space Mono',monospace",fontSize:".7rem",color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:".5rem" }}>{label}</div>
      <div style={{ fontFamily:"'Space Mono',monospace",fontSize:"1.4rem",color: vault ? C.purple : C.text }}>{value}</div>
      {sub && <div style={{ fontSize:".78rem",color:C.muted,marginTop:".25rem" }}>{sub}</div>}
      {pctVal !== undefined && (
        <div style={{ height:4,background:C.border,borderRadius:2,marginTop:".75rem",overflow:"hidden" }}>
          <div style={{ height:"100%",background:C.accent,borderRadius:2,width:`${pctVal}%`,transition:"width .5s" }} />
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <span style={{ display:"inline-block",width:14,height:14,border:`2px solid ${C.border}`,borderTopColor:C.accent,borderRadius:"50%",animation:"spin .6s linear infinite",flexShrink:0 }} />;
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTIONS
// ═════════════════════════════════════════════════════════════════════════════

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ stats, health, vault, activity, onRefreshActivity }) {
  const used = stats ? pct(stats.total_used_raw, stats.total_bytes) : 0;
  const statusColor = health?.status === "HEALTH_OK" ? C.green : health?.status?.includes("WARN") ? C.yellow : C.red;

  return (
    <div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:"1rem",marginBottom:"1.5rem" }}>
        <StatCard label="Total Capacity" value={stats ? fmt(stats.total_bytes) : "—"} sub="raw cluster storage" />
        <StatCard label="Used" value={stats ? fmt(stats.total_used_raw) : "—"} sub={stats ? `${used}% of total` : "—"} pctVal={used} />
        <StatCard label="Available" value={stats ? fmt(stats.total_avail) : "—"} sub="free space" />
        <StatCard label="Vault Free" value={vault ? fmt(vault.free) : "—"} sub={vault?.path || "/vault"} vault />
      </div>

      <div style={styles.tableWrap}>
        <table style={{ width:"100%",borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:C.surface2 }}>
              {["Component","Type","Status","Details"].map(h => (
                <th key={h} style={{ fontFamily:"'Space Mono',monospace",fontSize:".7rem",color:C.muted,textTransform:"uppercase",letterSpacing:1,padding:".75rem 1rem",textAlign:"left",borderBottom:`1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding:".75rem 1rem",fontFamily:"'Space Mono',monospace",fontSize:".85rem",borderBottom:`1px solid ${C.border}` }}>RGW / S3</td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}` }}><Badge color="blue">Object</Badge></td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}` }}><Badge color="green">Active</Badge></td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}`,color:C.muted,fontSize:".8rem" }}>192.168.29.252:80</td>
            </tr>
            <tr>
              <td style={{ padding:".75rem 1rem",fontFamily:"'Space Mono',monospace",fontSize:".85rem",borderBottom:`1px solid ${C.border}` }}>RBD Pool</td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}` }}><Badge color="orange">Block</Badge></td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}` }}><Badge color="green">Active</Badge></td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}`,color:C.muted,fontSize:".8rem" }}>pool: rbd</td>
            </tr>
            <tr>
              <td style={{ padding:".75rem 1rem",fontFamily:"'Space Mono',monospace",fontSize:".85rem",borderBottom:`1px solid ${C.border}` }}>CephFS</td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}` }}><Badge color="blue">File</Badge></td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}` }}><Badge color="green">Mounted</Badge></td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}`,color:C.muted,fontSize:".8rem" }}>/mnt/cephfs</td>
            </tr>
            <tr>
              <td style={{ padding:".75rem 1rem",fontFamily:"'Space Mono',monospace",fontSize:".85rem" }}>Vault Disk</td>
              <td style={{ padding:".75rem 1rem" }}><Badge color="vault">Backup</Badge></td>
              <td style={{ padding:".75rem 1rem" }}><Badge color="vault">{vault?.mounted ? "Mounted" : "—"}</Badge></td>
              <td style={{ padding:".75rem 1rem",color:C.muted,fontSize:".8rem" }}>/vault (sdf1)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <ActivityFeed activity={activity} onRefresh={onRefreshActivity} />
    </div>
  );
}

// ── ACTIVITY FEED ─────────────────────────────────────────────────────────────
function ActivityFeed({ activity, onRefresh, vaultOnly }) {
  const rows = vaultOnly ? activity.filter(a => a.vault) : activity;
  return (
    <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden" }}>
      <div style={{ padding:".75rem 1rem",background:C.surface2,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <span style={{ fontFamily:"'Space Mono',monospace",fontSize:".75rem",color:C.muted,textTransform:"uppercase",letterSpacing:1 }}>{vaultOnly ? "🔒 Vault Activity" : "⚡ Activity Log"}</span>
        {onRefresh && <Btn variant="ghost" size="sm" onClick={onRefresh}>↻ Refresh</Btn>}
      </div>
      <div style={{ maxHeight:340,overflowY:"auto" }}>
        {rows.length === 0 ? (
          <div style={{ padding:"2rem",textAlign:"center",color:C.muted,fontFamily:"'Space Mono',monospace",fontSize:".78rem" }}>No activity yet</div>
        ) : rows.map((a, i) => {
          const statusColor = a.status === "success" ? C.green : a.status === "error" ? C.red : C.blue;
          return (
            <div key={i} style={{ display:"grid",gridTemplateColumns:"120px 130px 80px 1fr",gap:".75rem",padding:".65rem 1rem",borderBottom:i < rows.length-1?`1px solid ${C.border}`:"none",fontSize:".78rem",alignItems:"center" }}>
              <span style={{ color:C.muted,fontFamily:"'Space Mono',monospace",fontSize:".7rem" }}>{a.time}</span>
              <span style={{ fontFamily:"'Space Mono',monospace",fontSize:".72rem",color:C.text }}>{a.action}</span>
              <span style={{ color:statusColor,fontFamily:"'Space Mono',monospace",fontSize:".7rem",textTransform:"uppercase" }}>{a.status}</span>
              <span style={{ color:C.muted,fontSize:".73rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{a.target} {a.detail && `· ${a.detail}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── OBJECT STORAGE ────────────────────────────────────────────────────────────
function ObjectStorage({ toast, buckets, reloadBuckets }) {
  const [objects, setObjects] = useState(null);
  const [currentBucket, setCurrentBucket] = useState(null);
  const [users, setUsers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name:"", owner:"", acl:"private", versioning:false, locking:false });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [vaultPopup, setVaultPopup] = useState(null);
  const fileRef = useRef();
  const dropRef = useRef();

  useEffect(() => {
    ObjectAPI.users().then(d => setUsers(d.users || [])).catch(() => {});
  }, []);

  const openBucket = async b => {
    setCurrentBucket(b);
    try {
      const result = await ObjectAPI.objects(b.name);
      setObjects(result.objects || []);
    } catch (err) {
      toast(err.message, "error");
      setObjects([]);
    }
  };
  const closeBucket = () => { setCurrentBucket(null); setObjects(null); };

  const createBucket = async () => {
    if (!form.name.trim()) { setError("Bucket name is required"); return; }
    if (!/^[a-z0-9-]{3,63}$/.test(form.name)) { setError("Lowercase letters, numbers, hyphens only. 3–63 chars."); return; }
    if (buckets.find(b => b.name === form.name)) { setError(`Bucket '${form.name}' already exists`); return; }
    setLoading(true);
    try {
      const result = await ObjectAPI.createBucket({
        bucket: form.name,
        owner: form.owner,
        acl: form.acl,
        versioning: form.versioning,
        object_locking: form.locking,
      });
      setShowCreate(false);
      setForm({ name:"", owner:"", acl:"private", versioning:false, locking:false });
      setError("");
      toast(result.message || `Bucket '${form.name}' created successfully`, "success");
      await reloadBuckets();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteBucket = async name => {
    if (!confirm(`Delete bucket "${name}"? This will remove all objects.`)) return;
    try {
      const result = await ObjectAPI.deleteBucket(name);
      toast(result.message || `Bucket '${name}' deleted`, "success");
      if (currentBucket?.name === name) closeBucket();
      await reloadBuckets();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const handleUpload = (file) => {
    setVaultPopup({ file, cb: async (toVault) => {
      setVaultPopup(null);
      try {
        const result = await ObjectAPI.uploadObject(currentBucket.name, file, toVault);
        toast(result.message, toVault ? "vault" : "success", 5000);
        const refreshed = await ObjectAPI.objects(currentBucket.name);
        setObjects(refreshed.objects || []);
      } catch (err) {
        toast(err.message, "error");
      }
    }});
  };

  const deleteObject = async (key) => {
    if (!confirm(`Delete "${key}"?`)) return;
    try {
      const result = await ObjectAPI.deleteObject(currentBucket.name, key);
      toast(result.message || `'${key}' deleted from '${currentBucket.name}'`, "success");
      const refreshed = await ObjectAPI.objects(currentBucket.name);
      setObjects(refreshed.objects || []);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const syncBucketVault = async () => {
    try {
      const result = await ObjectAPI.syncBucketVault(currentBucket.name);
      toast(result.message || `Vault sync started for bucket '${currentBucket.name}' in background`, "vault", 6000);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const Th = ({ children }) => <th style={{ fontFamily:"'Space Mono',monospace",fontSize:".7rem",color:C.muted,textTransform:"uppercase",letterSpacing:1,padding:".75rem 1rem",textAlign:"left",background:C.surface2,borderBottom:`1px solid ${C.border}` }}>{children}</th>;
  const Td = ({ children, style }) => <td style={{ padding:".75rem 1rem",fontSize:".85rem",borderBottom:`1px solid ${C.border}`,...style }}>{children}</td>;

  return (
    <div>
      {vaultPopup && <VaultPopup file={vaultPopup.file} onDecide={vaultPopup.cb} onClose={() => setVaultPopup(null)} />}

      {!currentBucket ? (
        <>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.5rem",flexWrap:"wrap",gap:".5rem" }}>
            <div style={{ fontFamily:"'Space Mono',monospace",fontSize:"1rem",color:C.text,display:"flex",alignItems:"center",gap:".75rem" }}>
              ◉ Object Storage <span style={{ fontSize:".65rem",padding:".2rem .6rem",borderRadius:3,background:"rgba(249,115,22,.15)",color:C.accent,border:"1px solid rgba(249,115,22,.3)" }}>S3 / RGW</span>
            </div>
            <Btn variant="primary" size="sm" onClick={() => { setShowCreate(true); setError(""); }}>+ New Bucket</Btn>
          </div>

          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:"1rem",marginBottom:"1.5rem" }}>
            {buckets.map(b => (
              <div key={b.name} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"1rem",cursor:"pointer",transition:"all .15s" }}
                onClick={() => openBucket(b)}
                onMouseEnter={e => { e.currentTarget.style.borderColor=C.accent; e.currentTarget.style.background=C.surface2; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.background=C.surface; }}>
                <div style={{ fontSize:"1.5rem",marginBottom:".5rem" }}>🪣</div>
                <div style={{ fontFamily:"'Space Mono',monospace",fontSize:".85rem",color:C.text,marginBottom:".35rem" }}>{b.name}</div>
                <div style={{ fontSize:".75rem",color:C.muted }}>Created {new Date(b.created).toLocaleDateString()}</div>
                <div style={{ marginTop:".6rem",display:"flex",gap:".4rem",justifyContent:"flex-end" }} onClick={e => e.stopPropagation()}>
                  <Btn variant="danger" size="sm" onClick={() => deleteBucket(b.name)}>✕</Btn>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.5rem",flexWrap:"wrap",gap:".5rem" }}>
            <div style={{ display:"flex",alignItems:"center",gap:".75rem" }}>
              <Btn variant="ghost" size="sm" onClick={closeBucket}>← Back</Btn>
              <span style={{ fontFamily:"'Space Mono',monospace",fontSize:".9rem",color:C.text }}>{currentBucket.name}</span>
            </div>
            <div style={{ display:"flex",gap:".5rem",flexWrap:"wrap" }}>
              <label style={{ ...styles.btn,...styles.btnPrimary,...styles.btnSm,cursor:"pointer" }}>
                ↑ Upload <input type="file" style={{ display:"none" }} ref={fileRef} onChange={e => { if (e.target.files[0]) { handleUpload(e.target.files[0]); e.target.value=""; } }} />
              </label>
              <Btn variant="vault" size="sm" onClick={syncBucketVault}>🔒 Sync Bucket → Vault</Btn>
            </div>
          </div>

          <div style={{ border:`2px dashed ${C.border}`,borderRadius:8,padding:"2rem",textAlign:"center",cursor:"pointer",marginBottom:"1rem",position:"relative" }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor=C.accent; }}
            onDragLeave={e => { e.currentTarget.style.borderColor=C.border; }}
            onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor=C.border; const f=e.dataTransfer.files[0]; if(f) handleUpload(f); }}>
            <div style={{ fontSize:"1.5rem",pointerEvents:"none" }}>☁</div>
            <p style={{ color:C.muted,fontSize:".85rem",marginTop:".3rem" }}><strong style={{ color:C.accent }}>Click or drag & drop</strong> to upload</p>
            <input type="file" style={{ position:"absolute",inset:0,opacity:0,cursor:"pointer",width:"100%",height:"100%" }} onChange={e => { if (e.target.files[0]) { handleUpload(e.target.files[0]); e.target.value=""; }}} />
          </div>

          <div style={styles.tableWrap}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr><Th>Key</Th><Th>Size</Th><Th>Modified</Th><Th>Actions</Th></tr></thead>
              <tbody>
                {objects.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign:"center",color:C.muted,padding:"2rem",fontFamily:"'Space Mono',monospace",fontSize:".8rem" }}>No objects</td></tr>
                ) : objects.map((o, i) => (
                  <tr key={i}>
                    <Td style={{ fontFamily:"'Space Mono',monospace",fontSize:".82rem" }}>{o.key}</Td>
                    <Td>{fmt(o.size)}</Td>
                    <Td style={{ color:C.muted,fontSize:".8rem" }}>{new Date(o.modified).toLocaleString()}</Td>
                    <Td>
                      <div style={{ display:"flex",gap:".4rem" }}>
                        <Btn as="a" href={ObjectAPI.downloadObjectUrl(currentBucket.name, o.key)} download variant="blue" size="sm">↓</Btn>
                        <Btn variant="danger" size="sm" onClick={() => deleteObject(o.key)}>✕</Btn>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setError(""); }} title="// NEW BUCKET" width={520}>
        <div style={{ marginBottom:"1rem" }}>
          <label style={{ display:"block",fontSize:".8rem",color:C.muted,marginBottom:".4rem",fontFamily:"'Space Mono',monospace" }}>Bucket Name *</label>
          <input style={styles.formInput} placeholder="e.g. my-bucket-01" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} autoFocus />
          <div style={{ fontSize:".72rem",color:C.muted,marginTop:".3rem" }}>Lowercase letters, numbers, hyphens only. 3–63 chars.</div>
        </div>
        <div style={{ marginBottom:"1rem" }}>
          <label style={{ display:"block",fontSize:".8rem",color:C.muted,marginBottom:".4rem",fontFamily:"'Space Mono',monospace" }}>Owner (RGW User)</label>
          <select style={styles.formInput} value={form.owner} onChange={e => setForm(f => ({...f, owner: e.target.value}))}>
            <option value="">— Select user —</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:"1rem" }}>
          <label style={{ display:"block",fontSize:".8rem",color:C.muted,marginBottom:".4rem",fontFamily:"'Space Mono',monospace" }}>Access Control (ACL)</label>
          <select style={styles.formInput} value={form.acl} onChange={e => setForm(f => ({...f, acl: e.target.value}))}>
            <option value="private">Private — Only owner has full control</option>
            <option value="public-read">Public Read — Anyone can read</option>
            <option value="public-read-write">Public Read/Write — Anyone can read and write</option>
            <option value="authenticated-read">Authenticated Read — Authenticated users can read</option>
          </select>
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:".6rem",marginBottom:"1rem" }}>
          <div style={{ fontFamily:"'Space Mono',monospace",fontSize:".7rem",color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:".2rem" }}>Options</div>
          {[["versioning","Enable Versioning","Keep multiple versions of each object"],["locking","Enable Object Locking (WORM)","Write-once, read-many. Cannot be disabled later."]].map(([key,label,desc]) => (
            <label key={key} style={{ display:"flex",alignItems:"flex-start",gap:".6rem",cursor:"pointer",padding:".6rem .8rem",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:6 }}>
              <input type="checkbox" checked={form[key]} onChange={e => setForm(f => ({...f, [key]: e.target.checked}))} style={{ marginTop:2,accentColor:C.accent }} />
              <div>
                <div style={{ fontSize:".85rem",fontWeight:500 }}>{label}</div>
                <div style={{ fontSize:".75rem",color:C.muted,marginTop:".15rem" }}>{desc}</div>
              </div>
            </label>
          ))}
        </div>
        {error && <div style={{ padding:".6rem .8rem",background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",borderRadius:6,color:C.red,fontSize:".82rem",marginBottom:".75rem" }}>{error}</div>}
        <div style={{ display:"flex",gap:".75rem",marginTop:"1.5rem",justifyContent:"flex-end" }}>
          <Btn variant="ghost" onClick={() => { setShowCreate(false); setError(""); }}>Cancel</Btn>
          <Btn variant="primary" onClick={createBucket} disabled={loading}>{loading ? "Creating..." : "Create Bucket"}</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ── BLOCK STORAGE ─────────────────────────────────────────────────────────────
function BlockStorage({ toast, images, reloadImages }) {
  const [mapped, setMapped] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showSnap, setShowSnap] = useState(null);
  const [form, setForm] = useState({ name:"", size:1024, vault:false });
  const [snapName, setSnapName] = useState("");

  const loadMapped = useCallback(async () => {
    try {
      const result = await BlockAPI.mapped();
      setMapped(result.mapped || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { loadMapped(); }, [loadMapped]);

  const createImage = async () => {
    if (!form.name.trim()) { toast("Image name required", "error"); return; }
    try {
      const result = await BlockAPI.createImage(form.name, form.size);
      toast(result.message || `Image '${form.name}' (${form.size}MB) created`, "success");
      setShowCreate(false);
      const name = form.name, doVault = form.vault;
      setForm({ name:"", size:1024, vault:false });
      await reloadImages();
      if (doVault) {
        await exportVault(name);
      }
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const deleteImage = async name => {
    if (!confirm(`Delete image "${name}"?`)) return;
    try {
      const result = await BlockAPI.deleteImage(name);
      toast(result.message || `Image '${name}' deleted`, "success");
      await reloadImages();
      await loadMapped();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const mapImage = async name => {
    try {
      const result = await BlockAPI.mapImage(name);
      toast(result.message || `'${name}' mapped`, "success");
      await loadMapped();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const unmapImage = async name => {
    try {
      const result = await BlockAPI.unmapImage(name);
      toast(result.message || `'${name}' unmapped`, "success");
      await loadMapped();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const createSnapshot = async () => {
    if (!snapName) { toast("Snapshot name required","error"); return; }
    try {
      const result = await BlockAPI.createSnapshot(showSnap, snapName);
      toast(result.message || `Snapshot '${snapName}' created for '${showSnap}'`, "success");
      setShowSnap(null);
      setSnapName("");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const exportVault = async name => {
    toast(`Exporting "${name}" → Vault (background)...`, "vault", 6000);
    try {
      const result = await BlockAPI.exportVault(name);
      toast(result.message || `RBD export of '${name}' to Vault started in background`, "vault", 6000);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const Th = ({ children }) => <th style={{ fontFamily:"'Space Mono',monospace",fontSize:".7rem",color:C.muted,textTransform:"uppercase",letterSpacing:1,padding:".75rem 1rem",textAlign:"left",background:C.surface2,borderBottom:`1px solid ${C.border}` }}>{children}</th>;
  const Td = ({ children, style }) => <td style={{ padding:".75rem 1rem",fontSize:".85rem",borderBottom:`1px solid ${C.border}`,...style }}>{children}</td>;

  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.5rem" }}>
        <div style={{ fontFamily:"'Space Mono',monospace",fontSize:"1rem",color:C.text,display:"flex",alignItems:"center",gap:".75rem" }}>
          ▣ Block Storage <span style={{ fontSize:".65rem",padding:".2rem .6rem",borderRadius:3,background:"rgba(249,115,22,.15)",color:C.accent,border:"1px solid rgba(249,115,22,.3)" }}>RBD</span>
        </div>
        <Btn variant="primary" size="sm" onClick={() => setShowCreate(true)}>+ New Image</Btn>
      </div>

      <div style={{ marginBottom:"1.5rem" }}>
        <div style={{ fontFamily:"'Space Mono',monospace",fontSize:".7rem",color:C.muted,marginBottom:".75rem",textTransform:"uppercase",letterSpacing:1 }}>Mapped Devices</div>
        <div style={styles.tableWrap}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr><Th>Device</Th><Th>Pool</Th><Th>Image</Th><Th>Actions</Th></tr></thead>
            <tbody>
              {mapped.length === 0
                ? <tr><td colSpan={4} style={{ textAlign:"center",color:C.muted,padding:"2rem",fontFamily:"'Space Mono',monospace",fontSize:".8rem" }}>No mapped devices</td></tr>
                : mapped.map((m, i) => (
                  <tr key={i}>
                    <Td style={{ fontFamily:"'Space Mono',monospace",fontSize:".82rem" }}>{m.device}</Td>
                    <Td>{m.pool}</Td>
                    <Td>{m.name}</Td>
                    <Td><Btn variant="ghost" size="sm" onClick={() => unmapImage(m.name)}>Unmap</Btn></Td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div style={{ fontFamily:"'Space Mono',monospace",fontSize:".7rem",color:C.muted,marginBottom:".75rem",textTransform:"uppercase",letterSpacing:1 }}>RBD Images</div>
        <div style={styles.tableWrap}>
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr><Th>Name</Th><Th>Size</Th><Th>Format</Th><Th>Features</Th><Th>Actions</Th></tr></thead>
            <tbody>
              {images.map((img, i) => (
                <tr key={i}>
                  <Td style={{ fontFamily:"'Space Mono',monospace",fontSize:".82rem" }}>{img.name}</Td>
                  <Td>{fmt(img.size)}</Td>
                  <Td>{img.format}</Td>
                  <Td style={{ fontSize:".75rem" }}>
                    <div style={{ display:"flex",gap:".25rem",flexWrap:"wrap" }}>
                      {img.features.map(f => <Badge key={f} color="blue">{f}</Badge>)}
                      {img.features.length === 0 && <span style={{ color:C.muted }}>—</span>}
                    </div>
                  </Td>
                  <Td>
                    <div style={{ display:"flex",gap:".4rem",flexWrap:"wrap" }}>
                      {mapped.find(m => m.name === img.name)
                        ? <Btn variant="ghost" size="sm" onClick={() => unmapImage(img.name)}>Unmap</Btn>
                        : <Btn variant="green" size="sm" onClick={() => mapImage(img.name)}>Map</Btn>}
                      <Btn variant="ghost" size="sm" onClick={() => { setShowSnap(img.name); setSnapName(`snap-${img.name}-${Date.now()}`); }}>Snap</Btn>
                      <Btn variant="vault" size="sm" onClick={() => exportVault(img.name)}>→ Vault</Btn>
                      <Btn variant="danger" size="sm" onClick={() => deleteImage(img.name)}>✕</Btn>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="// NEW RBD IMAGE">
        <div style={{ marginBottom:"1rem" }}>
          <label style={{ display:"block",fontSize:".8rem",color:C.muted,marginBottom:".4rem",fontFamily:"'Space Mono',monospace" }}>Image Name</label>
          <input style={styles.formInput} placeholder="disk1" value={form.name} onChange={e => setForm(f => ({...f, name:e.target.value}))} autoFocus />
        </div>
        <div style={{ marginBottom:"1rem" }}>
          <label style={{ display:"block",fontSize:".8rem",color:C.muted,marginBottom:".4rem",fontFamily:"'Space Mono',monospace" }}>Size (MB)</label>
          <input style={styles.formInput} placeholder="1024" type="number" value={form.size} onChange={e => setForm(f => ({...f, size:e.target.value}))} />
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:".5rem",padding:".6rem .8rem",borderRadius:6,background:"rgba(167,139,250,.07)",border:"1px solid rgba(167,139,250,.2)",marginBottom:"1rem" }}>
          <input type="checkbox" id="vaultExport" checked={form.vault} onChange={e => setForm(f => ({...f, vault:e.target.checked}))} style={{ accentColor:C.purple,width:16,height:16 }} />
          <label htmlFor="vaultExport" style={{ fontSize:".82rem",color:C.purple,cursor:"pointer",fontFamily:"'Space Mono',monospace" }}>🔒 Also export to Vault after creation (rbd export)</label>
        </div>
        <div style={{ display:"flex",gap:".75rem",marginTop:"1.5rem",justifyContent:"flex-end" }}>
          <Btn variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Btn>
          <Btn variant="primary" onClick={createImage}>Create</Btn>
        </div>
      </Modal>

      <Modal open={!!showSnap} onClose={() => setShowSnap(null)} title="// CREATE SNAPSHOT">
        <div style={{ marginBottom:"1rem" }}>
          <label style={{ display:"block",fontSize:".8rem",color:C.muted,marginBottom:".4rem",fontFamily:"'Space Mono',monospace" }}>Snapshot Name</label>
          <input style={styles.formInput} value={snapName} onChange={e => setSnapName(e.target.value)} autoFocus />
        </div>
        <div style={{ display:"flex",gap:".75rem",marginTop:"1.5rem",justifyContent:"flex-end" }}>
          <Btn variant="ghost" onClick={() => setShowSnap(null)}>Cancel</Btn>
          <Btn variant="primary" onClick={createSnapshot}>Snapshot</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ── FILE STORAGE ──────────────────────────────────────────────────────────────
function FileStorage({ toast }) {
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState([]);
  const [showMkdir, setShowMkdir] = useState(false);
  const [newDir, setNewDir] = useState("");
  const [vaultPopup, setVaultPopup] = useState(null);

  const browse = useCallback(async (p) => {
    setPath(p);
    try {
      const result = await FileAPI.browse(p);
      setEntries(result.entries || []);
    } catch (err) {
      toast(err.message, "error");
      setEntries([]);
    }
  }, [toast]);

  useEffect(() => { browse(""); }, [browse]);

  const pathParts = path ? path.split("/").filter(Boolean) : [];

  const handleUpload = (file) => {
    setVaultPopup({ file, cb: async (toVault) => {
      setVaultPopup(null);
      try {
        const result = await FileAPI.upload(path, file, toVault);
        toast(result.message, toVault ? "vault" : "success", 5000);
        await browse(path);
      } catch (err) {
        toast(err.message, "error");
      }
    }});
  };

  const deleteEntry = async (name) => {
    const fullPath = (path ? path + "/" : "") + name;
    if (!confirm(`Delete "${fullPath}"?`)) return;
    try {
      const result = await FileAPI.delete(fullPath);
      toast(result.message || `'${fullPath}' deleted from CephFS`, "success");
      await browse(path);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const mkdir = async () => {
    if (!newDir.trim()) { toast("Enter folder name", "error"); return; }
    const fullPath = (path ? path + "/" : "") + newDir;
    try {
      const result = await FileAPI.mkdir(fullPath);
      toast(result.message || `Directory '${fullPath}' created`, "success");
      setShowMkdir(false);
      setNewDir("");
      await browse(path);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const syncVault = async () => {
    toast("Starting CephFS → Vault rsync (background)...", "vault", 6000);
    try {
      const result = await FileAPI.syncVault();
      toast(result.message || "CephFS → Vault sync started in background", "vault", 6000);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const Th = ({ children }) => <th style={{ fontFamily:"'Space Mono',monospace",fontSize:".7rem",color:C.muted,textTransform:"uppercase",letterSpacing:1,padding:".75rem 1rem",textAlign:"left",background:C.surface2,borderBottom:`1px solid ${C.border}` }}>{children}</th>;

  return (
    <div>
      {vaultPopup && <VaultPopup file={vaultPopup.file} onDecide={vaultPopup.cb} onClose={() => setVaultPopup(null)} />}

      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.5rem",flexWrap:"wrap",gap:".5rem" }}>
        <div style={{ fontFamily:"'Space Mono',monospace",fontSize:"1rem",color:C.text,display:"flex",alignItems:"center",gap:".75rem" }}>
          ⊞ File Storage <span style={{ fontSize:".65rem",padding:".2rem .6rem",borderRadius:3,background:"rgba(249,115,22,.15)",color:C.accent,border:"1px solid rgba(249,115,22,.3)" }}>CephFS</span>
        </div>
        <div style={{ display:"flex",gap:".5rem",flexWrap:"wrap" }}>
          <Btn variant="ghost" size="sm" onClick={() => setShowMkdir(true)}>+ Folder</Btn>
          <label style={{ ...styles.btn,...styles.btnPrimary,...styles.btnSm,cursor:"pointer" }}>
            ↑ Upload <input type="file" style={{ display:"none" }} onChange={e => { if (e.target.files[0]) { handleUpload(e.target.files[0]); e.target.value=""; }}} />
          </label>
          <Btn variant="vault" size="sm" onClick={syncVault}>🔒 Sync All → Vault</Btn>
        </div>
      </div>

      {/* Breadcrumb */}
      <div style={{ display:"flex",alignItems:"center",gap:".25rem",fontFamily:"'Space Mono',monospace",fontSize:".78rem",color:C.muted,marginBottom:"1rem",padding:".6rem 1rem",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:6,flexWrap:"wrap" }}>
        <span style={{ cursor:"pointer",color:C.blue }} onClick={() => browse("")}>root</span>
        {pathParts.map((p, i) => {
          const sub = pathParts.slice(0, i+1).join("/");
          return [
            <span key={`sep-${i}`} style={{ color:C.border }}> / </span>,
            <span key={`part-${i}`} style={{ cursor:"pointer",color:C.blue }} onClick={() => browse(sub)}>{p}</span>
          ];
        })}
      </div>

      {/* Drop zone */}
      <div style={{ border:`2px dashed ${C.border}`,borderRadius:8,padding:"2rem",textAlign:"center",cursor:"pointer",marginBottom:"1rem",position:"relative" }}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor=C.accent; }}
        onDragLeave={e => { e.currentTarget.style.borderColor=C.border; }}
        onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor=C.border; const f=e.dataTransfer.files[0]; if(f) handleUpload(f); }}>
        <div style={{ fontSize:"1.5rem",pointerEvents:"none" }}>📁</div>
        <p style={{ color:C.muted,fontSize:".85rem",marginTop:".3rem" }}><strong style={{ color:C.accent }}>Click or drag & drop</strong> to upload to current folder</p>
        <input type="file" style={{ position:"absolute",inset:0,opacity:0,cursor:"pointer",width:"100%",height:"100%" }} onChange={e => { if (e.target.files[0]) { handleUpload(e.target.files[0]); e.target.value=""; }}} />
      </div>

      <div style={styles.tableWrap}>
        <table style={{ width:"100%",borderCollapse:"collapse" }}>
          <thead><tr><Th>Name</Th><Th>Type</Th><Th>Size</Th><Th>Modified</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {entries.length === 0
              ? <tr><td colSpan={5} style={{ textAlign:"center",color:C.muted,padding:"2rem",fontFamily:"'Space Mono',monospace",fontSize:".8rem" }}>Empty directory</td></tr>
              : entries.map((e, i) => {
                const fullPath = (path ? path + "/" : "") + e.name;
                return (
                  <tr key={i}>
                    <td style={{ padding:".75rem 1rem",fontSize:".85rem",borderBottom:`1px solid ${C.border}`,fontFamily:"'Space Mono',monospace",cursor:e.type==="dir"?"pointer":"default",color:e.type==="dir"?C.blue:C.text }}
                      onClick={() => e.type === "dir" && browse(fullPath)}>
                      {e.type === "dir" ? "📁" : "📄"} {e.name}
                    </td>
                    <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}` }}><Badge color={e.type==="dir"?"orange":"blue"}>{e.type}</Badge></td>
                    <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}`,fontSize:".85rem" }}>{e.type==="dir"?"—":fmt(e.size)}</td>
                    <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}`,color:C.muted,fontSize:".78rem" }}>{new Date(parseFloat(e.modified)*1000).toLocaleString()}</td>
                    <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}` }}>
                      <div style={{ display:"flex",gap:".4rem" }}>
                        {e.type !== "dir" && <Btn as="a" href={FileAPI.downloadUrl(fullPath)} download variant="blue" size="sm">↓</Btn>}
                        <Btn variant="danger" size="sm" onClick={() => deleteEntry(e.name)}>✕</Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <Modal open={showMkdir} onClose={() => setShowMkdir(false)} title="// NEW FOLDER">
        <div style={{ marginBottom:"1rem" }}>
          <label style={{ display:"block",fontSize:".8rem",color:C.muted,marginBottom:".4rem",fontFamily:"'Space Mono',monospace" }}>Folder Name</label>
          <input style={styles.formInput} placeholder="myfolder" value={newDir} onChange={e => setNewDir(e.target.value)} autoFocus
            onKeyDown={e => e.key === "Enter" && mkdir()} />
        </div>
        <div style={{ display:"flex",gap:".75rem",marginTop:"1.5rem",justifyContent:"flex-end" }}>
          <Btn variant="ghost" onClick={() => setShowMkdir(false)}>Cancel</Btn>
          <Btn variant="primary" onClick={mkdir}>Create</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ── VAULT ─────────────────────────────────────────────────────────────────────
function VaultSection({ vault, buckets, images, activity, toast, onRefreshVault, onRefreshActivity }) {
  const [selBucket, setSelBucket] = useState(buckets[0]?.name || "");
  const [selImage, setSelImage] = useState(images[0]?.name || "");

  useEffect(() => {
    if (!selBucket && buckets[0]) setSelBucket(buckets[0].name);
  }, [buckets, selBucket]);

  useEffect(() => {
    if (!selImage && images[0]) setSelImage(images[0].name);
  }, [images, selImage]);

  const syncBucket = async () => {
    if (!selBucket) { toast("Select a bucket", "error"); return; }
    try {
      const result = await ObjectAPI.syncBucketVault(selBucket);
      toast(result.message || `Vault sync started for bucket '${selBucket}' in background`, "vault", 6000);
      setTimeout(() => { onRefreshActivity?.(); onRefreshVault?.(); }, 3000);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const exportImage = async () => {
    if (!selImage) { toast("Select an image", "error"); return; }
    try {
      const result = await BlockAPI.exportVault(selImage);
      toast(result.message || `RBD export of '${selImage}' started in background`, "vault", 6000);
      setTimeout(() => { onRefreshActivity?.(); onRefreshVault?.(); }, 3000);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const syncCephFS = async () => {
    toast("Starting CephFS → Vault rsync (background)...", "vault", 6000);
    try {
      const result = await FileAPI.syncVault();
      toast(result.message || "CephFS → Vault sync started in background", "vault", 6000);
      setTimeout(() => { onRefreshActivity?.(); onRefreshVault?.(); }, 3000);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const Th = ({ children }) => <th style={{ fontFamily:"'Space Mono',monospace",fontSize:".7rem",color:C.muted,textTransform:"uppercase",letterSpacing:1,padding:".75rem 1rem",textAlign:"left",background:C.surface2,borderBottom:`1px solid ${C.border}` }}>{children}</th>;

  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.5rem" }}>
        <div style={{ fontFamily:"'Space Mono',monospace",fontSize:"1rem",color:C.text,display:"flex",alignItems:"center",gap:".75rem" }}>
          🔒 Vault Backup <span style={{ fontSize:".65rem",padding:".2rem .6rem",borderRadius:3,background:"rgba(249,115,22,.15)",color:C.accent,border:"1px solid rgba(249,115,22,.3)" }}>/vault</span>
        </div>
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:"1rem",marginBottom:"1.5rem" }}>
        <StatCard label="Vault Total" value={vault ? fmt(vault.total) : "—"} sub="/vault disk size" vault />
        <StatCard label="Vault Used" value={vault ? fmt(vault.used) : "—"} vault />
        <StatCard label="Vault Free" value={vault ? fmt(vault.free) : "—"} vault />
      </div>

      <div style={{ ...styles.tableWrap,marginBottom:"1.5rem" }}>
        <table style={{ width:"100%",borderCollapse:"collapse" }}>
          <thead><tr><Th>Storage Type</Th><Th>Method</Th><Th>Vault Path</Th><Th>Action</Th></tr></thead>
          <tbody>
            <tr>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}` }}><Badge color="blue">Object (S3)</Badge></td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}`,fontFamily:"'Space Mono',monospace",fontSize:".78rem" }}>rclone sync</td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}`,fontFamily:"'Space Mono',monospace",fontSize:".78rem",color:C.muted }}>/vault/object/&lt;bucket&gt;/</td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}` }}>
                <div style={{ display:"flex",alignItems:"center",gap:".4rem" }}>
                  <select style={{ ...styles.formInput,width:"auto",padding:".25rem .5rem",fontSize:".78rem",display:"inline" }} value={selBucket} onChange={e => setSelBucket(e.target.value)}>
                    {buckets.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                  </select>
                  <Btn variant="vault" size="sm" onClick={syncBucket}>Sync Now</Btn>
                </div>
              </td>
            </tr>
            <tr>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}` }}><Badge color="blue">File (CephFS)</Badge></td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}`,fontFamily:"'Space Mono',monospace",fontSize:".78rem" }}>rsync</td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}`,fontFamily:"'Space Mono',monospace",fontSize:".78rem",color:C.muted }}>/vault/file/</td>
              <td style={{ padding:".75rem 1rem",borderBottom:`1px solid ${C.border}` }}><Btn variant="vault" size="sm" onClick={syncCephFS}>Sync Now</Btn></td>
            </tr>
            <tr>
              <td style={{ padding:".75rem 1rem" }}><Badge color="orange">Block (RBD)</Badge></td>
              <td style={{ padding:".75rem 1rem",fontFamily:"'Space Mono',monospace",fontSize:".78rem" }}>rbd export</td>
              <td style={{ padding:".75rem 1rem",fontFamily:"'Space Mono',monospace",fontSize:".78rem",color:C.muted }}>/vault/block/&lt;name&gt;.img</td>
              <td style={{ padding:".75rem 1rem" }}>
                <div style={{ display:"flex",alignItems:"center",gap:".4rem" }}>
                  <select style={{ ...styles.formInput,width:"auto",padding:".25rem .5rem",fontSize:".78rem",display:"inline" }} value={selImage} onChange={e => setSelImage(e.target.value)}>
                    {images.map(img => <option key={img.name} value={img.name}>{img.name}</option>)}
                  </select>
                  <Btn variant="vault" size="sm" onClick={exportImage}>Export Now</Btn>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ActivityFeed activity={activity} vaultOnly />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [section, setSection] = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [vault, setVault] = useState(null);
  const [activity, setActivity] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [images, setImages] = useState([]);
  const [toasts, toast] = useToasts();

  const loadStats = useCallback(async () => {
    try { setStats(await ClusterAPI.stats()); } catch (err) { console.error(err); }
  }, []);

  const loadHealth = useCallback(async () => {
    try { setHealth(await ClusterAPI.health()); } catch (err) { console.error(err); }
  }, []);

  const loadVault = useCallback(async () => {
    try { setVault(await VaultAPI.status()); } catch (err) { console.error(err); }
  }, []);

  const loadActivity = useCallback(async () => {
    try { setActivity(await ClusterAPI.activity()); } catch (err) { console.error(err); }
  }, []);

  const loadBuckets = useCallback(async () => {
    try {
      const result = await ObjectAPI.buckets();
      setBuckets(result.buckets || []);
    } catch (err) { console.error(err); }
  }, []);

  const loadImages = useCallback(async () => {
    try {
      const result = await BlockAPI.images();
      setImages(result.images || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    loadStats();
    loadHealth();
    loadVault();
    loadActivity();
    loadBuckets();
    loadImages();

    const healthTimer   = setInterval(loadHealth, 15000);
    const activityTimer = setInterval(loadActivity, 10000);
    const vaultTimer    = setInterval(loadVault, 30000);
    return () => {
      clearInterval(healthTimer);
      clearInterval(activityTimer);
      clearInterval(vaultTimer);
    };
  }, [loadStats, loadHealth, loadVault, loadActivity, loadBuckets, loadImages]);

  // Inject global CSS once
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');
      * { margin:0;padding:0;box-sizing:border-box; }
      body { background:#0a0c10;color:#e2e8f0;font-family:'DM Sans',sans-serif; }
      :root { --mono:'Space Mono',monospace;--sans:'DM Sans',sans-serif; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes slideIn { from { transform:translateX(20px);opacity:0; } to { transform:translateX(0);opacity:1; } }
      @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
      ::-webkit-scrollbar { width:6px; }
      ::-webkit-scrollbar-track { background:#111318; }
      ::-webkit-scrollbar-thumb { background:#1e2430;border-radius:3px; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const navItems = [
    { id:"dashboard", icon:"◈", label:"Dashboard", section:"Overview" },
    { id:"object", icon:"◉", label:"Object Storage", section:"Storage" },
    { id:"block", icon:"▣", label:"Block Storage", section:"Storage" },
    { id:"file", icon:"⊞", label:"File Storage", section:"Storage" },
    { id:"vault", icon:"🔒", label:"Vault Backup", section:"Vault" },
  ];

  const healthColor = health?.status === "HEALTH_OK" ? C.green : health?.status?.includes("WARN") ? C.yellow : C.red;

  return (
    <div style={{ background:C.bg,color:C.text,fontFamily:"'DM Sans',sans-serif",minHeight:"100vh",overflowX:"hidden" }}>
      {/* HEADER */}
      <header style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 2rem",height:60,background:C.surface,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:100,gap:"1rem" }}>
        <div style={{ fontFamily:"'Space Mono',monospace",fontSize:"1.1rem",color:C.accent,letterSpacing:2,whiteSpace:"nowrap" }}>
          AiKyaStor<span style={{ color:C.text,opacity:.5 }}>CONTROL</span>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:"1rem" }}>
          <div style={{ display:"flex",alignItems:"center",gap:".5rem",fontFamily:"'Space Mono',monospace",fontSize:".72rem",padding:".3rem .8rem",borderRadius:4,background:"rgba(167,139,250,.1)",border:"1px solid rgba(167,139,250,.3)",color:C.purple,whiteSpace:"nowrap" }}>
            🔒 Vault: {vault ? `${fmt(vault.free)} free` : "checking..."}
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:".5rem",fontFamily:"'Space Mono',monospace",fontSize:".75rem",padding:".3rem .8rem",borderRadius:4,background:C.surface2,border:`1px solid ${C.border}`,whiteSpace:"nowrap" }}>
            <span style={{ width:8,height:8,borderRadius:"50%",background:healthColor,boxShadow:`0 0 8px ${healthColor}`,display:"inline-block" }} />
            {health?.status || "checking..."}
          </div>
        </div>
      </header>

      <div style={{ display:"flex",height:"calc(100vh - 60px)" }}>
        {/* NAV */}
        <nav style={{ width:220,background:C.surface,borderRight:`1px solid ${C.border}`,padding:"1.5rem 0",flexShrink:0,overflowY:"auto" }}>
          {["Overview","Storage","Vault"].map(sec => (
            <div key={sec}>
              <div style={{ padding:"0 1rem .5rem",fontFamily:"'Space Mono',monospace",fontSize:".65rem",color:C.muted,letterSpacing:2,textTransform:"uppercase" }}>{sec}</div>
              {navItems.filter(n => n.section === sec).map(n => (
                <div key={n.id}
                  style={{ display:"flex",alignItems:"center",gap:".75rem",padding:".65rem 1.25rem",cursor:"pointer",fontSize:".9rem",color: section===n.id ? C.accent : C.muted,borderLeft: section===n.id ? `2px solid ${C.accent}` : "2px solid transparent",background: section===n.id ? "rgba(249,115,22,.07)" : "transparent",transition:"all .15s" }}
                  onClick={() => setSection(n.id)}
                  onMouseEnter={e => { if (section!==n.id) { e.currentTarget.style.color=C.text; e.currentTarget.style.background=C.surface2; }}}
                  onMouseLeave={e => { if (section!==n.id) { e.currentTarget.style.color=C.muted; e.currentTarget.style.background="transparent"; }}}>
                  <span style={{ fontSize:"1rem",width:20,textAlign:"center" }}>{n.icon}</span>
                  {n.label}
                </div>
              ))}
              {sec !== "Vault" && <div style={{ height:1,background:C.border,margin:".75rem 1rem" }} />}
            </div>
          ))}
        </nav>

        {/* MAIN */}
        <main style={{ flex:1,overflowY:"auto",padding:"2rem" }}>
          {section === "dashboard" && <Dashboard stats={stats} health={health} vault={vault} activity={activity} onRefreshActivity={loadActivity} />}
          {section === "object" && <ObjectStorage toast={toast} buckets={buckets} reloadBuckets={loadBuckets} />}
          {section === "block" && <BlockStorage toast={toast} images={images} reloadImages={loadImages} />}
          {section === "file" && <FileStorage toast={toast} />}
          {section === "vault" && <VaultSection vault={vault} buckets={buckets} images={images} activity={activity} toast={toast} onRefreshVault={loadVault} onRefreshActivity={loadActivity} />}
        </main>
      </div>

      {/* TOASTS */}
      <div style={{ position:"fixed",bottom:"1.5rem",right:"1.5rem",zIndex:9999,display:"flex",flexDirection:"column",gap:".5rem",maxWidth:340 }}>
        {toasts.map(t => {
          const colors = { success:`rgba(74,222,128,.4)`, error:`rgba(248,113,113,.4)`, info:`rgba(56,189,248,.4)`, vault:`rgba(167,139,250,.4)` };
          const textColors = { success:C.green, error:C.red, info:C.blue, vault:C.purple };
          return (
            <div key={t.id} style={{ padding:".75rem 1.25rem",borderRadius:6,fontSize:".85rem",background:C.surface2,border:`1px solid ${colors[t.type]||colors.info}`,color:textColors[t.type]||C.text,animation:"slideIn .2s ease",wordBreak:"break-word" }}>
              {t.msg}
            </div>
          );
        })}
      </div>
    </div>
  );
}
