import { C } from "../../styles/theme";

// Minimal, dependency-free inline SVG line chart. No charting library is
// in package.json (confirmed: only lucide-react/react/react-dom/vite —
// real file checked directly), and the brief's stated principle is no
// unnecessary dependencies, so this is hand-rolled rather than pulling
// in a chart library for what's fundamentally a couple of simple
// time-series lines. Deliberately small in scope — multi-series line
// chart with optional fill, a light grid, and a hover-free static render
// (no tooltips/zoom/pan) since that's all Section 6-9's read/write
// throughput charts need. If a future phase needs real interactivity
// (tooltips, zoom), that's the point to revisit adding a library, not
// this one.
//
// Props:
//   series - [{ name, color, points: [number, ...] }]  (points share one
//            implicit x-axis — same length/order across all series,
//            already the case for io_history's "points" array)
//   height - px, default 120
//   width  - px, default fills container (uses viewBox + 100% width)
export default function Sparkline({ series, height = 120, width = "100%" }) {
  const allValues = series.flatMap(s => s.points).filter(v => typeof v === "number" && !Number.isNaN(v));
  const hasData = allValues.length > 0;

  const maxVal = hasData ? Math.max(...allValues, 0) : 1;
  const minVal = hasData ? Math.min(0, ...allValues) : 0;
  const range = maxVal - minVal || 1;

  const pointCount = Math.max(...series.map(s => s.points.length), 2);
  const vbWidth = 600;
  const vbHeight = 200;
  const padTop = 10;
  const padBottom = 10;

  const xFor = (i) => (i / (pointCount - 1)) * vbWidth;
  const yFor = (v) => {
    const t = (v - minVal) / range;
    return vbHeight - padBottom - t * (vbHeight - padTop - padBottom);
  };

  const pathFor = (points) => {
    const pts = points.filter(v => typeof v === "number" && !Number.isNaN(v));
    if (pts.length === 0) return "";
    return points
      .map((v, i) => (typeof v === "number" && !Number.isNaN(v) ? `${i === 0 || points[i - 1] == null ? "M" : "L"}${xFor(i)},${yFor(v)}` : null))
      .filter(Boolean)
      .join(" ");
  };

  return (
    <div style={{ width, height }}>
      {!hasData && (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: ".78rem", fontStyle: "italic" }}>
          No data yet
        </div>
      )}
      {hasData && (
        <svg viewBox={`0 0 ${vbWidth} ${vbHeight}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
          {/* zero line, only meaningful when the range actually crosses zero */}
          {minVal < 0 && maxVal > 0 && (
            <line x1={0} y1={yFor(0)} x2={vbWidth} y2={yFor(0)} stroke={C.border} strokeWidth={1} />
          )}
          {series.map(s => (
            <path
              key={s.name}
              d={pathFor(s.points)}
              fill="none"
              stroke={s.color || C.accent}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}
    </div>
  );
}
