import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Analysis } from '../lib/compare'
import { fmtDist } from '../lib/format'

interface Props {
  analysis: Analysis
  hoverIdx: number | null
  focus: [number, number][] | null
}

function Fit({ coords }: { coords: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (!coords.length) return
    // The container may not have its final size on first render
    const id = requestAnimationFrame(() => {
      map.invalidateSize()
      map.fitBounds(L.latLngBounds(coords), { padding: [24, 24] })
    })
    return () => cancelAnimationFrame(id)
  }, [map, coords])
  return null
}

export default function RouteMap({ analysis: a, hoverIdx, focus }: Props) {
  const all = useMemo(() => [...a.planned.coords, ...a.actual.coords], [a])
  const excursionLines = useMemo(
    () => a.excursions.map((e) => a.actual.coords.slice(Math.max(0, e.startIdx - 1), e.endIdx + 2)),
    [a],
  )
  const maxPt = a.actual.coords[a.stats.maxDevIdx]
  const start = a.actual.coords[0]
  const end = a.actual.coords[a.actual.coords.length - 1]

  return (
    <div className="map-wrap">
      <MapContainer className="map" center={start} zoom={13} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Fit coords={focus ?? all} />
        <Polyline positions={a.planned.coords} pathOptions={{ className: 'route-planned', weight: 7 }} />
        {a.skipped.map((s, i) => (
          <Polyline key={`s${i}`} positions={s.coords} pathOptions={{ className: 'route-skipped', weight: 7 }}>
            <Tooltip sticky>Skipped {fmtDist(s.length)} of the plan</Tooltip>
          </Polyline>
        ))}
        <Polyline positions={a.actual.coords} pathOptions={{ className: 'route-actual', weight: 3 }} />
        {excursionLines.map((c, i) => (
          <Polyline key={`e${i}`} positions={c} pathOptions={{ className: 'route-off', weight: 6 }}>
            <Tooltip sticky>
              {a.excursions[i].kind} · up to {fmtDist(a.excursions[i].maxDev)} off
            </Tooltip>
          </Polyline>
        ))}
        <CircleMarker center={start} radius={7} pathOptions={{ className: 'pin pin-start' }}>
          <Tooltip>Your start</Tooltip>
        </CircleMarker>
        <CircleMarker center={end} radius={7} pathOptions={{ className: 'pin pin-end' }}>
          <Tooltip>Your finish</Tooltip>
        </CircleMarker>
        {a.stats.maxDev > a.threshold && (
          <CircleMarker center={maxPt} radius={7} pathOptions={{ className: 'pin pin-max' }}>
            <Tooltip>Furthest from route: {fmtDist(a.stats.maxDev)}</Tooltip>
          </CircleMarker>
        )}
        {hoverIdx != null && (
          <CircleMarker center={a.actual.coords[hoverIdx]} radius={8} pathOptions={{ className: 'pin pin-hover' }} />
        )}
      </MapContainer>
      <div className="map-legend">
        <span><i className="lg lg-planned" /> Planned</span>
        <span><i className="lg lg-actual" /> Your track</span>
        <span><i className="lg lg-off" /> Off-route</span>
        {a.skipped.length > 0 && <span><i className="lg lg-skipped" /> Skipped</span>}
      </div>
    </div>
  )
}
