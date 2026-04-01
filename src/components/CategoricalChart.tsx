import { useMemo } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, ZAxis
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

function CatTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint & { y: number; yLabel: string } }> }) {
  if (!active || !payload || !payload[0]) return null;
  const pt = payload[0].payload;
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{pt.date}</div>
      <div className="tt-row"><span className="tt-label">Raw</span><span className="tt-value">{pt.rawText ?? "—"}</span></div>
      {pt.categoricalValue && (
        <div className="tt-row"><span className="tt-label">Category</span><span className="tt-value">{pt.categoricalValue}</span></div>
      )}
      {pt.ordinalValue !== null && pt.ordinalValue !== undefined && (
        <div className="tt-row"><span className="tt-label">Severity</span><span className="tt-value">{pt.ordinalValue}</span></div>
      )}
      {pt.flag && <div className="tt-row"><span className="tt-label">Flag</span><span className="tt-value">{pt.flag}</span></div>}
      {pt.missingness !== "observed" && (
        <div className="tt-row"><span className="tt-label">Status</span><span className="tt-value">{pt.missingness}</span></div>
      )}
      {pt.assertion && <div className="tt-row"><span className="tt-label">Assertion</span><span className="tt-value">{pt.assertion}</span></div>}
      {pt.panel && <div className="tt-row"><span className="tt-label">Panel</span><span className="tt-value">{pt.panel}</span></div>}
      {pt.note && <div className="tt-row"><span className="tt-label">Note</span><span className="tt-value">{pt.note}</span></div>}
    </div>
  );
}

export function CategoricalChart({ data, markers, onPointClick, selectedPointId }: Props) {
  const { plotData, yLabels } = useMemo(() => {
    if (data.valueMode === "ordinal") {
      // Use ordinal severity as Y
      const pts = data.data
        .filter((d) => d.ordinalValue !== null && d.ordinalValue !== undefined)
        .map((d) => ({
          ...d,
          y: d.ordinalValue as number,
          yLabel: d.rawText || String(d.ordinalValue),
        }));
      return { plotData: pts, yLabels: null };
    }

    // For categorical: map unique categories to numeric Y
    const categories = Array.from(new Set(
      data.data
        .filter((d) => d.categoricalValue || d.rawText)
        .map((d) => d.categoricalValue || d.rawText || "unknown")
    )).sort();

    const catIndex = Object.fromEntries(categories.map((c, i) => [c, i]));

    const pts = data.data
      .filter((d) => d.categoricalValue || d.rawText)
      .map((d) => {
        const cat = d.categoricalValue || d.rawText || "unknown";
        return { ...d, y: catIndex[cat], yLabel: cat };
      });

    return { plotData: pts, yLabels: categories };
  }, [data]);

  const relevantMarkers = useMemo(() => {
    if (plotData.length === 0) return [];
    const minTs = Math.min(...plotData.map((d) => d.timestamp));
    const maxTs = Math.max(...plotData.map((d) => d.timestamp));
    return markers.filter((m) => m.timestamp >= minTs && m.timestamp <= maxTs);
  }, [markers, plotData]);

  if (plotData.length === 0) {
    return <div className="chart-placeholder">No categorical/ordinal values to display</div>;
  }

  const getColor = (pt: ChartDataPoint) => {
    if (pt.missingness === "missing") return "#f59e0b";
    if (pt.missingness === "not_present_in_source") return "#ef4444";
    if (pt.abnormal) return "#dc2626";
    if (pt.assertion === "negative") return "#6b7280";
    if (pt.assertion === "positive_or_descriptive") return "#2563eb";
    if (pt.assertion === "procedure_outcome") return "#8b5cf6";
    return "#2563eb";
  };

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
        <ScatterChart margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatDate}
            fontSize={11}
            stroke="#9ca3af"
            name="Date"
          />
          <YAxis
            dataKey="y"
            type="number"
            fontSize={11}
            stroke="#9ca3af"
            name="Value"
            tickFormatter={(v: number) => {
              if (yLabels && yLabels[v]) return yLabels[v].substring(0, 18);
              return String(v);
            }}
            width={120}
          />
          <ZAxis range={[80, 80]} />
          <Tooltip content={<CatTooltip />} />
          {relevantMarkers.map((m) => (
            <ReferenceLine
              key={m.markerId}
              x={m.timestamp}
              stroke={m.markerType === "procedure" ? "#8b5cf6" : "#f59e0b"}
              strokeDasharray="4 4"
              strokeWidth={2}
            />
          ))}
          <Scatter
            data={plotData}
            onClick={((_data: unknown, _index: number, e: React.MouseEvent) => {
              const target = e.target as SVGElement;
              const idx = target.getAttribute("data-index");
              if (idx !== null && plotData[Number(idx)]) {
                onPointClick(plotData[Number(idx)].eventId);
              }
            }) as unknown as (data: unknown, index: number, e: React.MouseEvent) => void}
            cursor="pointer"
          >
            {plotData.map((pt, i) => (
              <Cell
                key={i}
                fill={pt.eventId === selectedPointId ? "#111827" : getColor(pt)}
                stroke={pt.eventId === selectedPointId ? "#111827" : getColor(pt)}
                strokeWidth={pt.eventId === selectedPointId ? 2 : 1}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
