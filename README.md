# Clinical Timeline Explorer

A local web app for exploring clinical timeline datasets. Built with React, TypeScript, Vite, and Recharts.

## Features

- **Visualization Payload Mode**: Charts rendered directly from the visualization payload JSON (the source of truth for all plotting)
- **Canonical Event Inspection Mode**: Drill-down into raw canonical events for provenance and detail
- **Numeric series** (e.g. creatinine, BUN, eGFR): line charts with interactive points
- **Categorical/ordinal imaging findings**: scatter plots with discrete event dots
- **Procedure markers** (e.g. nephrostomy placement): vertical dashed reference lines on the timeline
- **Filter controls**: system, test type, temporal window, value type, and free-text search
- **Detail panel**: raw source text, timestamp, units, flag, assertion, and source metadata
- **Data table**: tabular view of all observations for the selected series
- **Missingness distinction**: `missing` (amber) and `not_present_in_source` (red) are visually distinct and never merged

## Data Files

Place these in `public/data/`:

| File | Purpose |
|------|---------|
| `cleaned_visualization_dataset_transformed_visualization_payload.json` | Primary data source for all charts |
| `cleaned_visualization_dataset_transformed_canonical.json` | Canonical events for drill-down/provenance |
| `cleaned_visualization_dataset_transformed_schema.json` | JSON schema for the canonical format |
| `psv_to_canonical_json.py` | Python script to regenerate canonical + payload from PSV |

## Setup & Run

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The app runs at `http://localhost:5173` by default.

## Stack

- React 19 + TypeScript
- Vite 8
- Recharts (charting)
- No backend required — all data loaded from static JSON in `public/data/`

## Architecture

```
src/
├── types.ts              # TypeScript interfaces matching the payload/canonical schemas
├── adapters/
│   └── chartAdapter.ts   # Thin adapter: payload series → chart-ready structures
├── components/
│   ├── NumericChart.tsx   # Line chart for numeric series (Recharts)
│   ├── CategoricalChart.tsx  # Scatter chart for categorical/ordinal series
│   ├── DetailPanel.tsx    # Selected observation detail + canonical provenance
│   ├── TableView.tsx      # Tabular data view for selected series
│   └── CanonicalInspector.tsx  # Raw canonical event browser with search
├── App.tsx               # Main layout: sidebar filters + chart + detail + table
├── main.tsx              # Entry point
└── index.css             # All styles (clinical minimal theme)
```

## Notes

- The visualization payload is the **sole source of truth** for chart rendering. The canonical JSON is only used for event detail panels and provenance.
- No data model redesign — the adapter layer maps payload objects directly into chart-ready structures.
- Single-entity dataset: no patient/entity selector is shown (would appear automatically if multiple entities were present in the payload).
