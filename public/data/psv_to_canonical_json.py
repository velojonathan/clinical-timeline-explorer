
#!/usr/bin/env python3
"""
Transform a pipe-separated clinical dataset into:
1) canonical JSON where every source row becomes an observation_event
2) visualization-ready payload with grouped series, derived numeric features, and timeline markers
3) optional JSON schema for the canonical payload

Assumptions implemented from the design summary:
- Every input row becomes one canonical observation_event.
- Missingness preserves semantic distinction between "missing" and "not_present_in_source".
- Imaging findings keep raw text and optional ordinal severity for plotting.
- Procedures (notably nephrostomy placement) remain observations and also become timeline markers.
- Derived features are generated for numeric series: delta, slope, and rolling stats.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pandas as pd


SCHEMA_VERSION = "0.1.0"

WINDOWS_DAYS = {
    "all_time": None,
    "last_180d": 180,
    "last_30d": 30,
    "last_7d": 7,
}

ORDINAL_IMAGING_MAP = {
    "resolved": 0,
    "negative": 0,
    "none": 0,
    "not_seen": 0,
    "not_identified": 0,
    "not_imaged": 0,
    "trace": 1,
    "mild": 2,
    "mild_to_moderate": 3,
    "moderate": 4,
    "severe": 5,
}

NEGATIVE_ASSERTION_VALUES = {
    "negative",
    "none",
    "not_seen",
    "not_identified",
    "not_imaged",
    "not_distinct",
}

PROCEDURE_OUTCOME_VALUES = {
    "placed_successfully",
    "attempted_unsuccessful",
    "in_place",
}

EVENT_STATE_VALUES = {
    "persistent",
    "worsened",
    "resolved",
    "placed_successfully",
    "attempted_unsuccessful",
    "suspected",
}

PRIMARY_PROCEDURE_TESTS = {
    "left_nephrostomy_tube",
    "right_nephrostomy_tube",
    "left_nephrostomy",
    "right_nephrostomy",
}


def slugify(text: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9]+", "_", str(text).strip().lower())
    return text.strip("_")


def safe_str(value: Any) -> Optional[str]:
    if pd.isna(value):
        return None
    text = str(value).strip()
    return text if text else None


def to_iso(value: Any) -> Optional[str]:
    if pd.isna(value):
        return None
    ts = pd.to_datetime(value, errors="coerce")
    if pd.isna(ts):
        return safe_str(value)
    if ts.time().isoformat() == "00:00:00":
        return ts.strftime("%Y-%m-%d")
    return ts.isoformat(timespec="minutes")


def effective_timestamp(row: pd.Series) -> Optional[pd.Timestamp]:
    for col in ["observation_datetime", "collection_datetime", "exam_datetime"]:
        ts = pd.to_datetime(row.get(col), errors="coerce")
        if not pd.isna(ts):
            return ts
    return pd.NaT


def normalize_missingness(row: pd.Series) -> Dict[str, Any]:
    flag = safe_str(row.get("flag"))
    value = row.get("value")
    if flag == "not_present_in_source":
        return {
            "status": "not_present_in_source",
            "value_missing": True,
            "reason": safe_str(row.get("note")) or "flagged_not_present_in_source",
        }
    if flag == "missing" or pd.isna(value):
        return {
            "status": "missing",
            "value_missing": True,
            "reason": safe_str(row.get("note")) or "flagged_missing_or_empty_value",
        }
    return {"status": "observed", "value_missing": False, "reason": None}


def parse_value(value: Any) -> Tuple[Optional[float], Optional[str]]:
    text = safe_str(value)
    if text is None:
        return None, None
    try:
        numeric = pd.to_numeric(text, errors="raise")
        if pd.isna(numeric):
            return None, text
        return float(numeric), None
    except Exception:
        return None, text


def detect_assertion(value_text: Optional[str], missing_status: str) -> Optional[str]:
    if missing_status != "observed":
        return None
    if value_text is None:
        return None
    if value_text in PROCEDURE_OUTCOME_VALUES:
        return "procedure_outcome"
    if value_text in NEGATIVE_ASSERTION_VALUES:
        return "negative"
    if value_text in {"prior_cholecystectomy"}:
        return "historical"
    if value_text in {"normal", "upper_limits_normal"}:
        return "normal"
    return "positive_or_descriptive"


def classify_system(row: pd.Series) -> str:
    panel = slugify(row.get("panel", ""))
    name = slugify(row.get("test_name", ""))
    source_type = safe_str(row.get("source_type")) or ""
    renal_terms = [
        "kidney", "renal", "hydronephrosis", "hydroureter", "nephrostomy",
        "ureter", "bladder", "urine", "urobilinogen", "protein", "nitrite",
        "leukocyte_esterase", "specific_gravity", "pH", "ketones",
        "pelvic_obstructive_process", "prostate", "creatinine", "egfr", "bun",
        "perinephric", "retroperitoneal"
    ]
    hepatic_terms = [
        "hepatic", "liver", "bilirubin", "alkaline_phosphatase", "alt", "ast",
        "albumin", "globulin", "spleen", "cholecystectomy", "common_bile_duct",
        "total_protein", "lipase"
    ]
    hematology_terms = ["cbc", "wbc", "rbc", "hemoglobin", "hematocrit", "platelets",
                        "neutrophils", "lymphocytes", "monocytes", "eosinophils",
                        "basophils", "mcv", "mch", "mchc", "rdw", "mpv", "nrbc"]
    cardio_pulm_terms = ["cardio", "coronary", "pneumonia", "pulmonary", "lung", "scarring"]
    if any(term in name for term in renal_terms) or panel in {"basic_metabolic_panel", "urinalysis", "us_renal_complete"}:
        return "renal_genitourinary"
    if any(term in name for term in hepatic_terms) or panel in {"hepatic_panel", "us_abdomen_complete", "mri_abdomen_with_and_without_contrast"}:
        return "hepatobiliary"
    if any(term in name for term in hematology_terms) or panel in {"cbc", "cbc_differential"}:
        return "hematology"
    if any(term in name for term in cardio_pulm_terms):
        return "cardiopulmonary"
    if name == "psa":
        return "genitourinary"
    if source_type == "procedure_imaging":
        return "procedural"
    return "other"


def classify_test_type(row: pd.Series, numeric_value: Optional[float], text_value: Optional[str], ordinal_value: Optional[int]) -> str:
    source_type = safe_str(row.get("source_type")) or "unknown"
    panel = slugify(row.get("panel", ""))
    if source_type == "lab":
        if panel.startswith("cbc"):
            return "hematology_lab"
        if panel == "basic_metabolic_panel":
            return "chemistry_lab"
        if panel == "urinalysis":
            return "urinalysis_lab"
        if panel == "hepatic_panel":
            return "hepatic_lab"
        return "lab"
    if source_type == "imaging":
        if ordinal_value is not None:
            return "ordinal_imaging"
        if numeric_value is not None:
            return "numeric_imaging"
        return "categorical_imaging"
    if source_type == "procedure_imaging":
        if numeric_value is not None:
            return "numeric_procedure_observation"
        if text_value in PROCEDURE_OUTCOME_VALUES:
            return "procedure_outcome"
        if ordinal_value is not None:
            return "ordinal_procedure_observation"
        return "categorical_procedure_observation"
    return "unknown"


def classify_value_mode(source_type: str, numeric_value: Optional[float], text_value: Optional[str], ordinal_value: Optional[int]) -> str:
    if numeric_value is not None:
        return "numeric"
    if source_type in {"imaging", "procedure_imaging"} and ordinal_value is not None:
        return "ordinal"
    if text_value is not None:
        return "categorical"
    return "missing"


def temporal_membership(ts: Optional[pd.Timestamp], max_ts: pd.Timestamp) -> List[str]:
    if ts is None or pd.isna(ts):
        return []
    names = ["all_time"]
    delta_days = (max_ts - ts).total_seconds() / 86400.0
    for window_name, days in WINDOWS_DAYS.items():
        if days is None or window_name == "all_time":
            continue
        if delta_days <= days:
            names.append(window_name)
    return names


def event_id_for_row(row: pd.Series, idx: int) -> str:
    base = "|".join(
        [
            str(idx),
            safe_str(row.get("observation_datetime")) or "",
            safe_str(row.get("source_type")) or "",
            safe_str(row.get("panel")) or "",
            safe_str(row.get("test_name")) or "",
            safe_str(row.get("value")) or "",
        ]
    )
    digest = hashlib.sha1(base.encode("utf-8")).hexdigest()[:12]
    return f"obs_{idx:04d}_{digest}"


def build_observation_events(df: pd.DataFrame) -> List[Dict[str, Any]]:
    max_ts = pd.to_datetime(df["observation_datetime"], errors="coerce").max()
    events: List[Dict[str, Any]] = []
    for idx, row in df.iterrows():
        ts = effective_timestamp(row)
        ts_iso = None if pd.isna(ts) else (ts.isoformat(timespec="minutes") if ts.time().isoformat() != "00:00:00" else ts.strftime("%Y-%m-%d"))
        missingness = normalize_missingness(row)
        numeric_value, text_value = parse_value(row.get("value"))
        source_type = safe_str(row.get("source_type")) or "unknown"
        ordinal_value = None
        ordinal_label = None
        if source_type in {"imaging", "procedure_imaging"} and text_value in ORDINAL_IMAGING_MAP:
            ordinal_value = ORDINAL_IMAGING_MAP[text_value]
            ordinal_label = text_value
        event = {
            "event_id": event_id_for_row(row, idx),
            "event_type": "observation_event",
            "observed_at": ts_iso,
            "source_row_index": int(idx),
            "source_record": {
                "source_type": safe_str(row.get("source_type")),
                "panel": safe_str(row.get("panel")),
                "test_name": safe_str(row.get("test_name")),
                "source": safe_str(row.get("source")),
                "category": safe_str(row.get("category")),
                "collection_datetime": to_iso(row.get("collection_datetime")),
                "exam_datetime": to_iso(row.get("exam_datetime")),
            },
            "grouping": {
                "system": classify_system(row),
                "test_type": classify_test_type(row, numeric_value, text_value, ordinal_value),
                "temporal_windows": temporal_membership(ts, max_ts),
            },
            "value": {
                "raw_text": safe_str(row.get("value")),
                "numeric": numeric_value,
                "categorical": text_value if numeric_value is None else None,
                "unit": safe_str(row.get("unit")),
                "ordinal_severity": ordinal_value,
                "ordinal_label": ordinal_label,
                "value_mode": classify_value_mode(source_type, numeric_value, text_value, ordinal_value),
            },
            "semantics": {
                "missingness": missingness,
                "assertion": detect_assertion(text_value, missingness["status"]),
                "flag": safe_str(row.get("flag")),
                "abnormal": safe_str(row.get("flag")) in {"abnormal", "high", "low"},
                "note": safe_str(row.get("note")),
                "is_timeline_marker_candidate": (
                    source_type == "procedure_imaging"
                    or (safe_str(row.get("test_name")) in PRIMARY_PROCEDURE_TESTS)
                    or (text_value in EVENT_STATE_VALUES)
                ),
            },
        }
        events.append(event)
    return events


def derive_numeric_features(series_points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not series_points:
        return series_points
    points = sorted(series_points, key=lambda x: (x["observed_at"] or "", x["event_id"]))
    numeric_vals = [p["value_numeric"] for p in points]
    timestamps = [pd.to_datetime(p["observed_at"], errors="coerce") for p in points]
    for i, point in enumerate(points):
        prev_val = numeric_vals[i - 1] if i > 0 else None
        prev_ts = timestamps[i - 1] if i > 0 else pd.NaT
        val = point["value_numeric"]
        delta = None
        slope_per_day = None
        if i > 0 and prev_val is not None and val is not None:
            delta = val - prev_val
            if not pd.isna(prev_ts) and not pd.isna(timestamps[i]):
                days = (timestamps[i] - prev_ts).total_seconds() / 86400.0
                if days not in (0, None):
                    slope_per_day = delta / days
        rolling_vals = [x for x in numeric_vals[max(0, i - 2): i + 1] if x is not None]
        point["derived"] = {
            "delta_from_previous": delta,
            "slope_per_day_from_previous": slope_per_day,
            "rolling_mean_3": (sum(rolling_vals) / len(rolling_vals)) if rolling_vals else None,
            "rolling_min_3": min(rolling_vals) if rolling_vals else None,
            "rolling_max_3": max(rolling_vals) if rolling_vals else None,
            "observation_index": i,
        }
    return points


def build_series(events: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, List[str]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    facet_index = {
        "by_system": defaultdict(list),
        "by_test_type": defaultdict(list),
        "by_window": defaultdict(list),
    }

    for ev in events:
        test_name = ev["source_record"]["test_name"] or "unknown_test"
        series_key = slugify(test_name)
        point = {
            "event_id": ev["event_id"],
            "observed_at": ev["observed_at"],
            "value_raw": ev["value"]["raw_text"],
            "value_numeric": ev["value"]["numeric"],
            "value_categorical": ev["value"]["categorical"],
            "value_ordinal": ev["value"]["ordinal_severity"],
            "value_mode": ev["value"]["value_mode"],
            "unit": ev["value"]["unit"],
            "flag": ev["semantics"]["flag"],
            "abnormal": ev["semantics"]["abnormal"],
            "missingness": ev["semantics"]["missingness"]["status"],
            "assertion": ev["semantics"]["assertion"],
            "source_type": ev["source_record"]["source_type"],
            "panel": ev["source_record"]["panel"],
            "category": ev["source_record"]["category"],
            "note": ev["semantics"]["note"],
        }
        grouped[series_key].append((ev, point))

    series_list: List[Dict[str, Any]] = []
    for series_key, ev_points in sorted(grouped.items()):
        ev0 = ev_points[0][0]
        points = [p for _, p in ev_points]
        value_modes = {p["value_mode"] for p in points}
        series_mode = (
            "numeric" if "numeric" in value_modes
            else "ordinal" if "ordinal" in value_modes
            else "categorical"
        )
        if series_mode == "numeric":
            points = derive_numeric_features(points)
        system = ev0["grouping"]["system"]
        test_type = ev0["grouping"]["test_type"]
        windows = sorted({w for ev, _ in ev_points for w in ev["grouping"]["temporal_windows"]})
        unit = next((p["unit"] for p in points if p["unit"]), None)
        abnormal_n = sum(1 for p in points if p["abnormal"])
        missing_n = sum(1 for p in points if p["missingness"] != "observed")

        record = {
            "series_key": series_key,
            "label": ev0["source_record"]["test_name"],
            "system": system,
            "test_type": test_type,
            "value_mode": series_mode,
            "unit": unit,
            "source_types": sorted({p["source_type"] for p in points if p["source_type"]}),
            "panels": sorted({p["panel"] for p in points if p["panel"]}),
            "temporal_windows": windows,
            "summary": {
                "n_points": len(points),
                "n_abnormal": abnormal_n,
                "n_missing_or_not_present": missing_n,
                "first_observed_at": next((p["observed_at"] for p in sorted(points, key=lambda x: (x["observed_at"] or "")) if p["observed_at"]), None),
                "last_observed_at": next((p["observed_at"] for p in sorted(points, key=lambda x: (x["observed_at"] or ""), reverse=True) if p["observed_at"]), None),
            },
            "points": sorted(points, key=lambda x: (x["observed_at"] or "", x["event_id"])),
        }
        series_list.append(record)
        facet_index["by_system"][system].append(series_key)
        facet_index["by_test_type"][test_type].append(series_key)
        for window in windows:
            facet_index["by_window"][window].append(series_key)

    facet_index = {
        kind: {k: sorted(set(v)) for k, v in values.items()}
        for kind, values in facet_index.items()
    }
    return series_list, facet_index


def summarize_procedure_marker(rows: List[Dict[str, Any]]) -> str:
    snippets = []
    for row in rows:
        label = row["source_record"]["test_name"]
        raw = row["value"]["raw_text"]
        if label and raw:
            snippets.append(f"{label}={raw}")
    return "; ".join(snippets[:6])


def build_timeline_markers(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped_procedure_rows: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    markers: List[Dict[str, Any]] = []

    for ev in events:
        source_type = ev["source_record"]["source_type"]
        test_name = ev["source_record"]["test_name"] or ""
        raw_text = ev["value"]["raw_text"]
        if source_type == "procedure_imaging":
            group_key = f'{ev["observed_at"]}|{ev["source_record"]["panel"]}'
            grouped_procedure_rows[group_key].append(ev)

        is_marker = ev["semantics"]["is_timeline_marker_candidate"]
        if is_marker and source_type != "procedure_imaging":
            markers.append(
                {
                    "marker_id": f'marker_{ev["event_id"]}',
                    "marker_type": "clinical_state",
                    "timestamp": ev["observed_at"],
                    "label": test_name,
                    "status": raw_text,
                    "system": ev["grouping"]["system"],
                    "source_type": source_type,
                    "event_id": ev["event_id"],
                    "note": ev["semantics"]["note"],
                }
            )

    for group_key, rows in grouped_procedure_rows.items():
        rows = sorted(rows, key=lambda x: x["source_record"]["test_name"] or "")
        base = rows[0]
        markers.append(
            {
                "marker_id": f'procedure_{slugify(group_key)}',
                "marker_type": "procedure",
                "timestamp": base["observed_at"],
                "label": base["source_record"]["panel"] or "procedure",
                "status": summarize_procedure_marker(rows),
                "system": "procedural",
                "source_type": "procedure_imaging",
                "linked_event_ids": [r["event_id"] for r in rows],
                "note": next((r["semantics"]["note"] for r in rows if r["semantics"]["note"]), None),
            }
        )
    return sorted(markers, key=lambda x: (x["timestamp"] or "", x["label"] or ""))


def build_visualization_payload(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    series_list, facet_index = build_series(events)
    timeline_markers = build_timeline_markers(events)

    return {
        "schema_version": SCHEMA_VERSION,
        "windows": WINDOWS_DAYS,
        "facets": facet_index,
        "series": series_list,
        "timeline_markers": timeline_markers,
    }


def canonical_schema() -> Dict[str, Any]:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "Canonical Clinical Observation Export",
        "type": "object",
        "required": ["schema_version", "metadata", "observation_events"],
        "properties": {
            "schema_version": {"type": "string"},
            "metadata": {"type": "object"},
            "observation_events": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["event_id", "event_type", "observed_at", "source_record", "grouping", "value", "semantics"],
                    "properties": {
                        "event_id": {"type": "string"},
                        "event_type": {"const": "observation_event"},
                        "observed_at": {"type": ["string", "null"]},
                        "source_row_index": {"type": "integer"},
                        "source_record": {"type": "object"},
                        "grouping": {"type": "object"},
                        "value": {"type": "object"},
                        "semantics": {"type": "object"},
                    },
                },
            },
        },
    }


def build_metadata(df: pd.DataFrame, input_path: Path) -> Dict[str, Any]:
    obs_ts = pd.to_datetime(df["observation_datetime"], errors="coerce")
    return {
        "source_file": str(input_path),
        "row_count": int(len(df)),
        "source_types": sorted(df["source_type"].dropna().astype(str).unique().tolist()),
        "date_range": {
            "min_observation_datetime": to_iso(obs_ts.min()),
            "max_observation_datetime": to_iso(obs_ts.max()),
        },
        "generated_from_format": "psv",
        "design_assumptions": [
            "each source row becomes one canonical observation_event",
            "missing and not_present_in_source are preserved as distinct statuses",
            "imaging findings include raw text plus optional ordinal severity",
            "procedures remain observations and also produce timeline markers",
            "numeric derived features include delta, slope, rolling mean/min/max over 3 observations",
        ],
    }


def transform_psv(input_path: Path) -> Dict[str, Any]:
    df = pd.read_csv(input_path, sep="|")
    events = build_observation_events(df)
    metadata = build_metadata(df, input_path)
    visualization = build_visualization_payload(events)
    return {
        "schema_version": SCHEMA_VERSION,
        "metadata": metadata,
        "observation_events": events,
        "visualization_payload": visualization,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_psv", type=Path, help="Path to pipe-separated source file")
    parser.add_argument("--out-prefix", type=Path, default=None, help="Output prefix for JSON files")
    args = parser.parse_args()

    payload = transform_psv(args.input_psv)
    prefix = args.out_prefix or args.input_psv.with_suffix("")
    prefix = Path(prefix)

    canonical_path = prefix.parent / f"{prefix.name}_canonical.json"
    viz_path = prefix.parent / f"{prefix.name}_visualization_payload.json"
    schema_path = prefix.parent / f"{prefix.name}_schema.json"

    canonical = {
        "schema_version": payload["schema_version"],
        "metadata": payload["metadata"],
        "observation_events": payload["observation_events"],
    }

    with canonical_path.open("w", encoding="utf-8") as f:
        json.dump(canonical, f, indent=2, ensure_ascii=False)
    with viz_path.open("w", encoding="utf-8") as f:
        json.dump(payload["visualization_payload"], f, indent=2, ensure_ascii=False)
    with schema_path.open("w", encoding="utf-8") as f:
        json.dump(canonical_schema(), f, indent=2, ensure_ascii=False)

    print(json.dumps({
        "canonical_path": str(canonical_path),
        "visualization_payload_path": str(viz_path),
        "schema_path": str(schema_path),
        "row_count": payload["metadata"]["row_count"],
        "observation_event_count": len(payload["observation_events"]),
        "series_count": len(payload["visualization_payload"]["series"]),
        "timeline_marker_count": len(payload["visualization_payload"]["timeline_markers"]),
    }, indent=2))


if __name__ == "__main__":
    main()
