import type { Analysis } from './compare'
import { fmtDist, fmtDur, fmtPace, pct, relatable } from './format'

export interface Insight {
  icon: string
  title: string
  text: string
}

export function buildInsights(a: Analysis): Insight[] {
  const out: Insight[] = []
  const diff = a.actual.distance - a.planned.distance
  const diffPct = diff / a.planned.distance

  out.push({
    icon: '📏',
    title: 'Distance',
    text:
      Math.abs(diffPct) < 0.01
        ? `Spot on: you covered ${fmtDist(a.actual.distance)} against a planned ${fmtDist(a.planned.distance)}.`
        : `You covered ${fmtDist(a.actual.distance)} against a planned ${fmtDist(a.planned.distance)}: ${fmtDist(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} (${diff > 0 ? '+' : '−'}${pct(Math.abs(diffPct), 1)}).`,
  })

  if (a.reversed)
    out.push({ icon: '🔄', title: 'Reverse direction', text: 'You followed the planned route backwards, finish to start.' })

  out.push({
    icon: '🎯',
    title: 'Typical precision',
    text: `Half of your GPS points were within ${a.stats.medianDev.toFixed(1)} m of the planned line, ${relatable(Math.max(a.stats.medianDev, 0.5))}. 95% were within ${a.stats.p95Dev.toFixed(0)} m.`,
  })

  if (a.excursions.length) {
    const biggest = [...a.excursions].sort((x, y) => y.maxDev - x.maxDev)[0]
    out.push({
      icon: '🧭',
      title: 'Furthest off-route',
      text: `At km ${biggest.startKm.toFixed(1)} you strayed up to ${fmtDist(biggest.maxDev)} from the route (${relatable(biggest.maxDev)}) over ${fmtDist(biggest.length)}${biggest.durationMs ? `, taking ${fmtDur(biggest.durationMs)}` : ''}.`,
    })
  } else {
    out.push({ icon: '🧭', title: 'Never lost', text: `You never left the ${a.threshold} m corridor around the route.` })
  }

  const shortcuts = a.excursions.filter((e) => e.kind === 'shortcut')
  if (shortcuts.length) {
    const saved = shortcuts.reduce((s, e) => s + (e.plannedGap - e.length), 0)
    out.push({
      icon: '✂️',
      title: `${shortcuts.length} shortcut${shortcuts.length > 1 ? 's' : ''}`,
      text: `Cutting corners saved you about ${fmtDist(saved)} compared with sticking to the plan.`,
    })
  }

  const detours = a.excursions.filter((e) => e.kind === 'detour')
  if (detours.length) {
    const extra = detours.reduce((s, e) => s + (e.length - e.plannedGap), 0)
    out.push({
      icon: '🌀',
      title: `${detours.length} detour${detours.length > 1 ? 's' : ''}`,
      text: `Detours added roughly ${fmtDist(extra)} of extra distance.`,
    })
  }

  if (a.skipped.length) {
    const total = a.skipped.reduce((s, k) => s + k.length, 0)
    out.push({
      icon: '⏭️',
      title: 'Skipped sections',
      text: `${fmtDist(total)} of the planned route (${a.skipped.length} section${a.skipped.length > 1 ? 's' : ''}) never came within ${a.threshold} m of your track.`,
    })
  }

  out.push({
    icon: '🏁',
    title: 'Longest clean streak',
    text: `Your longest uninterrupted on-route stretch was ${fmtDist(a.longestStreak)} (${pct(a.longestStreak / a.actual.distance)} of your track).`,
  })

  if (a.startOffset > a.threshold || a.endOffset > a.threshold)
    out.push({
      icon: '📍',
      title: 'Start & finish',
      text: `You started ${fmtDist(a.startOffset)} from the planned start and finished ${fmtDist(a.endOffset)} from the planned finish.`,
    })

  if (a.time) {
    out.push({
      icon: '⏱️',
      title: 'Time',
      text: `Moving for ${fmtDur(a.time.movingMs)} of ${fmtDur(a.time.elapsedMs)} elapsed at an average ${fmtPace(a.time.avgMovingSpeed)}.${a.time.offRouteMs > 1000 ? ` ${fmtDur(a.time.offRouteMs)} was spent off-route.` : ''}`,
    })
    const timed = a.splits.filter((s) => s.durationMs && s.distance > 900)
    if (timed.length >= 3) {
      const speed = (s: (typeof timed)[number]) => s.distance / (s.durationMs! / 1000)
      const fast = timed.reduce((b, s) => (speed(s) > speed(b) ? s : b))
      const slow = timed.reduce((b, s) => (speed(s) < speed(b) ? s : b))
      out.push({
        icon: '⚡',
        title: 'Fastest & slowest km',
        text: `Km ${fast.km} was your quickest at ${fmtPace(speed(fast))}; km ${slow.km} was the slowest at ${fmtPace(speed(slow))}.`,
      })
    }
  }

  if (a.planned.elev && a.actual.elev) {
    const d = a.actual.elev.gain - a.planned.elev.gain
    out.push({
      icon: '⛰️',
      title: 'Climbing',
      text: `You recorded ${Math.round(a.actual.elev.gain)} m of climbing vs ${Math.round(a.planned.elev.gain)} m planned (${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d))} m).`,
    })
  }

  const ranked = a.splits.filter((s) => s.distance > 500)
  if (ranked.length >= 2) {
    const worst = ranked.reduce((b, s) => (s.onRoutePct < b.onRoutePct ? s : b))
    if (worst.onRoutePct < 0.99)
      out.push({
        icon: '📉',
        title: 'Least accurate km',
        text: `Km ${worst.km} was your least accurate, with only ${pct(worst.onRoutePct)} on-route.`,
      })
  }

  out.push({
    icon: '↔️',
    title: 'Max separation',
    text: `At their furthest apart, the two lines are ${fmtDist(a.stats.hausdorff)} from each other (Hausdorff distance).`,
  })

  return out
}
