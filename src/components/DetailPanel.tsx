import type { Series, SeriesPoint, CanonicalEvent } from "../types";
import { formatLabel } from "../adapters/chartAdapter";

interface Props {
  point: SeriesPoint;
  series: Series;
  canonicalEvent: CanonicalEvent | null;
  MissingnessTag: React.ComponentType<{ status: string }>;
}

export function DetailPanel({ point, series, canonicalEvent, MissingnessTag }: Props) {
  return (
    <div className="detail-panel">
      <h3>Observation Detail — {point.event_id}</h3>
      <div className="detail-grid">
        <div className="detail-item">
          <div className="detail-label">Date</div>
          <div className="detail-value">{point.observed_at || "—"}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Raw Value</div>
          <div className="detail-value">{point.value_raw || "—"}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Numeric</div>
          <div className="detail-value">{point.value_numeric !== null ? point.value_numeric : "—"}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Unit</div>
          <div className="detail-value">{point.unit || "—"}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Status</div>
          <div className="detail-value">
            {point.missingness === "observed" ? (
              <span className="tag tag-observed">observed</span>
            ) : (
              <MissingnessTag status={point.missingness} />
            )}
          </div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Abnormal</div>
          <div className="detail-value">
            {point.abnormal ? <span className="tag tag-abnormal">abnormal</span> : "No"}
          </div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Flag</div>
          <div className="detail-value">{point.flag || "—"}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Assertion</div>
          <div className="detail-value">{point.assertion || "—"}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Panel</div>
          <div className="detail-value">{point.panel || "—"}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Source Type</div>
          <div className="detail-value">{point.source_type || "—"}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Category</div>
          <div className="detail-value">{point.category || "—"}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Note</div>
          <div className="detail-value">{point.note || "—"}</div>
        </div>
        {point.derived && (
          <>
            <div className="detail-item">
              <div className="detail-label">Delta</div>
              <div className="detail-value">{point.derived.delta_from_previous !== null ? point.derived.delta_from_previous.toFixed(3) : "—"}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Slope/day</div>
              <div className="detail-value">{point.derived.slope_per_day_from_previous !== null ? point.derived.slope_per_day_from_previous.toFixed(4) : "—"}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Rolling Mean (3)</div>
              <div className="detail-value">{point.derived.rolling_mean_3 !== null ? point.derived.rolling_mean_3.toFixed(3) : "—"}</div>
            </div>
          </>
        )}
      </div>

      {canonicalEvent && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--accent)", fontWeight: 500 }}>
            View Canonical Event (provenance)
          </summary>
          <pre style={{ marginTop: 8 }}>{JSON.stringify(canonicalEvent, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
