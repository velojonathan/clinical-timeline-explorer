import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine
} from "recharts";
import type { ChartSeries, ChartMarker, ChartDataPoint } from "../adapters/chartAdapter";

interface Props {
  data: ChartSeries;
  markers: ChartMarker[];
  onPointClick: (eventId: string) => void;
  selectedPointId: string | null;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint }> }) {
  if (!active || !payload || !payload[0]) return null;
  const pt = payload[0].payload;
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{pt.date}</div>
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

  // For missing/not_present with null values, render at bottom
  if (payload.value === null) return null;

  return (
    <circle
      cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={isSelected ? 2 : 1}
      style={{ cursor: "pointer" }}
      onClick={() => onPointClick(payload.eventId)}
    />
  );
}

export function NumericChart({ data, markers, onPointClick, selectedPointId }: Props) {
  const observedData = useMemo(
    () => data.data.filter((d) => d.value !== null),
    [data.data]
  );

  const relevantMarkers = useMemo(() => {
    if (observedData.length === 0) return [];
    const minTs = Math.min(...observedData.map((d) => d.timestamp));
    const maxTs = Math.max(...observedData.map((d) => d.timestamp));
    return markers.filter((m) => m.timestamp >= minTs && m.timestamp <= maxTs);
  }, [markers, observedData]);

  if (observedData.length === 0) {
    return <div className="chart-placeholder">No observed numeric values to chart</div>;
  }

  return (
    <div>
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
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={observedData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatDate}
            fontSize={11}
            stroke="#9ca3af"
          />
          <YAxis fontSize={11} stroke="#9ca3af" tickFormatter={(v: number) => String(v)} />
          <Tooltip content={<CustomTooltip />} />
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
            type="monotone"
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
    </div>
  );
}
