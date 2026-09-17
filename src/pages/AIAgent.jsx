import { useState } from "react";
import { AIAgentAPI } from "../api/aiAgent";
import { useAgent } from "../hooks/useAgent";
import { C } from "../styles/theme";

const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1rem" };
const input = { width: "100%", background: C.surface2, border: `1px solid ${C.border}`, color: C.text, padding: ".55rem .7rem", borderRadius: 5, boxSizing: "border-box" };
const button = { background: C.accent, color: "#000", border: 0, borderRadius: 5, padding: ".55rem .9rem", cursor: "pointer", fontWeight: 600 };

function Status({ status }) {
  if (!status) return <div style={card}>Agent status: checking…</div>;
  const ok = status.available && status.connected;
  return <div style={{ ...card, display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
    <div><div style={{ color: C.muted, fontSize: ".7rem", textTransform: "uppercase" }}>Agent Bridge</div><strong>{ok ? "Connected" : "Unavailable"}</strong></div>
    <div><div style={{ color: C.muted, fontSize: ".7rem", textTransform: "uppercase" }}>Mode</div><strong>{status.mode}</strong></div>
    <div><div style={{ color: C.muted, fontSize: ".7rem", textTransform: "uppercase" }}>Adapter</div><strong>{status.adapter}</strong></div>
    <div><div style={{ color: C.muted, fontSize: ".7rem", textTransform: "uppercase" }}>Active Tasks</div><strong>{status.active_tasks}</strong></div>
  </div>;
}

function StepTimeline({ task }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
    {task.steps.map((step, i) => {
      const color = step.status === "completed" ? C.green : step.status === "running" ? C.accent : step.status === "cancelled" ? C.red : C.muted;
      return <div key={`${step.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".45rem .6rem", background: step.status === "running" ? "rgba(249,115,22,.07)" : "transparent", borderRadius: 5 }}>
        <span style={{ color, width: 18 }}>{step.status === "completed" ? "✓" : step.status === "running" ? "→" : step.status === "cancelled" ? "×" : "○"}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: ".78rem" }}>{step.name}</span>
        <span style={{ marginLeft: "auto", color, fontSize: ".68rem", textTransform: "uppercase" }}>{step.status}</span>
      </div>;
    })}
  </div>;
}

export default function AIAgentPage({ toast }) {
  const { status, tasks, error, submit, cancel } = useAgent();
  const [form, setForm] = useState({ workload: "CEPHFS", operation: "mount", target: "/mnt/cephfs" });
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const task = await submit(form);
      setSelected(task.task_id);
      toast?.(`Agent task ${task.task_id} submitted`, "success");
    } catch (err) {
      toast?.(err.message || "Could not submit task", "error");
    } finally { setBusy(false); }
  };

  const active = tasks.find(t => t.task_id === selected) || tasks.find(t => ["queued", "running"].includes(t.status));

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", gap: "1rem", flexWrap: "wrap" }}>
      <div><div style={{ fontFamily: "var(--mono)", fontSize: "1rem" }}>🤖 AI Agent</div><div style={{ color: C.muted, fontSize: ".8rem", marginTop: ".3rem" }}>Workload classification, workflow planning and execution.</div></div>
    </div>

    <Status status={status} />
    {error && <div style={{ ...card, marginTop: "1rem", color: C.red }}>{error}</div>}

    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, .8fr) minmax(360px, 1.2fr)", gap: "1rem", marginTop: "1rem" }}>
      <form onSubmit={create} style={card}>
        <div style={{ fontFamily: "var(--mono)", fontSize: ".75rem", color: C.muted, marginBottom: "1rem", textTransform: "uppercase" }}>Submit Workload</div>
        {["workload", "operation", "target"].map((key) => <label key={key} style={{ display: "block", marginBottom: ".9rem", fontSize: ".8rem", color: C.muted }}>
          {key}
          {key === "workload" ? <select style={input} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}><option>CEPHFS</option><option>RBD</option><option>RGW</option><option>RADOS</option></select> : <input style={input} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />}
        </label>)}
        <button disabled={busy} style={{ ...button, opacity: busy ? .5 : 1 }}>{busy ? "Submitting…" : "Run with AI Agent"}</button>
      </form>

      <div style={card}>
        <div style={{ fontFamily: "var(--mono)", fontSize: ".75rem", color: C.muted, marginBottom: "1rem", textTransform: "uppercase" }}>Current Workflow</div>
        {!active ? <div style={{ color: C.muted, padding: "2rem 0", textAlign: "center" }}>No active task</div> : <>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ".75rem" }}><strong>{active.workload} / {active.operation}</strong><span style={{ color: active.status === "completed" ? C.green : C.accent }}>{active.status}</span></div>
          <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: "hidden", marginBottom: "1rem" }}><div style={{ height: "100%", background: C.accent, width: `${active.total_steps ? (active.step_index / active.total_steps) * 100 : 0}%` }} /></div>
          <div style={{ color: C.muted, fontSize: ".75rem", marginBottom: ".8rem" }}>Target: <span style={{ color: C.text }}>{active.target}</span> · Confidence: {Math.round(active.confidence * 100)}%</div>
          <StepTimeline task={active} />
          {["queued", "running"].includes(active.status) && <button onClick={() => cancel(active.task_id)} style={{ ...button, background: "transparent", color: C.red, border: `1px solid ${C.red}`, marginTop: "1rem" }}>Cancel Task</button>}
        </>}
      </div>
    </div>

    <div style={{ ...card, marginTop: "1rem" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: ".75rem", color: C.muted, marginBottom: ".8rem", textTransform: "uppercase" }}>Task History</div>
      {tasks.length === 0 ? <div style={{ color: C.muted }}>No tasks yet.</div> : tasks.map(t => <div key={t.task_id} onClick={() => setSelected(t.task_id)} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", gap: ".5rem", padding: ".65rem .3rem", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}><span style={{ fontFamily: "var(--mono)", fontSize: ".76rem" }}>{t.task_id} · {t.workload}/{t.operation}</span><span style={{ color: t.status === "completed" ? C.green : t.status === "failed" ? C.red : C.accent }}>{t.status}</span><span style={{ color: C.muted, fontSize: ".72rem" }}>{new Date(t.created_at).toLocaleTimeString()}</span></div>)}
    </div>
  </div>;
}
