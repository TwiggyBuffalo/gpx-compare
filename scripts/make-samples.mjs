// Generates sample planned/actual GPX files for the demo button.
import { writeFileSync } from 'node:fs'

const LAT0 = 53.3559, LON0 = -6.3298 // Phoenix Park, Dublin
const R = 6371008.8, RAD = Math.PI / 180
const toLatLon = (x, y) => [LAT0 + y / (R * RAD), LON0 + x / (R * RAD * Math.cos(LAT0 * RAD))]

let seed = 42
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())

const radius = (th) => 1400 + 250 * Math.sin(3 * th)
const elev = (th) => 55 + 18 * Math.sin(2 * th) + 6 * Math.sin(7 * th)
const pt = (th, off = 0) => { const r = radius(th) + off; return [r * Math.cos(th), r * Math.sin(th)] }
const END = 1.9 * Math.PI

// Planned: sparse-ish route points
const planned = []
for (let th = 0; th <= END; th += 0.02) planned.push({ xy: pt(th), ele: elev(th) })

// Actual: dense GPS track with noise, a detour, a shortcut and a skipped section
const actual = []
let t = Date.parse('2026-10-25T08:30:00Z')
let prev = null
// GPS error drifts smoothly rather than jumping point to point
let nx = 0, ny = 0
const push = (xy, ele) => {
  nx = 0.92 * nx + gauss() * 1.2
  ny = 0.92 * ny + gauss() * 1.2
  const p = [xy[0] + nx, xy[1] + ny]
  if (prev) {
    const d = Math.hypot(p[0] - prev[0], p[1] - prev[1])
    const speed = 3.1 + 0.4 * Math.sin(actual.length / 300) + gauss() * 0.1 // ~5:20/km
    t += (d / speed) * 1000
  }
  prev = p
  actual.push({ xy: p, ele: ele + gauss() * 0.6 + 4, time: t })
}
const STEP = 0.006
for (let th = 0; th <= END; th += STEP) {
  // Shortcut: straight chord across a bend
  if (th >= 2.25 && th < 3.0) {
    const a = pt(2.25), b = pt(3.0)
    for (let f = 0; f < 1; f += 0.02) push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], elev(2.25 + 0.75 * f))
    th = 3.0
  }
  // Detour: bulge outward up to ~180 m
  let off = 0
  if (th > 3.6 && th < 4.05) off = 180 * Math.sin(((th - 3.6) / 0.45) * Math.PI)
  // A little wander to the other side of the road
  if (th > 4.6 && th < 4.75) off = -35 * Math.sin(((th - 4.6) / 0.15) * Math.PI)
  // Pause at a water fountain
  if (Math.abs(th - 1.5) < STEP / 2) t += 90_000
  push(pt(th, off), elev(th))
}

const gpx = (name, pts, tag, withTime) => `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="gpx-compare samples" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name></metadata>
  ${tag === 'rtept' ? '<rte>' : '<trk><trkseg>'}
${pts.map((p) => { const [lat, lon] = toLatLon(...p.xy); return `    <${tag} lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"><ele>${p.ele.toFixed(1)}</ele>${withTime ? `<time>${new Date(p.time).toISOString()}</time>` : ''}</${tag}>` }).join('\n')}
  ${tag === 'rtept' ? '</rte>' : '</trkseg></trk>'}
</gpx>
`
writeFileSync(new URL('../public/samples/planned.gpx', import.meta.url), gpx('Phoenix Park loop (planned)', planned, 'rtept', false))
writeFileSync(new URL('../public/samples/actual.gpx', import.meta.url), gpx('Sunday morning run', actual, 'trkpt', true))
console.log('planned', planned.length, 'actual', actual.length)
