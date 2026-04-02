# Testing: Clinical Timeline Explorer

## Local Dev Setup

```bash
cd clinical-timeline-explorer
npm install
npx vite --host 0.0.0.0 --port 5173
```

App runs at `http://localhost:5173`. No backend, no auth — static JSON data files.

If the Vite dev server binds only to IPv6 (`[::1]:5173`), use `--host 0.0.0.0` to bind to all interfaces.

## Build & Lint

```bash
npm run build      # TypeScript strict + Vite production build
npm run lint       # ESLint
npx tsc --noEmit   # Type check only
```

## Testing with Puppeteer

Puppeteer headless browser testing works well for this app. Key patterns:

### Recharts CSS Selectors (Important)

Recharts renders custom dot components with `className` as `[object Object]`, so `.recharts-dot` will NOT match. Use these selectors instead:

| Element | Selector |
|---|---|
| Line chart dots | `.recharts-line-dots circle` |
| SVG path (line) | `.recharts-line-curve` |
| X-axis tick labels | `.recharts-cartesian-axis-tick-value` or `.recharts-cartesian-axis-tick-value tspan` |
| Tooltip wrapper | `.recharts-tooltip-wrapper` |
| ReferenceArea rects | `.recharts-reference-area rect` |
| Chart wrapper | `.recharts-wrapper` |
| Chart surface | `.recharts-surface` |

To get dot viewport coordinates for mouse interactions:
```js
const pos = await page.evaluate(() => {
  const wrapper = document.querySelector('.recharts-wrapper');
  const wrapperRect = wrapper.getBoundingClientRect();
  const dots = wrapper.querySelectorAll('.recharts-line-dots circle');
  const cx = parseFloat(dots[0].getAttribute('cx'));
  const cy = parseFloat(dots[0].getAttribute('cy'));
  return { x: wrapperRect.left + cx, y: wrapperRect.top + cy };
});
await page.mouse.move(pos.x, pos.y); // trigger tooltip
await page.mouse.click(pos.x, pos.y); // trigger click
```

### Sidebar Search Trap

When searching for series like "creatinine", multiple matches may appear (e.g., "BUN Creatinine Ratio" before "Creatinine"). Always filter by exact label text rather than clicking the first `.series-item`:

```js
const seriesItems = await page.$$('.series-item');
for (const item of seriesItems) {
  const text = await page.evaluate(el => el.textContent, item);
  if (text.includes('Creatinine') && !text.includes('BUN')) {
    await item.click();
    break;
  }
}
```

### Key App CSS Selectors

| Element | Selector |
|---|---|
| Search input | `input[placeholder="Search series..."]` |
| Series items | `.series-item` |
| Selected series | `.series-item.selected` |
| Chart container | `.chart-container` |
| Chart title | `.chart-container h2` |
| Range buttons | `.range-btn` |
| Active range button | `.range-btn.active` |
| Range info text | `.range-info` |
| Overview chart | `.overview-chart` |
| Overview label | `.overview-label` |
| Compress checkbox | `.chart-toggles input[type="checkbox"]` |
| Detail panel | `.detail-panel` |

## Data Expectations for Creatinine

- 8 points total: 2 old (Nov 7: 1.7, Dec 4: 1.6), 6 recent (Mar 27-Apr 1)
- Smart default: pickDefaultRange returns "30d" (ratio=0.75 >= 0.5)
- Points by range: 7d=6, 30d=6, 90d=6, All=8
- 113-day gap between Dec 4 and Mar 27 (exceeds 14-day compression threshold)
- All points flagged "high" (abnormal)

## SVG Path Verification

To verify straight lines (no curves), check the SVG `d` attribute:
- `L` commands = straight line segments (correct for `type="linear"`)
- `C`/`S`/`Q`/`T` commands = bezier curves (would indicate `type="monotone"` regression)

## Gap Compression Testing

When testing compress toggle, measure dot `cx` positions before and after. The max gap between adjacent dots should decrease significantly (expect ~60-70% reduction for creatinine's 113-day gap). A small variance (~3%) in dot positions between toggle ON/OFF is normal due to Recharts re-rendering.

Gray gap regions use `fill="#f3f4f6"` and blue overview highlights use `fill="#dbeafe"`.

## Devin Secrets Needed

None — this is a static JSON app with no authentication or external API calls.
