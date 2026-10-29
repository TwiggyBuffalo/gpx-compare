import { useRef, useState } from 'react'
import type { ParsedGpx } from '../lib/gpx'
import { fmtDist } from '../lib/format'

interface Props {
  label: string
  hint: string
  file: ParsedGpx | null
  distance: number | null
  error: string | null
  onFile: (f: File) => void
  onClear: () => void
}

export default function DropZone({ label, hint, file, distance, error, onFile, onClear }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  return (
    <div
      className={`drop ${over ? 'over' : ''} ${file ? 'filled' : ''}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
    >
      <input
        ref={input}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
      <div className="drop-label">{label}</div>
      {file ? (
        <>
          <div className="drop-name">{file.name}</div>
          <div className="muted small">
            {file.points.length.toLocaleString()} points{distance != null ? ` · ${fmtDist(distance)}` : ''}
          </div>
          <button
            className="link"
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
          >
            Replace
          </button>
        </>
      ) : (
        <div className="muted small">{hint}</div>
      )}
      {error && <div className="error small">{error}</div>}
    </div>
  )
}
