import { useMemo, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea
} from "recharts";
import type { ChartSeries, ChartMarker, ChartDataPoint } from "../adapters/chartAdapter";

/* ── Types ── */
type TimeRange = "7d" | "30d" | "90d" | "all";

interface Props {
  data: ChartSeries;
  markers: ChartMarker[];
  onPointClick: (eventId: string) => void;
  selectedPointId: string | null;
}

/* ── Constants ── */
const RANGE_DAYS: Record<TimeRange, number | null> = { "7d": 7, "30d": 30, "90d": 90, all: null };
const RANGE_LABELS: Record<TimeRange, string> = { "7d": "7 d", "30d": "30 d", "90d": "90 d", all: "All" };
const DAY_MS = 86_400_000;
const GAP_COMPRESS_THRESHOLD_DAYS = 14; // gaps longer than this get compressed
const COMPRESSED_GAP_WIDTH_DAYS = 2;    // compressed gaps render as this width

/* ── Helpers ── */
function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Pick a smart default range: if data is sparse-then-dense, prefer 30d. */
function pickDefaultRange(data: ChartDataPoint[]): TimeRange {
  if (data.length < 3) return "all";
  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);
  const totalSpan = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;
  if (totalSpan < 35 * DAY_MS) return "all"; // everything fits in ~30 days

  // Count points in last 30 days vs rest
  const cutoff = sorted[sorted.length - 1].timestamp - 30 * DAY_MS;
  const recentCount = sorted.filter((d) => d.timestamp >= cutoff).length;
  const oldCount = sorted.length - recentCount;

  // If >=60% of points are in the recent 30d window and there are old sparse points, default to 30d
  if (recentCount >= 2 && oldCount >= 1 && recentCount / sorted.length >= 0.5) {
    return "30d";
  }
  // If total span > 90 days but most points are recent, still use 30d
  if (totalSpan > 90 * DAY_MS && recentCount >= 2) {
    return "30d";
  }
  return "all";
}

/** Detect gaps and produce compressed-axis data. */
interface CompressedPoint extends ChartDataPoint {
  compressedTimestamp: number;
}

interface GapRegion {
  startReal: number;
  endReal: number;
  startCompressed: number;
  endCompressed: number;
}

function compressTimeline(data: ChartDataPoint[]): { points: CompressedPoint[]; gaps: GapRegion[] } {
  if (data.length < 2) {
    return {
      points: data.map((d) => ({ ...d, compressedTimestamp: d.timestamp })),
      gaps: [],
    };
  }

  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);
  const gaps: GapRegion[] = [];
  const points: CompressedPoint[] = [];

  let offset = 0; // cumulative time removed by compression

  points.push({ ...sorted[0], compressedTimestamp: sorted[0].timestamp });

  for (let i = 1; i < sorted.length; i++) {
    const realGap = sorted[i].timestamp - sorted[i - 1].timestamp;
    const gapDays = realGap / DAY_MS;

    if (gapDays > GAP_COMPRESS_THRESHOLD_DAYS) {
      const compressed = COMPRESSED_GAP_WIDTH_DAYS * DAY_MS;
      const removed = realGap - compressed;

      gaps.push({
        startReal: sorted[i - 1].timestamp,
        endReal: sorted[i].timestamp,
        startCompressed: sorted[i - 1].timestamp - offset,
        endCompressed: sorted[i - 1].timestamp - offset + compressed,
      });

      offset += removed;
    }

    points.push({ ...sorted[i], compressedTimestamp: sorted[i].timestamp - offset });
  }

  return { points, gaps };
}

/* ── Tooltip ── */
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint & { compressedTimestamp?: number } }> }) {
  if (!active || !payload || !payload[0]) return null;
  const pt = payload[0].payload;
  // Always show real date, even in compressed mode
  const displayDate = pt.date;
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{displayDate}</div>
      <div className="tt-row"><span className="tt-label">Raw</span><span className="tt-value">{pt.rawText ?? "—"}</span></div>
      {pt.value !== null && (
        <div className="tt-row"><span className="tt-label">Value</span><span className="tt-value">{pt.value}{pt.unit ? ` ${pt.unit}` : ""}</span></div>
      )}
      {pt.flag && <div className="tt-row"><span className="tt-label">Flag</span><span className="tt-value">{pt.flag}</span></div>}
      {pt.missingness !== "observed" && (
        <div className="tt-row"><span className="tt-label">Status</span><span className="tt-value">{pt.missingness}</span></div>
      )}
      {pt.panel && <div className="tt-row"><span className="tt-label">Panel</span><span className="tt-value">{pt.panel}</span></div>}
      {pt.sourceType && <div className="tt-row"><span className="tt-label">Source</span><span className="tt-value">{pt.sourceType}</span></div>}
      {pt.note && <div className="tt-row"><span className="tt-label">Note</span><span className="tt-value">{pt.note}</span></div>}
    </div>
  );
}

/* ── Dot renderer ── */
function CustomDot(props: {
  cx?: number; cy?: number; payload?: ChartDataPoint;
  onPointClick: (id: string) => void; selectedPointId: string | null;
}) {
  const { cx, cy, payload, onPointClick, selectedPointId } = props;
  if (cx === undefined || cy === undefined || !payload) return null;

  const isSelected = payload.eventId === selectedPointId;
  const isMissing = payload.missingness === "missing";
  const isNotPresent = payload.missingness === "not_present_in_source";
  const isAbnormal = payload.abnormal;

  let fill = "#2563eb";
  let stroke = "#2563eb";
  const r = isSelected ? 7 : 5;

  if (isMissing) { fill = "#f59e0b"; stroke = "#d97706"; }
  else if (isNotPresent) { fill = "#ef4444"; stroke = "#dc2626"; }
  else if (isAbnormal) { fill = "#dc2626"; stroke = "#991b1b"; }

  if (isSelected) { stroke = "#111827"; }

  if (payload.value === null) return null;

  return (
    <circle
      cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={isSelected ? 2 : 1}
      style={{ cursor: "pointer" }}
      onClick={() => onPointClick(payload.eventId)}
    />
  );
}

/* ── Mini overview dot (smaller, no interaction) ── */
function MiniDot(props: { cx?: number; cy?: number; payload?: ChartDataPoint }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload || payload.value === null) return null;
  const isAbnormal = payload.abnormal;
  const fill = isAbnormal ? "#dc2626" : "#2563eb";
  return <circle cx={cx} cy={cy} r={2.5} fill={fill} stroke="none" />;
}

/* ── Compressed-axis tick formatter that shows real dates ── */
function makeCompressedTickFormatter(compressedPoints: CompressedPoint[]) {
  // Build a lookup from compressed timestamps to real dates
  const lookup = new Map<number, string>();
  for (const p of compressedPoints) {
    lookup.set(p.compressedTimestamp, formatDate(p.timestamp));
  }
  return (ts: number) => {
    // Try exact match first
    const exact = lookup.get(ts);
    if (exact) return exact;
    // Find nearest point for axis ticks generated by Recharts
    let closest = compressedPoints[0];
    let minDist = Math.abs(ts - closest.compressedTimestamp);
    for (const p of compressedPoints) {
      const dist = Math.abs(ts - p.compressedTimestamp);
      if (dist < minDist) { minDist = dist; closest = p; }
    }
    return formatDate(closest.timestamp);
  };
}

/* ── Main Component ── */
export function NumericChart({ data, markers, onPointClick, selectedPointId }: Props) {
  const observedData = useMemo(
    () => data.data.filter((d) => d.value !== null),
    [data.data]
  );

  const defaultRange = useMemo(() => pickDefaultRange(observedData), [observedData]);
  const [selectedRange, setSelectedRange] = useState<TimeRange>(defaultRange);
  const [compressGaps, setCompressGaps] = useState(false);

  // Filter data to selected time range
  const rangedData = useMemo(() => {
    if (selectedRange === "all" || observedData.length === 0) return observedData;
    const days = RANGE_DAYS[selectedRange];
    if (!days) return observedData;
    const maxTs = Math.max(...observedData.map((d) => d.timestamp));
    const cutoff = maxTs - days * DAY_MS;
    const filtered = observedData.filter((d) => d.timestamp >= cutoff);
    return filtered.length > 0 ? filtered : observedData;
  }, [observedData, selectedRange]);

  // Compressed timeline data
  const compressed = useMemo(() => {
    if (!compressGaps) return null;
    return compressTimeline(rangedData);
  }, [compressGaps, rangedData]);

  const displayData = compressGaps && compressed ? compressed.points : rangedData;
  const tsKey = compressGaps ? "compressedTimestamp" : "timestamp";

  // Markers filtered to current range
  const relevantMarkers = useMemo(() => {
    if (displayData.length === 0) return [];
    const minTs = Math.min(...displayData.map((d) => d[tsKey as keyof typeof d] as number));
    const maxTs = Math.max(...displayData.map((d) => d[tsKey as keyof typeof d] as number));
    return markers.filter((m) => m.timestamp >= minTs && m.timestamp <= maxTs);
  }, [markers, displayData, tsKey]);

  const tickFormatter = useMemo(() => {
    if (compressGaps && compressed) {
      return makeCompressedTickFormatter(compressed.points);
    }
    return formatDate;
  }, [compressGaps, compressed]);

  const handleRangeClick = useCallback((range: TimeRange) => {
    setSelectedRange(range);
  }, []);

  if (observedData.length === 0) {
    return <div className="chart-placeholder">No observed numeric values to chart</div>;
  }

  const rangePointCount = rangedData.length;
  const totalPointCount = observedData.length;
  const showingSubset = rangePointCount < totalPointCount;

  return (
    <div>
      {/* Controls bar */}
      <div className="chart-controls">
        <div className="range-buttons">
          {(Object.keys(RANGE_LABELS) as TimeRange[]).map((range) => (
            <button
              key={range}
              className={`range-btn ${selectedRange === range ? "active" : ""}`}
              onClick={() => handleRangeClick(range)}
            >
              {RANGE_LABELS[range]}
            </button>
          ))}
        </div>
        <div className="chart-toggles">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={compressGaps}
              onChange={(e) => setCompressGaps(e.target.checked)}
            />
            Compress gaps
          </label>
        </div>
        {showingSubset && (
          <div className="range-info">
            Showing {rangePointCount} of {totalPointCount} points
          </div>
        )}
      </div>

      {/* Marker legend */}
      {relevantMarkers.length > 0 && (
        <div className="marker-legend">
          {relevantMarkers.map((m) => (
            <span key={m.markerId} className="marker-legend-item">
              <span className="marker-dot" style={{ background: m.markerType === "procedure" ? "#8b5cf6" : "#f59e0b" }} />
              {m.label}: {m.status}
            </span>
          ))}
        </div>
      )}

      {/* Main chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={displayData as unknown as Record<string, unknown>[]} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey={tsKey}
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={tickFormatter}
            fontSize={11}
            stroke="#9ca3af"
          />
          <YAxis fontSize={11} stroke="#9ca3af" tickFormatter={(v: number) => String(v)} />
          <Tooltip content={<CustomTooltip />} />
          {/* Gap break regions in compressed mode */}
          {compressGaps && compressed && compressed.gaps.map((gap, i) => (
            <ReferenceArea
              key={`gap-${i}`}
              x1={gap.startCompressed}
              x2={gap.endCompressed}
              fill="#f3f4f6"
              fillOpacity={0.8}
              stroke="#d1d5db"
              strokeDasharray="4 2"
            />
          ))}
          {/* Procedure / event markers */}
          {relevantMarkers.map((m) => (
            <ReferenceLine
              key={m.markerId}
              x={m.timestamp}
              stroke={m.markerType === "procedure" ? "#8b5cf6" : "#f59e0b"}
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{ value: m.label.substring(0, 20), position: "top", fontSize: 10, fill: "#6b7280" }}
            />
          ))}
          <Line
            type="linear"
            dataKey="value"
            stroke="#2563eb"
            strokeWidth={2}
            dot={(dotProps: Record<string, unknown>) => (
              <CustomDot
                key={String(dotProps.index)}
                cx={dotProps.cx as number | undefined}
                cy={dotProps.cy as number | undefined}
                payload={dotProps.payload as ChartDataPoint | undefined}
                onPointClick={onPointClick}
                selectedPointId={selectedPointId}
              />
            )}
            activeDot={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Mini historical overview (shown when viewing a subset) */}
      {showingSubset && (
        <div className="overview-chart">
          <div className="overview-label">Full history overview</div>
          <ResponsiveContainer width="100%" height={60}>
            <LineChart data={observedData as unknown as Record<string, unknown>[]} margin={{ top: 2, right: 20, bottom: 2, left: 10 }}>
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={formatDate}
                fontSize={9}
                stroke="#d1d5db"
                tick={{ fill: "#9ca3af" }}
              />
              <YAxis hide />
              {/* Highlight the currently viewed window */}
              {rangedData.length > 0 && (
                <ReferenceArea
                  x1={Math.min(...rangedData.map((d) => d.timestamp))}
                  x2={Math.max(...rangedData.map((d) => d.timestamp))}
                  fill="#dbeafe"
                  fillOpacity={0.5}
                  stroke="#2563eb"
                  strokeWidth={1}
                  strokeOpacity={0.5}
                />
              )}
              <Line
                type="linear"
                dataKey="value"
                stroke="#9ca3af"
                strokeWidth={1}
                dot={(dotProps: Record<string, unknown>) => (
                  <MiniDot
                    key={String(dotProps.index)}
                    cx={dotProps.cx as number | undefined}
                    cy={dotProps.cy as number | undefined}
                    payload={dotProps.payload as ChartDataPoint | undefined}
                  />
                )}
                activeDot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
