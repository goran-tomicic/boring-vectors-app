import { useRef, useState } from 'react'
import { useEditorStore, type SelectedPathProps } from '../store/editorStore'
import { findPropertyTrack, hexToRgb, rgbToHex, type AnimatableProperty, type Easing } from '../animation'
import './Timeline.css'

function formatMs(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`
}

interface PropertyDef {
  property: AnimatableProperty
  label: string
  min: number
  max: number
  step: number
  getLive: (props: SelectedPathProps) => number
}

// Opacity + position + size for now (docs/ROADMAP.md step 3.4) — rotation/ratio-scale
// still to come, deferred pending a persisted "rest geometry" snapshot (see animation.ts).
const PROPERTY_DEFS: PropertyDef[] = [
  { property: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.05, getLive: (p) => p.opacity },
  { property: 'x', label: 'X', min: -100000, max: 100000, step: 1, getLive: (p) => p.x },
  { property: 'y', label: 'Y', min: -100000, max: 100000, step: 1, getLive: (p) => p.y },
  { property: 'width', label: 'Width', min: 1, max: 100000, step: 1, getLive: (p) => p.width },
  { property: 'height', label: 'Height', min: 1, max: 100000, step: 1, getLive: (p) => p.height },
]

type ColorPrefix = 'fillColor' | 'strokeColor'

interface ColorRowDef {
  prefix: ColorPrefix
  label: string
  getLiveHex: (props: SelectedPathProps) => string | null
}

// Each color is three synced numeric channel tracks (see animation.ts), not a dedicated
// data shape — colorChannels() below always addresses all three together.
const COLOR_ROW_DEFS: ColorRowDef[] = [
  { prefix: 'fillColor', label: 'Fill Color', getLiveHex: (p) => p.fillColor },
  { prefix: 'strokeColor', label: 'Stroke Color', getLiveHex: (p) => p.strokeColor },
]

function colorChannels(prefix: ColorPrefix): AnimatableProperty[] {
  return [`${prefix}R`, `${prefix}G`, `${prefix}B`] as AnimatableProperty[]
}

const EASINGS: Easing[] = ['linear', 'easeIn', 'easeOut', 'easeInOut']

const MIN_TIMELINE_HEIGHT = 90
const MAX_TIMELINE_HEIGHT = 640
// Tall enough to show all 7 rows (5 numeric + fill/stroke color) without scrolling when a
// path is selected — a short default meant scrolling was needed to reach the lower rows,
// which also made automated keyframe-adding flaky (clicking a below-the-fold button
// auto-scrolls the panel, shifting every element's position mid-interaction).
const DEFAULT_TIMELINE_HEIGHT = 480

function Timeline() {
  const setAppMode = useEditorStore((s) => s.setAppMode)
  const animation = useEditorStore((s) => s.animation)
  const playheadMs = useEditorStore((s) => s.playheadMs)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const setPlayhead = useEditorStore((s) => s.setPlayhead)
  const setAnimationDuration = useEditorStore((s) => s.setAnimationDuration)
  const play = useEditorStore((s) => s.play)
  const pause = useEditorStore((s) => s.pause)
  const setKeyframe = useEditorStore((s) => s.setKeyframe)
  const removeKeyframe = useEditorStore((s) => s.removeKeyframe)
  const moveKeyframe = useEditorStore((s) => s.moveKeyframe)
  const selectedPathIds = useEditorStore((s) => s.selectedPathIds)
  const selectedPathProps = useEditorStore((s) => s.selectedPathProps)

  const draggingKeyframe = useRef<{ property: AnimatableProperty; time: number } | null>(null)

  const [height, setHeight] = useState(DEFAULT_TIMELINE_HEIGHT)
  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = height
    const handleMove = (moveEvent: PointerEvent) => {
      // Dragging the top-edge handle up should grow the panel (it's docked to the bottom).
      const next = startHeight + (startY - moveEvent.clientY)
      setHeight(Math.min(MAX_TIMELINE_HEIGHT, Math.max(MIN_TIMELINE_HEIGHT, next)))
    }
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  const selectedPathId = selectedPathIds.length === 1 ? selectedPathIds[0] : null

  // Per-property values to write into the next keyframe — default to the path's live
  // values but are user-editable, since capturing "whatever it happens to be right now"
  // isn't enough to build a fade or a move (there's no other UI to change these outside
  // keyframes). Reset during render (not an effect) when the selection changes, per
  // React's guidance for adjusting state from a prop change without an extra render.
  const [valueOverrides, setValueOverrides] = useState<Partial<Record<AnimatableProperty, number>>>({})
  const [colorOverrides, setColorOverrides] = useState<Partial<Record<ColorPrefix, string>>>({})
  const [lastSelectedPathId, setLastSelectedPathId] = useState(selectedPathId)
  if (selectedPathId !== lastSelectedPathId) {
    setLastSelectedPathId(selectedPathId)
    setValueOverrides({})
    setColorOverrides({})
  }
  const [easing, setEasing] = useState<Easing>('linear')

  const timeFromX = (clientX: number, rect: DOMRect) => {
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    return ratio * animation.durationMs
  }

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    setPlayhead(timeFromX(e.clientX, e.currentTarget.getBoundingClientRect()))
  }

  const handleKeyframeMouseDown =
    (property: AnimatableProperty, time: number) => (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation()
      draggingKeyframe.current = { property, time }
      // Rows all share the same width/offset, so the clicked keyframe's own track row
      // is a stable reference rect for the whole drag, even as the mouse leaves it.
      const rect = e.currentTarget.parentElement!.getBoundingClientRect()

      const handleMove = (moveEvent: MouseEvent) => {
        if (!draggingKeyframe.current || !selectedPathId) return
        const newTime = timeFromX(moveEvent.clientX, rect)
        moveKeyframe(selectedPathId, draggingKeyframe.current.property, draggingKeyframe.current.time, newTime)
        draggingKeyframe.current = { property: draggingKeyframe.current.property, time: newTime }
      }
      const handleUp = () => {
        draggingKeyframe.current = null
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    }

  const handleAddKeyframe = (def: PropertyDef) => {
    if (!selectedPathId) return
    const value = valueOverrides[def.property] ?? (selectedPathProps ? def.getLive(selectedPathProps) : 0)
    setKeyframe(selectedPathId, def.property, playheadMs, value, easing)
  }

  const liveColorHex = (def: ColorRowDef) =>
    colorOverrides[def.prefix] ?? (selectedPathProps ? def.getLiveHex(selectedPathProps) : null) ?? '#ffffff'

  const handleAddColorKeyframe = (def: ColorRowDef) => {
    if (!selectedPathId) return
    const { r, g, b } = hexToRgb(liveColorHex(def))
    const [pr, pg, pb] = colorChannels(def.prefix)
    setKeyframe(selectedPathId, pr, playheadMs, r, easing)
    setKeyframe(selectedPathId, pg, playheadMs, g, easing)
    setKeyframe(selectedPathId, pb, playheadMs, b, easing)
  }

  const colorAtTime = (def: ColorRowDef, time: number): string => {
    if (!selectedPathId) return liveColorHex(def)
    const [r, g, b] = colorChannels(def.prefix).map(
      (property) =>
        findPropertyTrack(animation, selectedPathId, property)?.keyframes.find((k) => k.time === time)?.value ?? 0,
    )
    return rgbToHex(r, g, b)
  }

  const handleColorKeyframeMouseDown = (def: ColorRowDef, time: number) => (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const [primaryChannel] = colorChannels(def.prefix)
    draggingKeyframe.current = { property: primaryChannel, time }
    const rect = e.currentTarget.parentElement!.getBoundingClientRect()

    const handleMove = (moveEvent: MouseEvent) => {
      if (!draggingKeyframe.current || !selectedPathId) return
      const newTime = timeFromX(moveEvent.clientX, rect)
      for (const property of colorChannels(def.prefix)) {
        moveKeyframe(selectedPathId, property, draggingKeyframe.current.time, newTime)
      }
      draggingKeyframe.current = { property: primaryChannel, time: newTime }
    }
    const handleUp = () => {
      draggingKeyframe.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  const handleRemoveColorKeyframe = (def: ColorRowDef, time: number) => {
    if (!selectedPathId) return
    for (const property of colorChannels(def.prefix)) {
      removeKeyframe(selectedPathId, property, time)
    }
  }

  return (
    <div className="Timeline" style={{ height }}>
      <div className="Timeline-resizeHandle" onPointerDown={handleResizeStart} title="Drag to resize" />
      <div className="Timeline-body">
        <div className="Timeline-controls">
          <button type="button" onClick={isPlaying ? pause : play} title={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <span className="Timeline-time">
            {formatMs(playheadMs)} / {formatMs(animation.durationMs)}
          </span>
          <label className="Timeline-durationLabel">
            Duration (s)
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={(animation.durationMs / 1000).toFixed(2)}
              onChange={(e) => setAnimationDuration(Number(e.target.value) * 1000)}
            />
          </label>
          <label className="Timeline-durationLabel">
            Easing
            <select value={easing} onChange={(e) => setEasing(e.target.value as Easing)}>
              {EASINGS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setAppMode('draw')}
            title="Back to drawing"
            className="Timeline-hideButton"
          >
            Done
          </button>
        </div>

        {selectedPathId ? (
          <div className="Timeline-tracks">
            {PROPERTY_DEFS.map((def) => {
              const track = findPropertyTrack(animation, selectedPathId, def.property)
              const value =
                valueOverrides[def.property] ?? (selectedPathProps ? def.getLive(selectedPathProps) : 0)
              return (
                <div key={def.property} className="Timeline-row">
                  <div className="Timeline-rowHead">
                    <span className="Timeline-rowLabel">{def.label}</span>
                    <input
                      type="number"
                      min={def.min}
                      max={def.max}
                      step={def.step}
                      value={value}
                      onChange={(e) =>
                        setValueOverrides((prev) => ({ ...prev, [def.property]: Number(e.target.value) }))
                      }
                    />
                    <button type="button" onClick={() => handleAddKeyframe(def)} title={`Set ${def.label} keyframe`}>
                      Key
                    </button>
                  </div>
                  <div className="Timeline-track" onMouseDown={handleScrub}>
                    <div
                      className="Timeline-playhead"
                      style={{ left: `${(playheadMs / animation.durationMs) * 100}%` }}
                    />
                    {track?.keyframes.map((kf) => (
                      <div
                        key={kf.time}
                        className="Timeline-keyframe"
                        style={{ left: `${(kf.time / animation.durationMs) * 100}%` }}
                        onMouseDown={handleKeyframeMouseDown(def.property, kf.time)}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          removeKeyframe(selectedPathId, def.property, kf.time)
                        }}
                        title={`${def.label} ${kf.value.toFixed(2)} (${kf.easing}) at ${formatMs(kf.time)} — double-click to delete`}
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            {COLOR_ROW_DEFS.map((def) => {
              const [primaryChannel] = colorChannels(def.prefix)
              const track = findPropertyTrack(animation, selectedPathId, primaryChannel)
              const liveHex = liveColorHex(def)
              const disabled = selectedPathProps ? def.getLiveHex(selectedPathProps) == null : true
              return (
                <div key={def.prefix} className="Timeline-row">
                  <div className="Timeline-rowHead">
                    <span className="Timeline-rowLabel">{def.label}</span>
                    <input
                      type="color"
                      value={liveHex}
                      disabled={disabled}
                      onChange={(e) =>
                        setColorOverrides((prev) => ({ ...prev, [def.prefix]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => handleAddColorKeyframe(def)}
                      disabled={disabled}
                      title={`Set ${def.label} keyframe`}
                    >
                      Key
                    </button>
                  </div>
                  <div className="Timeline-track" onMouseDown={handleScrub}>
                    <div
                      className="Timeline-playhead"
                      style={{ left: `${(playheadMs / animation.durationMs) * 100}%` }}
                    />
                    {track?.keyframes.map((kf) => (
                      <div
                        key={kf.time}
                        className="Timeline-keyframe"
                        style={{
                          left: `${(kf.time / animation.durationMs) * 100}%`,
                          background: colorAtTime(def, kf.time),
                        }}
                        onMouseDown={handleColorKeyframeMouseDown(def, kf.time)}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          handleRemoveColorKeyframe(def, kf.time)
                        }}
                        title={`${def.label} ${colorAtTime(def, kf.time)} (${kf.easing}) at ${formatMs(kf.time)} — double-click to delete`}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="Timeline-hint">Select a single path to add keyframes.</div>
        )}
      </div>
    </div>
  )
}

export default Timeline
