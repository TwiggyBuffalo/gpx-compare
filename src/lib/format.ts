export function fmtDist(m: number): string {
  if (!Number.isFinite(m)) return '–'
  if (Math.abs(m) < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(Math.abs(m) < 10000 ? 2 : 1)} km`
}

export function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

/** Pace in min/km from m/s */
export function fmtPace(speed: number): string {
  if (speed <= 0) return '–'
  const secPerKm = 1000 / speed
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')} /km`
}

export function fmtSpeed(speed: number): string {
  return `${(speed * 3.6).toFixed(1)} km/h`
}

export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`

/** Relatable size comparisons for a distance in metres */
export function relatable(m: number): string {
  const things: [number, string][] = [
    [0.5, 'a shoebox'],
    [1.8, 'a person lying down'],
    [4.5, 'a car'],
    [12, 'a bus'],
    [24, 'a tennis court'],
    [50, 'an Olympic pool'],
    [105, 'a football pitch'],
    [330, 'the Eiffel Tower lying on its side'],
  ]
  // Largest thing that still fits inside the distance
  const best = [...things].reverse().find((t) => t[0] <= m * 1.25) ?? things[0]
  const ratio = m / best[0]
  if (ratio > 0.8 && ratio < 1.25) return `about the length of ${best[1]}`
  return `roughly ${ratio < 2 ? ratio.toFixed(1) : Math.round(ratio)}× the length of ${best[1]}`
}
