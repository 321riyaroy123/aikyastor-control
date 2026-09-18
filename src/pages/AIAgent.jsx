import React, { useMemo, useRef, useState } from "react";
import { C } from "../styles/theme";
import { useAgent } from "../hooks/useAgent";

const pill = (background, color) => ({
  display: "inline-flex", alignItems: "center", gap: ".35rem", padding: ".3rem .6rem",
  borderRadius: 999, background, color, fontFamily: "'Space Mono',monospace", fontSize: ".68rem",
});

export default function AIAgent({ toast }) {
  const { status, tasks, analysis, setAnalysis, upload, analyze, submit, cancel, error } = useAgent();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const directoryInput = useRef(null);

  const active = useMemo(
    () => tasks.find(t => t.status === "running" || t.status === "queued") || tasks[0],
    [tasks]
  );
  const statusColor = status?.mode === "simulation" ? C.yellow : C.green;
  const progress = active?.total_steps ? Math.min(100, Math.round((active.step_index / active.total_steps) * 100)) : 0;

  const chooseFiles = (files) => {
    const next = Array.from(files || []);
    if (!next.length) return;
    setSelectedFiles(next);
    setAnalysis(null);
  };

  const runAnalysis = async () => {
    if (!selectedFiles.length) {
      toast?.("Choose a workload first.", "error");
      return;
    }
    setBusy(true);
    try {
      const uploadResult = await upload(selectedFiles);
      await analyze(uploadResult.upload_id);
      toast?.("Workload uploaded and analyzed successfully.", "success");
    } catch (err) {
      toast?.(err?.message || "Workload analysis failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const runWorkflow = async () => {
    if (!analysis) return;
    setBusy(true);
    try {
      await submit(analysis.analysis_id);
      toast?.("Workflow started in simulation mode.", "success");
      setAnalysis(null);
    } catch (err) {
      toast?.(err?.message || "Unable to start workflow.", "error");
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    chooseFiles(event.dataTransfer.files);
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: ".7rem", color: C.accent, letterSpacing: 2, textTransform: "uppercase" }}>Intelligence / AI Agent</div>
        <h1 style={{ margin: ".35rem 0", fontSize: "1.8rem" }}>Autonomous Storage Agent</h1>
        <p style={{ margin: 0, color: C.muted, maxWidth: 760 }}>
          Give the agent a workload. It inspects the content and structure, determines the appropriate Ceph storage workflow, and prepares the execution plan.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <div style={card()}><div style={label()}>AGENT STATUS</div><div style={{ fontSize: "1.05rem", fontWeight: 700 }}><span style={{ color: statusColor }}>●</span> {status?.connected ? "Connected" : "Unavailable"}</div></div>
        <div style={card()}><div style={label()}>MODE</div><div style={{ ...pill(`${statusColor}18`, statusColor) }}>{status?.mode || "checking..."}</div></div>
        <div style={card()}><div style={label()}>ADAPTER</div><div style={{ fontFamily: "'Space Mono',monospace", fontSize: ".82rem" }}>{status?.adapter || "checking..."}</div></div>
        <div style={card()}><div style={label()}>ACTIVE TASKS</div><div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{status?.active_tasks ?? "—"}</div></div>
      </div>

      {error && <div style={{ ...card(), borderColor: "rgba(248,113,113,.4)", color: C.red, marginBottom: "1rem" }}>{error}</div>}

      <div style={{ ...card(), marginBottom: "1rem" }}>
        <div style={label()}>SUBMIT WORKLOAD</div>
        <div style={{ color: C.muted, fontSize: ".85rem", marginBottom: ".8rem" }}>
          Upload the workload only. The agent decides whether it belongs in RBD, CephFS, RGW, or RADOS.
        </div>

        <input ref={fileInput} type="file" multiple style={{ display: "none" }} onChange={e => chooseFiles(e.target.files)} />
        <input ref={directoryInput} type="file" multiple webkitdirectory="true" directory="true" style={{ display: "none" }} onChange={e => chooseFiles(e.target.files)} />

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          style={{
            border: `1px dashed ${dragging ? C.accent : C.border}`,
            background: dragging ? `${C.accent}0d` : C.surface2,
            borderRadius: 8,
            padding: "2rem 1rem",
            textAlign: "center",
            cursor: "pointer",
            transition: "border-color .2s, background .2s",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: ".5rem" }}>📁</div>
          <div style={{ fontWeight: 700 }}>Drop your workload here</div>
          <div style={{ color: C.muted, fontSize: ".78rem", marginTop: ".35rem" }}>or click to browse files</div>
        </div>

        <div style={{ display: "flex", gap: ".7rem", flexWrap: "wrap", marginTop: ".8rem" }}>
          <button onClick={() => directoryInput.current?.click()} style={button(C.blue)}>Select Project Folder</button>
          <button onClick={runAnalysis} disabled={busy || !selectedFiles.length} style={button(C.accent)}>{busy ? "Analyzing…" : "Analyze Workload"}</button>
        </div>

        {selectedFiles.length > 0 && (
          <div style={{ marginTop: ".8rem", color: C.muted, fontSize: ".78rem" }}>
            <strong style={{ color: C.text }}>{selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"}</strong> selected · {formatBytes(selectedFiles.reduce((sum, file) => sum + file.size, 0))}
            {selectedFiles.length <= 3 && selectedFiles.map(file => <div key={`${file.name}-${file.size}`}>• {file.webkitRelativePath || file.name}</div>)}
          </div>
        )}
      </div>

      {analysis && (
        <div style={{ ...card(), marginBottom: "1rem", borderColor: "rgba(249,115,22,.35)" }}>
          <div style={label()}>AGENT DECISION</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "1rem" }}>
            <Metric title="Detected Type" value={analysis.detected_type} />
            <Metric title="Mapped Storage" value={analysis.workflow} />
            <Metric title="Confidence" value={`${Math.round(analysis.confidence * 100)}%`} />
            <Metric title="Decision Tier" value={analysis.decision_tier} />
          </div>
          <div style={{ marginTop: "1rem", padding: "1rem", background: C.surface2, borderRadius: 6 }}>
            <div style={label()}>RATIONALE</div>
            <div style={{ color: C.text, lineHeight: 1.5 }}>{analysis.rationale}</div>
            <div style={{ marginTop: ".8rem", color: C.muted, fontSize: ".8rem" }}>Proposed target: <span style={{ color: C.text }}>{analysis.target}</span></div>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <div style={label()}>PROPOSED WORKFLOW</div>
            <StepList steps={analysis.steps} />
          </div>
          <div style={{ marginTop: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <span style={pill("rgba(250,204,21,.1)", C.yellow)}>DRY RUN — NO CEPH COMMANDS</span>
            <button onClick={runWorkflow} disabled={busy} style={button(C.green)}>{busy ? "Starting…" : "Start Simulated Workflow"}</button>
          </div>
        </div>
      )}

      {active && (
        <div style={{ ...card(), marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div><div style={label()}>CURRENT WORKFLOW</div><h2 style={{ margin: ".2rem 0" }}>{active.workflow}</h2><div style={{ color: C.muted }}>{active.source_name || active.payload_path}</div></div>
            <div style={{ textAlign: "right" }}><div style={pill(active.status === "completed" ? "rgba(74,222,128,.1)" : active.status === "cancelled" ? "rgba(248,113,113,.1)" : "rgba(56,189,248,.1)", active.status === "completed" ? C.green : active.status === "cancelled" ? C.red : C.blue)}>{active.status}</div><div style={{ color: C.muted, fontSize: ".75rem", marginTop: ".35rem" }}>{Math.min(active.step_index, active.total_steps)} / {active.total_steps} steps</div></div>
          </div>
          <div style={{ height: 6, background: C.surface2, borderRadius: 999, margin: "1rem 0", overflow: "hidden" }}><div style={{ height: "100%", width: `${progress}%`, background: C.accent, transition: "width .3s" }} /></div>
          <StepList steps={active.steps} />
          {(active.status === "running" || active.status === "queued") && <button onClick={() => cancel(active.task_id)} style={button(C.red)}>Cancel</button>}
        </div>
      )}

      <div style={card()}>
        <div style={label()}>TASK HISTORY</div>
        {tasks.length === 0 ? <div style={{ color: C.muted }}>No workloads have been submitted yet.</div> : tasks.map(task => (
          <div key={task.task_id} style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr .8fr .8fr", gap: ".8rem", padding: ".8rem 0", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
            <div><div style={{ fontWeight: 700 }}>{task.workflow}</div><div style={{ color: C.muted, fontSize: ".72rem" }}>{task.source_name || task.payload_path}</div></div>
            <div style={{ color: C.muted, fontSize: ".78rem" }}>{task.detected_type}</div>
            <div style={{ color: C.muted, fontSize: ".78rem" }}>{Math.round(task.confidence * 100)}%</div>
            <div style={{ justifySelf: "end", ...pill(task.status === "completed" ? "rgba(74,222,128,.1)" : task.status === "cancelled" ? "rgba(248,113,113,.1)" : "rgba(148,163,184,.1)", task.status === "completed" ? C.green : task.status === "cancelled" ? C.red : C.muted) }}>{task.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}
function card() { return { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "1.1rem" }; }
function label() { return { fontFamily: "'Space Mono',monospace", fontSize: ".64rem", color: C.muted, letterSpacing: 1.5, marginBottom: ".45rem", textTransform: "uppercase" }; }
function button(color) { return { padding: ".7rem 1rem", borderRadius: 6, border: `1px solid ${color}66`, background: `${color}18`, color, cursor: "pointer", fontWeight: 700 }; }
function Metric({ title, value }) { return <div><div style={label()}>{title}</div><div style={{ fontWeight: 700, wordBreak: "break-word" }}>{value}</div></div>; }
function StepList({ steps = [] }) { return <div style={{ display: "flex", flexDirection: "column", gap: ".45rem" }}>{steps.map((step, index) => <div key={`${step.name}-${index}`} style={{ display: "flex", alignItems: "center", gap: ".7rem", color: step.status === "completed" ? C.green : step.status === "running" ? C.blue : step.status === "cancelled" ? C.red : C.muted }}><span style={{ width: 20, textAlign: "center" }}>{step.status === "completed" ? "✓" : step.status === "running" ? "●" : step.status === "cancelled" ? "×" : "○"}</span><span>{step.name}</span></div>)}</div>; }
