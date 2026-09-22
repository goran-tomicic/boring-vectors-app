import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './ColorPicker.css'

const POPOVER_MARGIN = 8

interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
  opacity: number
  onOpacityChange: (opacity: number) => void
}

interface Hsv {
  h: number
  s: number
  v: number
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const num = parseInt(match[1], 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

function hsvToRgb({ h, s, v }: Hsv): { r: number; g: number; b: number } {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let [r, g, b] = [0, 0, 0]
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

function ColorPicker({ value, onChange, opacity, onOpacityChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [hexDraft, setHexDraft] = useState(value)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const squareRef = useRef<HTMLDivElement>(null)
  const alphaTrackRef = useRef<HTMLDivElement>(null)

  const rgb = hexToRgb(value) ?? { r: 31, g: 32, b: 40 }
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
  const hueRgb = hsvToRgb({ h: hsv.h, s: 1, v: 1 })
  const opacityPct = Math.round(opacity * 100)

  const clampToViewport = (left: number, top: number, width: number, height: number) => ({
    left: Math.max(POPOVER_MARGIN, Math.min(left, window.innerWidth - width - POPOVER_MARGIN)),
    top: Math.max(POPOVER_MARGIN, Math.min(top, window.innerHeight - height - POPOVER_MARGIN)),
  })

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const pill = pillRef.current
    const popover = popoverRef.current
    if (!pill || !popover) return
    const pillRect = pill.getBoundingClientRect()
    const popoverRect = popover.getBoundingClientRect()
    setPos(
      clampToViewport(
        pillRect.left,
        pillRect.bottom + 6,
        popoverRect.width,
        popoverRect.height,
      ),
    )
    // clampToViewport is stable across renders (reads window size at call time, not captured) — omitting it avoids re-running this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleHeaderDragStart = (event: React.PointerEvent) => {
    const popover = popoverRef.current
    if (!popover || !pos) return
    event.preventDefault()
    const popoverRect = popover.getBoundingClientRect()
    const offset = { x: event.clientX - popoverRect.left, y: event.clientY - popoverRect.top }
    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      setPos(
        clampToViewport(
          moveEvent.clientX - offset.x,
          moveEvent.clientY - offset.y,
          popoverRect.width,
          popoverRect.height,
        ),
      )
    }
    const handleUp = () => {
      document.body.style.userSelect = previousUserSelect
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
    }
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
  }

  const commitHsv = (next: Hsv) => {
    const { r, g, b } = hsvToRgb(next)
    const hex = rgbToHex(r, g, b)
    setHexDraft(hex)
    onChange(hex)
  }

  const dragSquare = (event: React.PointerEvent) => {
    const square = squareRef.current
    if (!square) return
    const update = (clientX: number, clientY: number) => {
      const rect = square.getBoundingClientRect()
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const v = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
      commitHsv({ h: hsv.h, s, v })
    }
    update(event.clientX, event.clientY)
    const handleMove = (moveEvent: PointerEvent) => update(moveEvent.clientX, moveEvent.clientY)
    const handleUp = () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
    }
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
  }

  const dragHue = (event: React.PointerEvent) => {
    const track = event.currentTarget as HTMLDivElement
    const update = (clientX: number) => {
      const rect = track.getBoundingClientRect()
      const h = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 360
      commitHsv({ h, s: hsv.s, v: hsv.v })
    }
    update(event.clientX)
    const handleMove = (moveEvent: PointerEvent) => update(moveEvent.clientX)
    const handleUp = () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
    }
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
  }

  const submitHex = (raw: string) => {
    setHexDraft(raw)
    const normalized = raw.startsWith('#') ? raw : `#${raw}`
    if (hexToRgb(normalized)) onChange(normalized)
  }

  const submitOpacityPct = (raw: string) => {
    const pct = Number(raw)
    if (Number.isNaN(pct)) return
    onOpacityChange(Math.min(100, Math.max(0, pct)) / 100)
  }

  const dragAlpha = (event: React.PointerEvent) => {
    const track = alphaTrackRef.current
    if (!track) return
    const update = (clientX: number) => {
      const rect = track.getBoundingClientRect()
      onOpacityChange(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)))
    }
    update(event.clientX)
    const handleMove = (moveEvent: PointerEvent) => update(moveEvent.clientX)
    const handleUp = () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
    }
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
  }

  return (
    <div className="ColorPicker" ref={wrapRef}>
      <button
        ref={pillRef}
        type="button"
        className="ColorPicker-pill"
        onClick={() => {
          setHexDraft(value)
          setOpen((o) => !o)
        }}
      >
        <span
          className="ColorPicker-swatch"
          style={{
            background: `linear-gradient(rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity}), rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})), var(--bv-checkerboard)`,
          }}
        />
        <span className="ColorPicker-hex">{value.toUpperCase()}</span>
        <span className="ColorPicker-opacityLabel">{opacityPct}%</span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="ColorPicker-popover"
          style={{
            left: pos ? pos.left : 0,
            top: pos ? pos.top : 0,
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          <div className="ColorPicker-header" onPointerDown={handleHeaderDragStart}>
            <span className="ColorPicker-headerTitle">Custom</span>
            <button
              type="button"
              className="ColorPicker-close"
              onClick={() => setOpen(false)}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div
            ref={squareRef}
            className="ColorPicker-square"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, rgb(${hueRgb.r}, ${hueRgb.g}, ${hueRgb.b}))`,
            }}
            onPointerDown={dragSquare}
          >
            <div
              className="ColorPicker-squareThumb"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
            />
          </div>

          <div className="ColorPicker-hueTrack" onPointerDown={dragHue}>
            <div className="ColorPicker-hueThumb" style={{ left: `${(hsv.h / 360) * 100}%` }} />
          </div>

          <div
            ref={alphaTrackRef}
            className="ColorPicker-alphaTrack"
            style={{
              background: `linear-gradient(to right, transparent, rgb(${rgb.r}, ${rgb.g}, ${rgb.b})), var(--bv-checkerboard)`,
            }}
            onPointerDown={dragAlpha}
          >
            <div className="ColorPicker-alphaThumb" style={{ left: `${opacity * 100}%` }} />
          </div>

          <div className="ColorPicker-fieldRow">
            <input
              type="text"
              className="ColorPicker-hexInput"
              value={hexDraft}
              onChange={(e) => submitHex(e.target.value)}
            />
            <div className="ColorPicker-opacityField">
              <input
                type="number"
                min={0}
                max={100}
                value={opacityPct}
                onChange={(e) => submitOpacityPct(e.target.value)}
              />
              <span>%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ColorPicker
