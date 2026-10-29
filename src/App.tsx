import { useMemo, useState } from 'react'
import DropZone from './components/DropZone'
import LineChart, { type Series } from './components/LineChart'
import RouteMap from './components/RouteMap'
import { analyze, trackDistance, type Analysis } from './lib/compare'
import { fmtDist, fmtDur, fmtPace, fmtSpeed, pct } from './lib/format'
import { parseGpx, type ParsedGpx } from './lib/gpx'
import { buildInsights } from './lib/insights'

type Slot = 'planned' | 'actual'

async function readGpx(file: File): Promise<ParsedGpx> {
  return parseGpx(await file.text(), file.name.replace(/\.gpx$/i, ''))
}

export default function App() {
  const [files, setFiles] = useState<Record<Slot, ParsedGpx | null>>({ planned: null, actual: null })
  const [errors, setErrors] = useState<Record<Slot, string | null>>({ planned: null, actual: null })
  const [threshold, setThreshold] = useState(25)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [focus, setFocus] = useState<[number, number][] | null>(null)

  async function load(slot: Slot, f: File) {
    try {
      const g = await readGpx(f)
      setFiles((s) => ({ ...s, [slot]: g }))
      setErrors((s) => ({ ...s, [slot]: null }))
      setFocus(null)
    } catch (e) {
      setErrors((s) => ({ ...s, [slot]: (e as Error).message }))
    }
  }

  async function loadSamples() {
    const [p, a] = await Promise.all(
      ['planned', 'actual'].map((n) => fetch(`${import.meta.env.BASE_URL}samples/${n}.gpx`).then((r) => r.text())),
    )
    setFiles({ planned: parseGpx(p, 'Sample route'), actual: parseGpx(a, 'Sample run') })
    setErrors({ planned: null, actual: null })
    setFocus(null)
  }

  const analysis = useMemo(() => {
    if (!files.planned || !files.actual) return null
    return analyze(files.planned, files.actual, threshold)
  }, [files, threshold])

  return (
    <div className="app">
      <header>
        <h1>GPX Compare</h1>
        <p className="muted">Compare the route you planned with the track you actually recorded.</p>
      </header>

      <section className="uploads">
        <DropZone
          label="1 · Planned route"
          hint="Drop the route GPX here, or click to browse"
          file={files.planned}
          distance={files.planned ? trackDistance(files.planned.points) : null}
          error={errors.planned}
          onFile={(f) => load('planned', f)}
          onClear={() => setFiles((s) => ({ ...s, planned: null }))}
        />
        <DropZone
          label="2 · Your recorded track"
          hint="Drop your activity GPX here, or click to browse"
          file={files.actual}
          distance={files.actual ? trackDistance(files.actual.points) : null}
          error={errors.actual}
          onFile={(f) => load('actual', f)}
          onClear={() => setFiles((s) => ({ ...s, actual: null }))}
        />
      </section>

      {!analysis && (
        <div className="empty">
          <p className="muted">Upload both files to see your accuracy rating.</p>
          <button className="btn" onClick={loadSamples}>
            Try with sample files
          </button>
        </div>
      )}

      {analysis && (
        <Results
          a={analysis}
          threshold={threshold}
          setThreshold={setThreshold}
          hoverIdx={hoverIdx}
          setHoverIdx={setHoverIdx}
          focus={focus}
          setFocus={setFocus}
        />
      )}
    </div>
  )
}

interface ResultsProps {
  a: Analysis
  threshold: number
  setThreshold: (n: number) => void
  hoverIdx: number | null
  setHoverIdx: (n: number | null) => void
  focus: [number, number][] | null
  setFocus: (c: [number, number][] | null) => void
}

function Results({ a, threshold, setThreshold, hoverIdx, setHoverIdx, focus, setFocus }: ResultsProps) {
  const insights = useMemo(() => buildInsights(a), [a])
  const km = useMemo(() => a.actual.cumDist.map((d) => d / 1000), [a])
  const devSeries: Series[] = useMemo(
    () => [{ name: 'Distance from route', values: a.actual.deviation, color: 'var(--series-2)', fill: true }],
    [a],
  )
  const bands = useMemo(
    () => a.excursions.map((e) => [km[e.startIdx], km[e.endIdx]] as [number, number]),
    [a, km],
  )
  const hasEle = a.actual.ele.some((e) => e != null)
  const hasPlannedEle = a.actual.plannedEleAtNearest.some((e) => e != null)
  const eleSeries: Series[] = useMemo(() => {
    const s: Series[] = []
    if (hasPlannedEle) s.push({ name: 'Planned', values: a.actual.plannedEleAtNearest, color: 'var(--series-1)' })
    if (hasEle) s.push({ name: 'Recorded', values: a.actual.ele, color: 'var(--series-2)' })
    return s
  }, [a, hasEle, hasPlannedEle])

  const diff = a.actual.distance - a.planned.distance
  const ring = 2 * Math.PI * 52

  return (
    <>
      <section className="hero card">
        <div className="score">
          <svg viewBox="0 0 120 120" width="140" height="140">
            <circle cx="60" cy="60" r="52" className="ring-track" />
            <circle
              cx="60"
              cy="60"
              r="52"
              className="ring-value"
              strokeDasharray={`${(a.score / 100) * ring} ${ring}`}
              transform="rotate(-90 60 60)"
            />
            <text x="60" y="58" textAnchor="middle" className="score-num">
              {a.score}
            </text>
            <text x="60" y="80" textAnchor="middle" className="score-grade">
              Grade {a.grade}
            </text>
          </svg>
        </div>
        <div className="hero-body">
          <h2>Accuracy rating</h2>
          <Meter label="Route coverage" hint="Share of the planned route you passed within the corridor" value={a.components.coverage} weight="45%" />
          <Meter label="Stayed on route" hint="Share of your distance spent inside the corridor" value={a.components.onRoute} weight="40%" />
          <Meter label="Line precision" hint="How tightly you hugged the line (based on median deviation)" value={a.components.precision} weight="15%" />
          <label className="threshold">
            <span>
              Corridor width: <strong>±{threshold} m</strong>
            </span>
            <input type="range" min={5} max={100} step={5} value={threshold} onChange={(e) => setThreshold(+e.target.value)} />
          </label>
        </div>
      </section>

      <section className="tiles">
        <Tile label="Planned" value={fmtDist(a.planned.distance)} />
        <Tile label="Recorded" value={fmtDist(a.actual.distance)} sub={`${diff >= 0 ? '+' : '−'}${fmtDist(Math.abs(diff))}`} />
        <Tile label="Median deviation" value={`${a.stats.medianDev.toFixed(1)} m`} sub={`mean ${a.stats.meanDev.toFixed(1)} m`} />
        <Tile label="Max deviation" value={fmtDist(a.stats.maxDev)} sub={`at km ${km[a.stats.maxDevIdx].toFixed(1)}`} />
        <Tile label="Off-route episodes" value={String(a.excursions.length)} sub={a.skipped.length ? `${a.skipped.length} skipped section(s)` : 'nothing skipped'} />
        {a.time ? (
          <Tile label="Moving time" value={fmtDur(a.time.movingMs)} sub={`${fmtPace(a.time.avgMovingSpeed)} · ${fmtSpeed(a.time.avgMovingSpeed)}`} />
        ) : (
          <Tile label="Elevation gain" value={a.actual.elev ? `${Math.round(a.actual.elev.gain)} m` : '–'} sub={a.planned.elev ? `planned ${Math.round(a.planned.elev.gain)} m` : undefined} />
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Map</h3>
          {focus && (
            <button className="link" onClick={() => setFocus(null)}>
              Show whole route
            </button>
          )}
        </div>
        <RouteMap analysis={a} hoverIdx={hoverIdx} focus={focus} />
      </section>

      <section className="card">
        <h3>Distance from planned route</h3>
        <p className="muted small">Hover to locate a point on the map. Shaded areas are off-route episodes.</p>
        <LineChart
          x={km}
          series={devSeries}
          unit="m"
          refLine={{ value: threshold, label: `±${threshold} m corridor` }}
          bands={bands}
          hoverIdx={hoverIdx}
          onHover={setHoverIdx}
        />
      </section>

      {eleSeries.length > 0 && (
        <section className="card">
          <h3>Elevation</h3>
          <p className="muted small">
            Recorded altitude vs. the planned route's altitude at the nearest point.
            {a.planned.elev && a.actual.elev && ` Climb: ${Math.round(a.actual.elev.gain)} m recorded vs ${Math.round(a.planned.elev.gain)} m planned.`}
          </p>
          <LineChart x={km} series={eleSeries} unit="m" hoverIdx={hoverIdx} onHover={setHoverIdx} />
        </section>
      )}

      <section>
        <h3>Insights</h3>
        <div className="insights">
          {insights.map((i) => (
            <div key={i.title} className="card insight">
              <div className="insight-icon" aria-hidden>
                {i.icon}
              </div>
              <div>
                <div className="insight-title">{i.title}</div>
                <div className="small">{i.text}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {a.excursions.length > 0 && (
        <section className="card">
          <h3>Off-route episodes</h3>
          <p className="muted small">Click a row to zoom the map to it.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>At km</th>
                  <th>Type</th>
                  <th className="num">Length</th>
                  <th className="num">Planned gap</th>
                  <th className="num">Max off</th>
                  {a.time && <th className="num">Duration</th>}
                </tr>
              </thead>
              <tbody>
                {a.excursions.map((e, i) => (
                  <tr
                    key={i}
                    className="clickable"
                    onClick={() => setFocus(a.actual.coords.slice(Math.max(0, e.startIdx - 5), e.endIdx + 6))}
                  >
                    <td>{e.startKm.toFixed(2)}</td>
                    <td>
                      <span className={`tag tag-${e.kind}`}>{e.kind}</span>
                    </td>
                    <td className="num">{fmtDist(e.length)}</td>
                    <td className="num">{fmtDist(e.plannedGap)}</td>
                    <td className="num">{fmtDist(e.maxDev)}</td>
                    {a.time && <td className="num">{e.durationMs ? fmtDur(e.durationMs) : '–'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h3>Per-km breakdown</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Km</th>
                <th>On route</th>
                <th className="num">Mean deviation</th>
                {a.time && <th className="num">Time</th>}
                {a.time && <th className="num">Pace</th>}
              </tr>
            </thead>
            <tbody>
              {a.splits.map((s) => (
                <tr key={s.km}>
                  <td>{s.km}</td>
                  <td>
                    <div className="mini-bar">
                      <div style={{ width: pct(s.onRoutePct) }} />
                      <span>{pct(s.onRoutePct)}</span>
                    </div>
                  </td>
                  <td className="num">{s.meanDev.toFixed(1)} m</td>
                  {a.time && <td className="num">{s.durationMs ? fmtDur(s.durationMs) : '–'}</td>}
                  {a.time && (
                    <td className="num">{s.durationMs ? fmtPace(s.distance / (s.durationMs / 1000)) : '–'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function Meter({ label, hint, value, weight }: { label: string; hint: string; value: number; weight: string }) {
  return (
    <div className="meter" title={hint}>
      <div className="meter-head">
        <span>
          {label} <span className="muted small">({weight})</span>
        </span>
        <strong>{pct(value, 1)}</strong>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: pct(value, 1) }} />
      </div>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card tile">
      <div className="muted small">{label}</div>
      <div className="tile-value">{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  )
}
