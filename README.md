# Route Accuracy (GPX compare)

Upload a planned route GPX and the GPX you actually recorded; get an accuracy score and a breakdown of where and how they differ. Everything runs in the browser, so no files leave your machine (map tiles come from OpenStreetMap).

Try it out now at https://twiggybuffalo.github.io/gpx-compare/

To run it locally:

```bash
npm install
npm run dev
```

## How the score works

A corridor (default ±25 m, adjustable) is drawn around the planned route.

| Component | Weight | Meaning |
|---|---|---|
| Route coverage | 45% | Share of the planned route (sampled every 10 m) your track passed within the corridor |
| Stayed on route | 40% | Share of the distance you recorded that was inside the corridor |
| Line precision | 15% | `exp(-median deviation / corridor)`: how tightly you hugged the line |

Grades: A+ ≥97, A ≥90, B ≥80, C ≥70, D ≥60, otherwise F.

Off-route episodes are classified by comparing the distance you covered with the planned distance between where you left and rejoined the route: **shortcut** (shorter), **detour** (longer) or **parallel** (about the same, e.g. the other side of the road).

## Code

- `src/lib/gpx.ts`: GPX parsing (track points, then route points, then waypoints)
- `src/lib/compare.ts`: geometry and metrics (grid-indexed nearest-segment search)
- `src/lib/insights.ts`: the plain-English insights
- `scripts/make-samples.mjs`: regenerates `public/samples/*.gpx`
