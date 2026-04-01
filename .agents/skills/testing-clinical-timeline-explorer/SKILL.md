# Testing Clinical Timeline Explorer

## Overview
This is a React + Vite + TypeScript app that renders clinical timeline data from a visualization payload JSON. It uses Recharts for charts and has no backend.

## Local Dev Server Setup
```bash
npm install
npm run dev
# Runs on http://localhost:5173 by default
```

## Testing Approach
Headless Puppeteer (Chrome) automation is the most reliable way to test this app. GUI-based browser testing may encounter display issues depending on the environment.

### Key Test Areas
1. **Data loading**: Verify series count (check `.series-count` element), mode buttons, empty state
2. **Filtering**: System/test type/temporal window dropdowns + search box
3. **Numeric charts**: Line charts via Recharts (`.recharts-line`, `.recharts-line-dots circle`)
4. **Categorical charts**: Scatter plots (`.recharts-scatter`)
5. **Detail panel**: Click a data point → `.detail-panel` shows metadata fields in `.detail-item` elements
6. **Canonical provenance**: Expand `<details>` in detail panel → JSON with canonical event
7. **Table view**: `.data-table` below chart with derived values (delta, rolling avg)
8. **Missingness distinction**: `.tag-missing` (amber) vs `.tag-not-present` (red) — verify computed styles differ
9. **Canonical Events mode**: Toggle via mode buttons → `.canonical-inspector` with search and pagination
10. **Mode toggle round-trip**: Switch canonical → visualization, verify sidebar returns

## Search Behavior
The sidebar search uses `String.includes()` against raw series labels which use underscores (e.g., `absolute_basophils`). Searching with spaces ("absolute basophils") might return 0 results. Use underscores in automated test searches, or search against `series_key` which also uses underscores.

The `formatLabel()` function converts underscores to title case for display (e.g., "Absolute Basophils"), but filtering operates on raw labels. This might be fixed in the future, so try space-based search first and fall back to underscore-based search if 0 results.

## Series Selection
When searching for a series name that is a substring of another (e.g., "creatinine" matches both "BUN Creatinine Ratio" and "Creatinine"), click by exact formatted label match rather than `includes()` to avoid selecting the wrong series.

## Data-Driven Assertions
The visualization payload JSON is the source of truth. For specific assertions:
- Series counts come from `payload.series.length` and facet groups
- Point values, event IDs, dates come from `series.points[i]`
- Derived values (delta, rolling mean) come from `series.points[i].derived`
- Canonical events come from the separate canonical JSON file

## CSS Selectors Reference
| Element | Selector |
|---|---|
| Series count | `.series-count` |
| Series items | `.series-item`, `.series-label` |
| Chart title | `.chart-container h2` |
| Chart subtitle | `.chart-subtitle` |
| Line chart | `.recharts-line` |
| Scatter chart | `.recharts-scatter` |
| Data dots | `.recharts-line-dots circle` |
| Detail panel | `.detail-panel` |
| Detail fields | `.detail-item .detail-label`, `.detail-item .detail-value` |
| Canonical provenance | `.detail-panel details summary` |
| Table section | `.table-section` |
| Data table | `.data-table` |
| Missing tag | `.tag-missing` (amber) |
| Not-present tag | `.tag-not-present` (red) |
| Observed tag | `.tag-observed` (green) |
| Canonical inspector | `.canonical-inspector` |
| Canonical search | `.canonical-search input` |
| Canonical event IDs | `.ce-id` |
| Mode toggle buttons | `.mode-toggle button` |

## Devin Secrets Needed
No secrets are needed. This is a fully local app with no authentication or external API calls.
