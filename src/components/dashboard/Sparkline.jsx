import { useMemo, useState } from "react";
import { C } from "../../styles/theme";

/**
 * Dependency-free SVG time-series chart.
 *
 * Props:
 *   series - [
 *     {
 *       name: string,
 *       color: string,
 *       points: [
 *         { value: number|null, timestamp: string }
 *       ]
 *     }
 *   ]
 *
 *   height - px, default 120
 *   width  - px, default fills container
 */
export default function Sparkline({
  series = [],
  height = 200,
  width = 600,
  timestamps = [],
}) {
  const [hovered, setHovered] = useState(null);

  const pointCount = Math.max(
    ...series.map((s) => s.points.length),
    2
  );

  const vbWidth = 600;
  const vbHeight = 200;

  const padTop = 12;
  const padBottom = 12;
  const padLeft = 4;
  const padRight = 4;

  /*
   * Flatten numeric values for calculating the shared Y-axis.
   */
  const allValues = useMemo(
    () =>
      series
        .flatMap((s) => s.points)
        .map((p) => (typeof p === "object" ? p.value : p))
        .filter(
          (v) => typeof v === "number" && !Number.isNaN(v)
        ),
    [series]
  );

  const hasData = allValues.length > 0;

  const maxVal = hasData
    ? Math.max(...allValues, 0)
    : 1;

  const minVal = hasData
    ? Math.min(0, ...allValues)
    : 0;

  const range = maxVal - minVal || 1;

  /*
   * Normalize a point so the component remains compatible with
   * both the timestamped format and the older numeric format.
   */
  const normalizePoint = (point) => {
    if (
      point &&
      typeof point === "object" &&
      !Array.isArray(point)
    ) {
      return {
        value:
          typeof point.value === "number" &&
          !Number.isNaN(point.value)
            ? point.value
            : null,
        timestamp: point.timestamp || null,
      };
    }

    return {
      value:
        typeof point === "number" &&
        !Number.isNaN(point)
          ? point
          : null,
      timestamp: null,
    };
  };

  /*
   * Extract timestamps from the first series.
   *
   * PerformanceCharts supplies the same timeline to all series,
   * so the first series is the canonical X-axis.
   */
  const chartTimestamps = useMemo(() => {
    if (timestamps.length > 0) {
      return timestamps;
    }

    const firstSeries = series[0]?.points || [];

    return firstSeries.map(
      (point) => normalizePoint(point).timestamp
    );
  }, [timestamps, series]);

  /*
   * Convert timestamps to milliseconds.
   */
  const timeValues = useMemo(
    () =>
      chartTimestamps.map((timestamp) => {
        if (!timestamp) return null;

        const value = new Date(timestamp).getTime();

        return Number.isFinite(value) ? value : null;
      }),
    [chartTimestamps]
  );

  const validTimes = timeValues.filter(
    (value) => value !== null
  );

  const minTime =
    validTimes.length > 0
      ? Math.min(...validTimes)
      : null;

  const maxTime =
    validTimes.length > 0
      ? Math.max(...validTimes)
      : null;

  const timeRange =
    minTime !== null &&
    maxTime !== null &&
    maxTime > minTime
      ? maxTime - minTime
      : null;

  /*
   * Calculate X from the actual timestamp.
   *
   * If timestamps are unavailable or invalid, fall back to
   * the original index-based positioning.
   */
  const xFor = (i) => {
    const timestamp = timeValues[i];

    if (
      timestamp !== null &&
      timeRange !== null
    ) {
      return (
        padLeft +
        ((timestamp - minTime) / timeRange) *
          (vbWidth - padLeft - padRight)
      );
    }

    return (
      padLeft +
      (i / Math.max(pointCount - 1, 1)) *
        (vbWidth - padLeft - padRight)
    );
  };

  const yFor = (value) => {
    const t = (value - minVal) / range;

    return (
      vbHeight -
      padBottom -
      t * (vbHeight - padTop - padBottom)
    );
  };

  /*
   * Build SVG paths while preserving gaps caused by unavailable
   * samples.
   *
   * Because xFor() uses timestamps, real gaps in Prometheus
   * history now produce proportional horizontal gaps.
   */
  const pathFor = (points) => {
    let path = "";
    let drawing = false;

    points.forEach((rawPoint, i) => {
      const point = normalizePoint(rawPoint);

      if (point.value === null) {
        drawing = false;
        return;
      }

      const command = drawing ? "L" : "M";

      path += `${command}${xFor(i)},${yFor(point.value)} `;
      drawing = true;
    });

    return path.trim();
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      return timestamp;
    }

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatValue = (value) => {
    if (typeof value !== "number") return "—";

    if (Math.abs(value) >= 1024 * 1024) {
      return `${(value / (1024 * 1024)).toFixed(2)} MB/s`;
    }

    if (Math.abs(value) >= 1024) {
      return `${(value / 1024).toFixed(2)} KB/s`;
    }

    return `${value.toFixed(0)} B/s`;
  };

  /*
   * Find the nearest timestamped history point from the mouse
   * position.
   *
   * This is different from the old implementation: we first
   * convert the mouse position into the corresponding time,
   * then find the closest actual sample.
   */
  const handleMouseMove = (event) => {
    if (!hasData || pointCount < 2) return;

    const rect =
      event.currentTarget.getBoundingClientRect();

    const relativeX =
      (event.clientX - rect.left) / rect.width;

    const clampedX = Math.max(
      0,
      Math.min(1, relativeX)
    );

    /*
     * Convert screen position to SVG X coordinate.
     */
    const mouseX =
      clampedX * vbWidth;

    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let i = 0; i < pointCount; i++) {
      const pointX = xFor(i);
      const distance = Math.abs(pointX - mouseX);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    setHovered({
      index: nearestIndex,
      x: xFor(nearestIndex),
    });
  };

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
      }}
      onMouseLeave={() => setHovered(null)}
    >
      {!hasData && (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.muted,
            fontSize: ".78rem",
            fontStyle: "italic",
          }}
        >
          No data yet
        </div>
      )}

      {hasData && (
        <svg
          viewBox={`0 0 ${vbWidth} ${vbHeight}`}
          preserveAspectRatio="none"
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            overflow: "visible",
          }}
          onMouseMove={handleMouseMove}
        >
          {/* Horizontal reference line at zero */}
          {minVal < 0 && maxVal > 0 && (
            <line
              x1={0}
              y1={yFor(0)}
              x2={vbWidth}
              y2={yFor(0)}
              stroke={C.border}
              strokeWidth={1}
            />
          )}

          {/* Series */}
          {series.map((s) => (
            <path
              key={s.name}
              d={pathFor(s.points)}
              fill="none"
              stroke={s.color || C.accent}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Hover guide + points */}
          {hovered && (
            <>
              <line
                x1={hovered.x}
                y1={padTop}
                x2={hovered.x}
                y2={vbHeight - padBottom}
                stroke={C.border}
                strokeWidth={1}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />

              {series.map((s) => {
                const point = normalizePoint(
                  s.points[hovered.index]
                );

                if (point.value === null) return null;

                return (
                  <circle
                    key={s.name}
                    cx={hovered.x}
                    cy={yFor(point.value)}
                    r={4}
                    fill={s.color || C.accent}
                    stroke={C.surface}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </>
          )}

          {/* Transparent interaction layer */}
          <rect
            x={0}
            y={0}
            width={vbWidth}
            height={vbHeight}
            fill="transparent"
          />
        </svg>
      )}

      {/* Tooltip */}
      {hovered && hasData && (
        <div
          style={{
            position: "absolute",
            top: 4,

            /*
             * Use the actual SVG X position for tooltip placement.
             * This keeps the tooltip aligned with timestamp-aware
             * chart points.
             */
            left: `${(hovered.x / vbWidth) * 100}%`,

            transform:
              hovered.x > vbWidth * 0.75
                ? "translateX(-100%)"
                : hovered.x < vbWidth * 0.25
                  ? "translateX(0)"
                  : "translateX(-50%)",

            background: C.surface2,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: ".5rem .65rem",
            minWidth: 130,
            pointerEvents: "none",
            zIndex: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,.25)",
          }}
        >
          {series[0]?.points[hovered.index] && (
            <div
              style={{
                color: C.muted,
                fontSize: ".68rem",
                marginBottom: ".35rem",
                fontFamily: "'Space Mono',monospace",
              }}
            >
              {formatTimestamp(
                normalizePoint(
                  series[0].points[hovered.index]
                ).timestamp ||
                  chartTimestamps[hovered.index]
              )}
            </div>
          )}

          {series.map((s) => {
            const point = normalizePoint(
              s.points[hovered.index]
            );

            if (point.value === null) return null;

            return (
              <div
                key={s.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: ".75rem",
                  fontSize: ".72rem",
                  marginTop: ".2rem",
                }}
              >
                <span
                  style={{
                    color: s.color || C.accent,
                    fontWeight: 600,
                  }}
                >
                  {s.name}
                </span>

                <span
                  style={{
                    color: C.text,
                    fontFamily: "'Space Mono',monospace",
                  }}
                >
                  {formatValue(point.value)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}