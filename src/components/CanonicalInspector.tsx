import { useState, useMemo } from "react";
import type { CanonicalPayload, CanonicalEvent } from "../types";

interface Props {
  canonical: CanonicalPayload | null;
}

export function CanonicalInspector({ canonical }: Props) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const events = canonical?.observation_events || [];

  const filtered = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.trim().toLowerCase();
    return events.filter(
      (e) =>
        e.event_id.toLowerCase().includes(q) ||
        (e.source_record.test_name || "").toLowerCase().includes(q) ||
        (e.source_record.panel || "").toLowerCase().includes(q) ||
        (e.value.raw_text || "").toLowerCase().includes(q) ||
        (e.grouping.system || "").toLowerCase().includes(q) ||
        (e.observed_at || "").includes(q)
    );
  }, [events, search]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  if (!canonical) {
    return <div className="canonical-inspector"><p>Canonical data not loaded.</p></div>;
  }

  return (
    <div className="canonical-inspector">
      <h2>Canonical Event Inspector</h2>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
        {canonical.metadata.row_count} events · {canonical.metadata.date_range.min_observation_datetime} to {canonical.metadata.date_range.max_observation_datetime}
        {" · Source: "}{canonical.metadata.source_file}
      </p>

      <div className="canonical-search">
        <input
          type="text"
          placeholder="Search events by ID, test name, panel, value, system, or date..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
      </div>

      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
        Showing {paged.length} of {filtered.length} events
        {totalPages > 1 && (
          <>
            {" · Page "}
            <button
              style={{ border: "none", background: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11 }}
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              ◀
            </button>
            {" "}{page + 1} / {totalPages}{" "}
            <button
              style={{ border: "none", background: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11 }}
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              ▶
            </button>
          </>
        )}
      </p>

      {paged.map((evt) => (
        <div key={evt.event_id} className="canonical-event">
          <div className="ce-header">
            <span className="ce-id">{evt.event_id}</span>
            <span className="ce-date">{evt.observed_at || "no date"}</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {evt.source_record.test_name} · {evt.grouping.system}
            </span>
            {evt.semantics.missingness.status !== "observed" && (
              <span className={`tag ${evt.semantics.missingness.status === "missing" ? "tag-missing" : "tag-not-present"}`}>
                {evt.semantics.missingness.status}
              </span>
            )}
          </div>
          <div className="ce-body">
            <span style={{ marginRight: 8 }}>
              <strong>Value:</strong> {evt.value.raw_text || "—"}
              {evt.value.unit && ` ${evt.value.unit}`}
            </span>
            <span style={{ marginRight: 8 }}>
              <strong>Mode:</strong> {evt.value.value_mode}
            </span>
            {evt.semantics.abnormal && <span className="tag tag-abnormal">abnormal</span>}
            {evt.semantics.is_timeline_marker_candidate && (
              <span className="tag" style={{ background: "#ede9fe", color: "#5b21b6", border: "1px solid #c4b5fd", marginLeft: 4 }}>
                marker
              </span>
            )}
          </div>
          <button
            style={{
              marginTop: 8, border: "none", background: "none", color: "var(--accent)",
              cursor: "pointer", fontSize: 11, textDecoration: "underline"
            }}
            onClick={() => setExpandedId(expandedId === evt.event_id ? null : evt.event_id)}
          >
            {expandedId === evt.event_id ? "Hide raw JSON" : "Show raw JSON"}
          </button>
          {expandedId === evt.event_id && (
            <pre style={{ marginTop: 8 }}>{JSON.stringify(evt, null, 2)}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
