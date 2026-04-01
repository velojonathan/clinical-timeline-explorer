import { useEffect, useState } from "react";
import type { VisualizationPayload, CanonicalPayload, FilterState } from "./types";
import { filterSeries, formatLabel, seriesToChartData, markersToChartMarkers } from "./adapters/chartAdapter";
import { NumericChart } from "./components/NumericChart";
import { CategoricalChart } from "./components/CategoricalChart";
import { TableView } from "./components/TableView";
import { DetailPanel } from "./components/DetailPanel";
import { CanonicalInspector } from "./components/CanonicalInspector";
import "./index.css";

type AppMode = "visualization" | "canonical";

function MissingnessTag({ status }: { status: string }) {
  if (status === "missing") return <span className="tag tag-missing">missing</span>;
  if (status === "not_present_in_source") return <span className="tag tag-not-present">not in source</span>;
  return null;
}

export default function App() {
  const [payload, setPayload] = useState<VisualizationPayload | null>(null);
  const [canonical, setCanonical] = useState<CanonicalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AppMode>("visualization");

  const [filters, setFilters] = useState<FilterState>({
    system: null,
    testType: null,
    temporalWindow: null,
    valueMode: null,
    search: "",
  });

  const [selectedSeriesKey, setSelectedSeriesKey] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/data/cleaned_visualization_dataset_transformed_visualization_payload.json").then((r) => r.json()),
      fetch("/data/cleaned_visualization_dataset_transformed_canonical.json").then((r) => r.json()),
    ])
      .then(([vizData, canonData]) => {
        setPayload(vizData as VisualizationPayload);
        setCanonical(canonData as CanonicalPayload);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="empty-state">Loading clinical data...</div>;
  if (error || !payload) return <div className="empty-state">Error: {error || "No data"}</div>;

  const filteredSeries = filterSeries(payload, filters);
  const selectedSeries = selectedSeriesKey ? payload.series.find((s) => s.series_key === selectedSeriesKey) || null : null;
  const selectedPoint = selectedSeries && selectedPointId
    ? selectedSeries.points.find((p) => p.event_id === selectedPointId) || null
    : null;

  const canonicalEvent = selectedPointId && canonical
    ? canonical.observation_events.find((e) => e.event_id === selectedPointId) || null
    : null;

  const systems = Object.keys(payload.facets.by_system).sort();
  const testTypes = Object.keys(payload.facets.by_test_type).sort();
  const windows = Object.keys(payload.facets.by_window).sort();
  const valueModes = ["numeric", "ordinal", "categorical"];

  const chartData = selectedSeries ? seriesToChartData(selectedSeries) : null;
  const markers = markersToChartMarkers(payload.timeline_markers);

  return (
    <>
      <header className="app-header">
        <h1>Clinical Timeline Explorer</h1>
        <div className="mode-toggle">
          <button className={mode === "visualization" ? "active" : ""} onClick={() => setMode("visualization")}>
            Visualization
          </button>
          <button className={mode === "canonical" ? "active" : ""} onClick={() => setMode("canonical")}>
            Canonical Events
          </button>
        </div>
      </header>

      <div className="app-body">
        {mode === "visualization" ? (
          <>
            {/* Sidebar */}
            <aside className="sidebar">
              <div className="filter-section">
                <label>Search</label>
                <input
                  type="text"
                  placeholder="Search series..."
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                />
              </div>
              <div className="filter-section">
                <label>System</label>
                <select value={filters.system || ""} onChange={(e) => setFilters((f) => ({ ...f, system: e.target.value || null }))}>
                  <option value="">All Systems</option>
                  {systems.map((s) => (
                    <option key={s} value={s}>{formatLabel(s)}</option>
                  ))}
                </select>
              </div>
              <div className="filter-section">
                <label>Test Type</label>
                <select value={filters.testType || ""} onChange={(e) => setFilters((f) => ({ ...f, testType: e.target.value || null }))}>
                  <option value="">All Types</option>
                  {testTypes.map((t) => (
                    <option key={t} value={t}>{formatLabel(t)}</option>
                  ))}
                </select>
              </div>
              <div className="filter-section">
                <label>Temporal Window</label>
                <select value={filters.temporalWindow || ""} onChange={(e) => setFilters((f) => ({ ...f, temporalWindow: e.target.value || null }))}>
                  <option value="">All Windows</option>
                  {windows.map((w) => (
                    <option key={w} value={w}>{formatLabel(w)}</option>
                  ))}
                </select>
              </div>
              <div className="filter-section">
                <label>Value Type</label>
                <select value={filters.valueMode || ""} onChange={(e) => setFilters((f) => ({ ...f, valueMode: e.target.value || null }))}>
                  <option value="">All</option>
                  {valueModes.map((m) => (
                    <option key={m} value={m}>{formatLabel(m)}</option>
                  ))}
                </select>
              </div>

              <div className="series-count">{filteredSeries.length} series</div>

              <div className="series-list">
                {filteredSeries.map((s) => (
                  <div
                    key={s.series_key}
                    className={`series-item ${selectedSeriesKey === s.series_key ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedSeriesKey(s.series_key);
                      setSelectedPointId(null);
                    }}
                  >
                    <div className="series-label">{formatLabel(s.label)}</div>
                    <div className="series-meta">
                      {formatLabel(s.system)} · {s.value_mode} · {s.summary.n_points} pts
                      {s.summary.n_abnormal > 0 && <> · <span style={{ color: "var(--danger)" }}>{s.summary.n_abnormal} abnl</span></>}
                      {s.summary.n_missing_or_not_present > 0 && <> · {s.summary.n_missing_or_not_present} gaps</>}
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            {/* Main Panel */}
            <div className="main-panel">
              {selectedSeries && chartData ? (
                <>
                  <div className="chart-container">
                    <h2>{formatLabel(selectedSeries.label)}</h2>
                    <div className="chart-subtitle">
                      {formatLabel(selectedSeries.system)} · {formatLabel(selectedSeries.test_type)}
                      {selectedSeries.unit && <> · {selectedSeries.unit}</>}
                      {" · "}
                      {selectedSeries.summary.first_observed_at} to {selectedSeries.summary.last_observed_at}
                    </div>

                    {chartData.valueMode === "numeric" ? (
                      <NumericChart
                        data={chartData}
                        markers={markers}
                        onPointClick={(eventId) => setSelectedPointId(eventId)}
                        selectedPointId={selectedPointId}
                      />
                    ) : (
                      <CategoricalChart
                        data={chartData}
                        markers={markers}
                        onPointClick={(eventId) => setSelectedPointId(eventId)}
                        selectedPointId={selectedPointId}
                      />
                    )}
                  </div>

                  <div className="bottom-panel">
                    {selectedPoint && (
                      <DetailPanel
                        point={selectedPoint}
                        canonicalEvent={canonicalEvent}
                        MissingnessTag={MissingnessTag}
                      />
                    )}
                    <TableView
                      series={selectedSeries}
                      selectedPointId={selectedPointId}
                      onRowClick={(id) => setSelectedPointId(id)}
                      MissingnessTag={MissingnessTag}
                    />
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">&#128200;</div>
                  <div>Select a series from the sidebar to view its timeline</div>
                </div>
              )}
            </div>
          </>
        ) : (
          <CanonicalInspector canonical={canonical} />
        )}
      </div>
    </>
  );
}
