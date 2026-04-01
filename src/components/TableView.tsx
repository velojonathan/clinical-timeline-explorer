import type { Series, SeriesPoint } from "../types";
import { formatLabel } from "../adapters/chartAdapter";

interface Props {
  series: Series;
  selectedPointId: string | null;
  onRowClick: (eventId: string) => void;
  MissingnessTag: React.ComponentType<{ status: string }>;
}

export function TableView({ series, selectedPointId, onRowClick, MissingnessTag }: Props) {
  const isNumeric = series.value_mode === "numeric";

  return (
    <div className="table-section">
      <h3>Data Table — {formatLabel(series.label)} ({series.points.length} observations)</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Raw Value</th>
            {isNumeric && <th>Numeric</th>}
            {!isNumeric && <th>Category / Ordinal</th>}
            <th>Unit</th>
            <th>Status</th>
            <th>Flag</th>
            <th>Panel</th>
            {isNumeric && <th>Delta</th>}
            {isNumeric && <th>Rolling Avg</th>}
          </tr>
        </thead>
        <tbody>
          {series.points.map((pt) => (
            <tr
              key={pt.event_id}
              className={`clickable ${selectedPointId === pt.event_id ? "selected" : ""}`}
              onClick={() => onRowClick(pt.event_id)}
            >
              <td>{pt.observed_at || "—"}</td>
              <td>{pt.value_raw || "—"}</td>
              {isNumeric && <td>{pt.value_numeric !== null ? pt.value_numeric : "—"}</td>}
              {!isNumeric && (
                <td>
                  {pt.value_categorical || (pt.value_ordinal !== null ? `severity: ${pt.value_ordinal}` : "—")}
                </td>
              )}
              <td>{pt.unit || "—"}</td>
              <td>
                {pt.missingness === "observed" ? (
                  <span className="tag tag-observed">observed</span>
                ) : (
                  <MissingnessTag status={pt.missingness} />
                )}
              </td>
              <td>
                {pt.abnormal ? <span className="tag tag-abnormal">{pt.flag || "abnormal"}</span> : (pt.flag || "—")}
              </td>
              <td>{pt.panel || "—"}</td>
              {isNumeric && (
                <td>{pt.derived?.delta_from_previous !== null && pt.derived?.delta_from_previous !== undefined
                  ? pt.derived.delta_from_previous.toFixed(2) : "—"}</td>
              )}
              {isNumeric && (
                <td>{pt.derived?.rolling_mean_3 !== null && pt.derived?.rolling_mean_3 !== undefined
                  ? pt.derived.rolling_mean_3.toFixed(2) : "—"}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
