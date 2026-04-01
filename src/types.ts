// ── Visualization Payload Types ──

export interface DerivedFeatures {
  delta_from_previous: number | null;
  slope_per_day_from_previous: number | null;
  rolling_mean_3: number | null;
  rolling_min_3: number | null;
  rolling_max_3: number | null;
  observation_index: number;
}

export interface SeriesPoint {
  event_id: string;
  observed_at: string | null;
  value_raw: string | null;
  value_numeric: number | null;
  value_categorical: string | null;
  value_ordinal: number | null;
  value_mode: "numeric" | "ordinal" | "categorical" | "missing";
  unit: string | null;
  flag: string | null;
  abnormal: boolean;
  missingness: "observed" | "missing" | "not_present_in_source";
  assertion: string | null;
  source_type: string | null;
  panel: string | null;
  category: string | null;
  note: string | null;
  derived?: DerivedFeatures;
}

export interface SeriesSummary {
  n_points: number;
  n_abnormal: number;
  n_missing_or_not_present: number;
  first_observed_at: string | null;
  last_observed_at: string | null;
}

export interface Series {
  series_key: string;
  label: string;
  system: string;
  test_type: string;
  value_mode: "numeric" | "ordinal" | "categorical";
  unit: string | null;
  source_types: string[];
  panels: string[];
  temporal_windows: string[];
  summary: SeriesSummary;
  points: SeriesPoint[];
}

export interface TimelineMarker {
  marker_id: string;
  marker_type: "procedure" | "clinical_state";
  timestamp: string | null;
  label: string;
  status: string;
  system: string;
  source_type: string;
  event_id?: string;
  linked_event_ids?: string[];
  note: string | null;
}

export interface FacetIndex {
  by_system: Record<string, string[]>;
  by_test_type: Record<string, string[]>;
  by_window: Record<string, string[]>;
}

export interface VisualizationPayload {
  schema_version: string;
  windows: Record<string, number | null>;
  facets: FacetIndex;
  series: Series[];
  timeline_markers: TimelineMarker[];
}

// ── Canonical Types ──

export interface CanonicalMissingness {
  status: "observed" | "missing" | "not_present_in_source";
  value_missing: boolean;
  reason: string | null;
}

export interface CanonicalSourceRecord {
  source_type: string | null;
  panel: string | null;
  test_name: string | null;
  source: string | null;
  category: string | null;
  collection_datetime: string | null;
  exam_datetime: string | null;
}

export interface CanonicalGrouping {
  system: string;
  test_type: string;
  temporal_windows: string[];
}

export interface CanonicalValue {
  raw_text: string | null;
  numeric: number | null;
  categorical: string | null;
  unit: string | null;
  ordinal_severity: number | null;
  ordinal_label: string | null;
  value_mode: string;
}

export interface CanonicalSemantics {
  missingness: CanonicalMissingness;
  assertion: string | null;
  flag: string | null;
  abnormal: boolean;
  note: string | null;
  is_timeline_marker_candidate: boolean;
}

export interface CanonicalEvent {
  event_id: string;
  event_type: string;
  observed_at: string | null;
  source_row_index: number;
  source_record: CanonicalSourceRecord;
  grouping: CanonicalGrouping;
  value: CanonicalValue;
  semantics: CanonicalSemantics;
}

export interface CanonicalPayload {
  schema_version: string;
  metadata: {
    source_file: string;
    row_count: number;
    source_types: string[];
    date_range: {
      min_observation_datetime: string;
      max_observation_datetime: string;
    };
    generated_from_format: string;
    design_assumptions: string[];
  };
  observation_events: CanonicalEvent[];
}

// ── Filter State ──

export interface FilterState {
  system: string | null;
  testType: string | null;
  temporalWindow: string | null;
  valueMode: string | null;
  search: string;
}
