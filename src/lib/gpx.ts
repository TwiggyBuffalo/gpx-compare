export interface TrackPoint {
  lat: number
  lon: number
  ele?: number
  time?: number // epoch ms
}

export interface ParsedGpx {
  name: string
  points: TrackPoint[]
}

/** Parse a GPX string. Prefers track points, then route points, then waypoints. */
export function parseGpx(xml: string, fallbackName = 'Untitled'): ParsedGpx {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('This file is not valid XML/GPX.')
  }

  let nodes = Array.from(doc.getElementsByTagNameNS('*', 'trkpt'))
  if (!nodes.length) nodes = Array.from(doc.getElementsByTagNameNS('*', 'rtept'))
  if (!nodes.length) nodes = Array.from(doc.getElementsByTagNameNS('*', 'wpt'))
  if (nodes.length < 2) throw new Error('No track or route points found in this GPX file.')

  const points: TrackPoint[] = []
  for (const n of nodes) {
    const lat = parseFloat(n.getAttribute('lat') ?? '')
    const lon = parseFloat(n.getAttribute('lon') ?? '')
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const p: TrackPoint = { lat, lon }
    const ele = n.getElementsByTagNameNS('*', 'ele')[0]?.textContent
    if (ele != null && ele.trim() !== '' && Number.isFinite(+ele)) p.ele = +ele
    const time = n.getElementsByTagNameNS('*', 'time')[0]?.textContent
    if (time) {
      const t = Date.parse(time)
      if (Number.isFinite(t)) p.time = t
    }
    // Drop exact duplicates of the previous point (common at pauses)
    const prev = points[points.length - 1]
    if (prev && prev.lat === p.lat && prev.lon === p.lon) continue
    points.push(p)
  }

  const nameEl =
    doc.querySelector('metadata > name') ?? doc.querySelector('trk > name') ?? doc.querySelector('rte > name')
  return { name: nameEl?.textContent?.trim() || fallbackName, points }
}
