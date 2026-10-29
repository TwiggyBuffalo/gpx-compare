import type { ParsedGpx, TrackPoint } from './gpx'

const R = 6371008.8
const RAD = Math.PI / 180

interface XY {
  x: number
  y: number
}

/** Local equirectangular projection — accurate to well under 1% for routes of a few hundred km. */
function makeProjector(points: TrackPoint[]) {
  let lat0 = 0
  let lon0 = 0
  for (const p of points) {
    lat0 += p.lat
    lon0 += p.lon
  }
  lat0 /= points.length
  lon0 /= points.length
  const kx = Math.cos(lat0 * RAD) * R * RAD
  const ky = R * RAD
  return {
    project: (p: TrackPoint): XY => ({ x: (p.lon - lon0) * kx, y: (p.lat - lat0) * ky }),
    unproject: (q: XY): [number, number] => [q.y / ky + lat0, q.x / kx + lon0],
  }
}

function cumulative(xy: XY[]): number[] {
  const out = [0]
  for (let i = 1; i < xy.length; i++) out.push(out[i - 1] + Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y))
  return out
}

interface Nearest {
  dist: number
  seg: number
  t: number
}

/** Uniform-grid spatial index over polyline segments for fast nearest-segment queries. */
class SegmentIndex {
  private cells = new Map<string, number[]>()
  private pts: XY[]
  private cell: number
  constructor(pts: XY[], cell = 50) {
    this.pts = pts
    this.cell = cell
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const x0 = Math.floor(Math.min(a.x, b.x) / cell)
      const x1 = Math.floor(Math.max(a.x, b.x) / cell)
      const y0 = Math.floor(Math.min(a.y, b.y) / cell)
      const y1 = Math.floor(Math.max(a.y, b.y) / cell)
      for (let cx = x0; cx <= x1; cx++)
        for (let cy = y0; cy <= y1; cy++) {
          const k = `${cx},${cy}`
          const list = this.cells.get(k)
          if (list) list.push(i)
          else this.cells.set(k, [i])
        }
    }
  }

  private segDist(p: XY, i: number, best: Nearest) {
    const a = this.pts[i]
    const b = this.pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    if (d < best.dist) {
      best.dist = d
      best.seg = i
      best.t = t
    }
  }

  nearest(p: XY): Nearest {
    const best: Nearest = { dist: Infinity, seg: 0, t: 0 }
    const cx = Math.floor(p.x / this.cell)
    const cy = Math.floor(p.y / this.cell)
    const seen = new Set<number>()
    for (let r = 0; r <= 200; r++) {
      for (let ix = cx - r; ix <= cx + r; ix++)
        for (let iy = cy - r; iy <= cy + r; iy++) {
          if (Math.max(Math.abs(ix - cx), Math.abs(iy - cy)) !== r) continue
          const list = this.cells.get(`${ix},${iy}`)
          if (!list) continue
          for (const s of list) {
            if (seen.has(s)) continue
            seen.add(s)
            this.segDist(p, s, best)
          }
        }
      if (best.dist <= r * this.cell) return best
    }
    // Very far away (>10 km): brute force
    for (let i = 0; i < this.pts.length - 1; i++) this.segDist(p, i, best)
    return best
  }
}

function elevationChange(ele: (number | undefined)[]): { gain: number; loss: number } | null {
  const raw = ele.filter((e): e is number => e != null)
  if (raw.length < ele.length * 0.5 || raw.length < 2) return null
  // Light moving-average smoothing, then a hysteresis filter to ignore altitude jitter
  const W = 3
  const vals = raw.map((_, i) => {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, i - W); j <= Math.min(raw.length - 1, i + W); j++) {
      sum += raw[j]
      n++
    }
    return sum / n
  })
  const H = 3
  let gain = 0
  let loss = 0
  let ref = vals[0]
  for (const v of vals) {
    if (v - ref >= H) {
      gain += v - ref
      ref = v
    } else if (ref - v >= H) {
      loss += ref - v
      ref = v
    }
  }
  return { gain, loss }
}

const percentile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]

export interface Excursion {
  startIdx: number
  endIdx: number
  maxIdx: number
  length: number
  maxDev: number
  startKm: number
  kind: 'detour' | 'shortcut' | 'parallel'
  /** Planned distance between where you left and rejoined the route */
  plannedGap: number
  durationMs: number | null
}

export interface Skipped {
  startDist: number
  length: number
  coords: [number, number][]
}

export interface KmSplit {
  km: number
  distance: number
  durationMs: number | null
  onRoutePct: number
  meanDev: number
}

export interface TimeStats {
  elapsedMs: number
  movingMs: number
  offRouteMs: number
  avgMovingSpeed: number // m/s
  maxSpeed: number // m/s
}

export interface Analysis {
  threshold: number
  planned: { name: string; coords: [number, number][]; distance: number; elev: { gain: number; loss: number } | null }
  actual: {
    name: string
    coords: [number, number][]
    cumDist: number[]
    distance: number
    elev: { gain: number; loss: number } | null
    ele: (number | null)[]
    deviation: number[]
    /** Planned elevation at the nearest point on the planned route */
    plannedEleAtNearest: (number | null)[]
  }
  score: number
  grade: string
  components: { coverage: number; onRoute: number; precision: number }
  stats: { meanDev: number; medianDev: number; p95Dev: number; maxDev: number; maxDevIdx: number; hausdorff: number }
  excursions: Excursion[]
  skipped: Skipped[]
  splits: KmSplit[]
  time: TimeStats | null
  reversed: boolean
  longestStreak: number
  startOffset: number
  endOffset: number
}

export function gradeFor(score: number): string {
  if (score >= 97) return 'A+'
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

export function analyze(planned: ParsedGpx, actual: ParsedGpx, threshold = 25): Analysis {
  const proj = makeProjector(planned.points)
  const pXY = planned.points.map(proj.project)
  const aXY = actual.points.map(proj.project)
  const pCum = cumulative(pXY)
  const aCum = cumulative(aXY)
  const pTotal = pCum[pCum.length - 1]
  const aTotal = aCum[aCum.length - 1]

  // --- Actual -> planned: deviation & progress along the planned route
  const pIndex = new SegmentIndex(pXY)
  const deviation: number[] = []
  const progress: number[] = []
  const plannedEleAtNearest: (number | null)[] = []
  for (const q of aXY) {
    const n = pIndex.nearest(q)
    deviation.push(n.dist)
    const segLen = pCum[n.seg + 1] - pCum[n.seg]
    progress.push(pCum[n.seg] + n.t * segLen)
    const e0 = planned.points[n.seg].ele
    const e1 = planned.points[n.seg + 1]?.ele
    plannedEleAtNearest.push(e0 != null && e1 != null ? e0 + (e1 - e0) * n.t : (e0 ?? null))
  }

  // --- Planned -> actual: coverage, sampled every ~10 m along the planned route
  const aIndex = new SegmentIndex(aXY)
  const STEP = 10
  const samples: { d: number; xy: XY; covered: boolean; dist: number }[] = []
  for (let i = 0, d = 0; i < pXY.length - 1; i++) {
    const a = pXY[i]
    const b = pXY[i + 1]
    const len = pCum[i + 1] - pCum[i]
    for (; d <= pCum[i + 1]; d += STEP) {
      const t = len === 0 ? 0 : (d - pCum[i]) / len
      const xy = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      const dist = aIndex.nearest(xy).dist
      samples.push({ d, xy, covered: dist <= threshold, dist })
    }
  }
  const coverage = samples.filter((s) => s.covered).length / samples.length
  const plannedMaxDist = samples.reduce((m, s) => Math.max(m, s.dist), 0)

  // Skipped stretches of the planned route
  const skipped: Skipped[] = []
  for (let i = 0; i < samples.length; ) {
    if (samples[i].covered) {
      i++
      continue
    }
    let j = i
    while (j + 1 < samples.length && !samples[j + 1].covered) j++
    const length = samples[j].d - samples[i].d
    if (length >= Math.max(100, threshold * 4))
      skipped.push({ startDist: samples[i].d, length, coords: samples.slice(i, j + 1).map((s) => proj.unproject(s.xy)) })
    i = j + 1
  }

  // On-route share of the distance you actually covered
  let onDist = 0
  let streak = 0
  let longestStreak = 0
  for (let i = 1; i < aXY.length; i++) {
    const seg = aCum[i] - aCum[i - 1]
    if ((deviation[i] + deviation[i - 1]) / 2 <= threshold) {
      onDist += seg
      streak += seg
      longestStreak = Math.max(longestStreak, streak)
    } else streak = 0
  }
  const onRoute = aTotal > 0 ? onDist / aTotal : 0

  // Deviation stats
  const sorted = [...deviation].sort((a, b) => a - b)
  const meanDev = deviation.reduce((s, v) => s + v, 0) / deviation.length
  const medianDev = percentile(sorted, 0.5)
  let maxDevIdx = 0
  deviation.forEach((v, i) => {
    if (v > deviation[maxDevIdx]) maxDevIdx = i
  })
  const maxDev = deviation[maxDevIdx]

  const precision = Math.exp(-medianDev / threshold)
  const score = Math.round(100 * (0.45 * coverage + 0.4 * onRoute + 0.15 * precision))

  // Direction: compare forward vs backward movement along the planned route
  let fwd = 0
  let back = 0
  for (let i = 1; i < progress.length; i++) {
    const dp = progress[i] - progress[i - 1]
    if (Math.abs(dp) > 500 || deviation[i] > threshold) continue
    if (dp > 0) fwd += dp
    else back -= dp
  }
  const reversed = back > fwd * 2

  // Time
  const hasTime = actual.points.filter((p) => p.time != null).length >= actual.points.length * 0.8
  const timeAt = (i: number) => actual.points[i].time ?? null
  let time: TimeStats | null = null
  if (hasTime) {
    let movingMs = 0
    let offRouteMs = 0
    let maxSpeed = 0
    for (let i = 1; i < aXY.length; i++) {
      const t0 = timeAt(i - 1)
      const t1 = timeAt(i)
      if (t0 == null || t1 == null || t1 <= t0) continue
      const dt = t1 - t0
      const v = (aCum[i] - aCum[i - 1]) / (dt / 1000)
      if (v > 0.5) movingMs += dt
      if ((deviation[i] + deviation[i - 1]) / 2 > threshold) offRouteMs += dt
    }
    // Max speed over a ~5-point window to suppress GPS spikes
    for (let i = 5; i < aXY.length; i++) {
      const t0 = timeAt(i - 5)
      const t1 = timeAt(i)
      if (t0 == null || t1 == null || t1 <= t0) continue
      maxSpeed = Math.max(maxSpeed, (aCum[i] - aCum[i - 5]) / ((t1 - t0) / 1000))
    }
    const first = actual.points.find((p) => p.time != null)!.time!
    const last = [...actual.points].reverse().find((p) => p.time != null)!.time!
    time = {
      elapsedMs: last - first,
      movingMs,
      offRouteMs,
      avgMovingSpeed: movingMs > 0 ? aTotal / (movingMs / 1000) : 0,
      maxSpeed,
    }
  }

  // Excursions: contiguous stretches beyond the threshold
  const excursions: Excursion[] = []
  for (let i = 0; i < deviation.length; ) {
    if (deviation[i] <= threshold) {
      i++
      continue
    }
    let j = i
    let maxIdx = i
    while (j + 1 < deviation.length && deviation[j + 1] > threshold) {
      j++
      if (deviation[j] > deviation[maxIdx]) maxIdx = j
    }
    // Widen the window to where the track actually peeled away from / rejoined the line,
    // so a gradual shortcut or detour is measured as a whole
    let entry = Math.max(0, i - 1)
    let exit = Math.min(deviation.length - 1, j + 1)
    while (entry > 0 && deviation[entry] > threshold * 0.3 && aCum[i] - aCum[entry] < 500) entry--
    while (exit < deviation.length - 1 && deviation[exit] > threshold * 0.3 && aCum[exit] - aCum[j] < 500) exit++
    const length = aCum[exit] - aCum[entry]
    if (length >= 30) {
      const plannedGap = Math.abs(progress[exit] - progress[entry])
      const margin = Math.max(30, plannedGap * 0.1)
      const kind: Excursion['kind'] =
        length < plannedGap - margin ? 'shortcut' : length > plannedGap + margin ? 'detour' : 'parallel'
      const t0 = timeAt(entry)
      const t1 = timeAt(exit)
      excursions.push({
        startIdx: i,
        endIdx: j,
        maxIdx,
        length,
        maxDev: deviation[maxIdx],
        startKm: aCum[i] / 1000,
        kind,
        plannedGap,
        durationMs: t0 != null && t1 != null ? t1 - t0 : null,
      })
    }
    i = j + 1
  }

  // Per-km splits of the recorded track
  const splits: KmSplit[] = []
  for (let km = 0, i = 0; km * 1000 < aTotal; km++) {
    const end = Math.min((km + 1) * 1000, aTotal)
    const startI = i
    let on = 0
    let devSum = 0
    let n = 0
    while (i + 1 < aCum.length && aCum[i + 1] <= end) {
      const seg = aCum[i + 1] - aCum[i]
      if ((deviation[i] + deviation[i + 1]) / 2 <= threshold) on += seg
      devSum += deviation[i + 1]
      n++
      i++
    }
    const dist = aCum[i] - aCum[startI]
    if (dist < 50) break
    const t0 = timeAt(startI)
    const t1 = timeAt(i)
    splits.push({
      km: km + 1,
      distance: dist,
      durationMs: hasTime && t0 != null && t1 != null ? t1 - t0 : null,
      onRoutePct: dist > 0 ? on / dist : 0,
      meanDev: n ? devSum / n : 0,
    })
  }

  const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y)
  const pStart = reversed ? pXY[pXY.length - 1] : pXY[0]
  const pEnd = reversed ? pXY[0] : pXY[pXY.length - 1]

  return {
    threshold,
    planned: {
      name: planned.name,
      coords: planned.points.map((p) => [p.lat, p.lon]),
      distance: pTotal,
      elev: elevationChange(planned.points.map((p) => p.ele)),
    },
    actual: {
      name: actual.name,
      coords: actual.points.map((p) => [p.lat, p.lon]),
      cumDist: aCum,
      distance: aTotal,
      elev: elevationChange(actual.points.map((p) => p.ele)),
      ele: actual.points.map((p) => p.ele ?? null),
      deviation,
      plannedEleAtNearest,
    },
    score,
    grade: gradeFor(score),
    components: { coverage, onRoute, precision },
    stats: { meanDev, medianDev, p95Dev: percentile(sorted, 0.95), maxDev, maxDevIdx, hausdorff: Math.max(maxDev, plannedMaxDist) },
    excursions,
    skipped,
    splits,
    time,
    reversed,
    longestStreak,
    startOffset: dist(aXY[0], pStart),
    endOffset: dist(aXY[aXY.length - 1], pEnd),
  }
}

export function trackDistance(points: TrackPoint[]): number {
  let d = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dLat = (b.lat - a.lat) * RAD
    const dLon = (b.lon - a.lon) * RAD
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2
    d += 2 * R * Math.asin(Math.sqrt(h))
  }
  return d
}
