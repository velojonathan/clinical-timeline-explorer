import type { Series, TimelineMarker, VisualizationPayload } from "../types";

export interface ChartDataPoint {
  date: string;
  timestamp: number;
  value: number | null;
  rawText: string | null;
  unit: string | null;
  flag: string | null;
  abnormal: boolean;
  missingness: string;
  assertion: string | null;
  eventId: string;
  note: string | null;
  panel: string | null;
  sourceType: string | null;
  category: string | null;
  // For ordinal
  ordinalValue: number | null;
  categoricalValue: string | null;
  // Derived
  delta?: number | null;
  slope?: number | null;
  rollingMean?: number | null;
}

export interface ChartSeries {
  key: string;
  label: string;
  system: string;
  testType: string;
  valueMode: "numeric" | "ordinal" | "categorical";
  unit: string | null;
  data: ChartDataPoint[];
}

export interface ChartMarker {
  date: string;
  timestamp: number;
  label: string;
  status: string;
  markerType: string;
  system: string;
  note: string | null;
  markerId: string;
}

function parseDate(dateStr: string | null): { date: string; timestamp: number } | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return {
    date: dateStr,
    timestamp: d.getTime(),
  };
}

export function seriesToChartData(series: Series): ChartSeries {
  const data: ChartDataPoint[] = [];

  for (const pt of series.points) {
    const parsed = parseDate(pt.observed_at);
    if (!parsed) continue;

    data.push({
      date: parsed.date,
      timestamp: parsed.timestamp,
      value: pt.value_numeric,
      rawText: pt.value_raw,
      unit: pt.unit,
      flag: pt.flag,
      abnormal: pt.abnormal,
      missingness: pt.missingness,
      assertion: pt.assertion,
      eventId: pt.event_id,
      note: pt.note,
      panel: pt.panel,
      sourceType: pt.source_type,
      category: pt.category,
      ordinalValue: pt.value_ordinal,
      categoricalValue: pt.value_categorical,
      delta: pt.derived?.delta_from_previous,
      slope: pt.derived?.slope_per_day_from_previous,
      rollingMean: pt.derived?.rolling_mean_3,
    });
  }

  return {
    key: series.series_key,
    label: series.label,
    system: series.system,
    testType: series.test_type,
    valueMode: series.value_mode,
    unit: series.unit,
    data,
  };
}

export function markersToChartMarkers(markers: TimelineMarker[]): ChartMarker[] {
  return markers
    .map((m) => {
      const parsed = parseDate(m.timestamp);
      if (!parsed) return null;
      return {
        date: parsed.date,
        timestamp: parsed.timestamp,
        label: m.label,
        status: m.status,
        markerType: m.marker_type,
        system: m.system,
        note: m.note,
        markerId: m.marker_id,
      };
    })
    .filter((m): m is ChartMarker => m !== null);
}

export function filterSeries(
  payload: VisualizationPayload,
  filters: {
    system: string | null;
    testType: string | null;
    temporalWindow: string | null;
    valueMode: string | null;
    search: string;
  }
): Series[] {
  let result = payload.series;

  if (filters.system) {
    const keys = new Set(payload.facets.by_system[filters.system] || []);
    result = result.filter((s) => keys.has(s.series_key));
  }

  if (filters.testType) {
    const keys = new Set(payload.facets.by_test_type[filters.testType] || []);
    result = result.filter((s) => keys.has(s.series_key));
  }

  if (filters.temporalWindow) {
    const keys = new Set(payload.facets.by_window[filters.temporalWindow] || []);
    result = result.filter((s) => keys.has(s.series_key));
  }

  if (filters.valueMode) {
    result = result.filter((s) => s.value_mode === filters.valueMode);
  }

  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.series_key.toLowerCase().includes(q) ||
        s.system.toLowerCase().includes(q) ||
        s.test_type.toLowerCase().includes(q)
    );
  }

  return result;
}

export function formatLabel(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
