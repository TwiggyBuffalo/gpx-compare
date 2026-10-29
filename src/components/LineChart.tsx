import { useEffect, useMemo, useRef, useState } from 'react'

export interface Series {
  name: string
  values: (number | null)[]
  color: string
  fill?: boolean
}

interface Props {
  x: number[] // km
  series: Series[]
  unit: string
  height?: number
  refLine?: { value: number; label: string }
  bands?: [number, number][] // x ranges (km) to shade
  hoverIdx: number | null
  onHover: (idx: number | null) => void
}

const M = { top: 12, right: 16, bottom: 28, left: 44 }

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1
  const step0 = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(step0)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0)!
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10))
  return out
}

export default function LineChart({ x, series, unit, height = 200, refLine, bands, hoverIdx, onHover }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const iw = Math.max(50, width - M.left - M.right)
  const ih = height - M.top - M.bottom
  const xMax = x[x.length - 1] || 1

  const { yMin, yMax, yTicks } = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const s of series)
      for (const v of s.values)
        if (v != null) {
          lo = Math.min(lo, v)
          hi = Math.max(hi, v)
        }
    if (refLine) hi = Math.max(hi, refLine.value * 1.15)
    if (series.some((s) => s.fill)) lo = Math.min(lo, 0)
    const pad = (hi - lo) * 0.05 || 1
    const ticks = niceTicks(lo, hi + pad)
    return { yMin: Math.min(lo, ticks[0]), yMax: Math.max(hi + pad, ticks[ticks.length - 1]), yTicks: ticks }
  }, [series, refLine])

  const sx = (v: number) => M.left + (v / xMax) * iw
  const sy = (v: number) => M.top + ih - ((v - yMin) / (yMax - yMin)) * ih

  // Downsample to roughly one point per pixel for rendering
  const paths = useMemo(() => {
    const stride = Math.max(1, Math.floor(x.length / iw))
    return series.map((s) => {
      let d = ''
      let pen = false
      for (let i = 0; i < x.length; i += stride) {
        const v = s.values[i]
        if (v == null) {
          pen = false
          continue
        }
        d += `${pen ? 'L' : 'M'}${sx(x[i]).toFixed(1)},${sy(v).toFixed(1)}`
        pen = true
      }
      const area = s.fill && d ? `${d}L${sx(x[x.length - 1])},${sy(yMin)}L${sx(0)},${sy(yMin)}Z` : null
      return { d, area }
    })
  }, [series, x, iw, yMin, yMax])

  const xTicks = niceTicks(0, xMax, Math.max(2, Math.floor(iw / 80)))

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const km = ((e.clientX - rect.left) / rect.width) * xMax
    let lo = 0
    let hi = x.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (x[mid] < km) lo = mid + 1
      else hi = mid
    }
    onHover(lo)
  }

  const hx = hoverIdx != null ? sx(x[hoverIdx]) : null
  const tooltipLeft = hx != null && hx > width - 180

  return (
    <div className="chart" ref={wrap}>
      <svg width={width} height={height} role="img">
        {bands?.map(([a, b], i) => (
          <rect key={i} className="chart-band" x={sx(a)} y={M.top} width={Math.max(1, sx(b) - sx(a))} height={ih} />
        ))}
        {yTicks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={M.left} x2={M.left + iw} y1={sy(t)} y2={sy(t)} />
            <text className="chart-tick" x={M.left - 6} y={sy(t)} dy="0.32em" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} className="chart-tick" x={sx(t)} y={height - 8} textAnchor="middle">
            {t} km
          </text>
        ))}
        <line className="chart-axis" x1={M.left} x2={M.left + iw} y1={M.top + ih} y2={M.top + ih} />
        {refLine && (
          <g>
            <line className="chart-ref" x1={M.left} x2={M.left + iw} y1={sy(refLine.value)} y2={sy(refLine.value)} />
            <text className="chart-tick" x={M.left + iw - 4} y={sy(refLine.value) - 5} textAnchor="end">
              {refLine.label}
            </text>
          </g>
        )}
        {paths.map((p, i) => (
          <g key={series[i].name}>
            {p.area && <path d={p.area} fill={series[i].color} opacity={0.15} />}
            <path d={p.d} fill="none" stroke={series[i].color} strokeWidth={2} strokeLinejoin="round" />
          </g>
        ))}
        {hx != null && hoverIdx != null && (
          <g>
            <line className="chart-cross" x1={hx} x2={hx} y1={M.top} y2={M.top + ih} />
            {series.map((s) => {
              const v = s.values[hoverIdx]
              return v == null ? null : (
                <circle key={s.name} cx={hx} cy={sy(v)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              )
            })}
          </g>
        )}
        <rect
          x={M.left}
          y={M.top}
          width={iw}
          height={ih}
          fill="transparent"
          onPointerMove={handleMove}
          onPointerLeave={() => onHover(null)}
        />
      </svg>
      {hx != null && hoverIdx != null && (
        <div className="tooltip" style={{ left: tooltipLeft ? hx - 12 : hx + 12, top: M.top, transform: tooltipLeft ? 'translateX(-100%)' : undefined }}>
          <div className="tooltip-title">{x[hoverIdx].toFixed(2)} km</div>
          {series.map((s) => {
            const v = s.values[hoverIdx]
            return (
              <div key={s.name} className="tooltip-row">
                <span className="swatch" style={{ background: s.color }} />
                <span className="muted">{s.name}</span>
                <strong>{v == null ? '–' : `${v.toFixed(1)} ${unit}`}</strong>
              </div>
            )
          })}
        </div>
      )}
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.name}>
              <span className="swatch" style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
