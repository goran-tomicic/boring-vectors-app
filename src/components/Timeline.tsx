import { useRef, useState } from 'react'
import { useEditorStore } from '../store/editorStore'
import { findPropertyTrack } from '../animation'
import './Timeline.css'

function formatMs(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`
}

function Timeline() {
  const timelineVisible = useEditorStore((s) => s.timelineVisible)
  const toggleTimeline = useEditorStore((s) => s.toggleTimeline)
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

  const trackRef = useRef<HTMLDivElement>(null)
  const draggingKeyframeTime = useRef<number | null>(null)

  const selectedPathId = selectedPathIds.length === 1 ? selectedPathIds[0] : null
  const opacityTrack = selectedPathId ? findPropertyTrack(animation, selectedPathId, 'opacity') : undefined

  // Value to write into the next keyframe — defaults to the path's live opacity but is
  // user-editable, since capturing "whatever opacity happens to be right now" isn't enough
  // to build a fade in/out (there's no other UI to change item opacity outside keyframes).
  // Reset during render (not an effect) when the selection changes, per React's guidance
  // for adjusting state from a prop change without an extra render.
  const [keyframeValueOverride, setKeyframeValueOverride] = useState<number | null>(null)
  const [lastSelectedPathId, setLastSelectedPathId] = useState(selectedPathId)
  if (selectedPathId !== lastSelectedPathId) {
    setLastSelectedPathId(selectedPathId)
    setKeyframeValueOverride(null)
  }
  const keyframeValue = keyframeValueOverride ?? selectedPathProps?.opacity ?? 1

  if (!timelineVisible) {
    return (
      <button type="button" className="Timeline-showButton" onClick={toggleTimeline} title="Show timeline">
        Timeline
      </button>
    )
  }

  const timeFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    return ratio * animation.durationMs
  }

  const handleScrub = (e: React.MouseEvent) => {
    setPlayhead(timeFromClientX(e.clientX))
  }

  const handleKeyframeMouseDown = (time: number) => (e: React.MouseEvent) => {
    e.stopPropagation()
    draggingKeyframeTime.current = time

    const handleMove = (moveEvent: MouseEvent) => {
      if (draggingKeyframeTime.current === null || !selectedPathId) return
      const newTime = timeFromClientX(moveEvent.clientX)
      moveKeyframe(selectedPathId, 'opacity', draggingKeyframeTime.current, newTime)
      draggingKeyframeTime.current = newTime
    }
    const handleUp = () => {
      draggingKeyframeTime.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  const handleAddKeyframe = () => {
    if (!selectedPathId) return
    setKeyframe(selectedPathId, 'opacity', playheadMs, keyframeValue)
  }

  return (
    <div className="Timeline">
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
        <button type="button" onClick={toggleTimeline} title="Hide timeline" className="Timeline-hideButton">
          Hide
        </button>
      </div>

      <div className="Timeline-track" ref={trackRef} onMouseDown={handleScrub}>
        <div className="Timeline-playhead" style={{ left: `${(playheadMs / animation.durationMs) * 100}%` }} />
        {opacityTrack?.keyframes.map((kf) => (
          <div
            key={kf.time}
            className="Timeline-keyframe"
            style={{ left: `${(kf.time / animation.durationMs) * 100}%` }}
            onMouseDown={handleKeyframeMouseDown(kf.time)}
            onDoubleClick={(e) => {
              e.stopPropagation()
              if (selectedPathId) removeKeyframe(selectedPathId, 'opacity', kf.time)
            }}
            title={`opacity ${kf.value.toFixed(2)} at ${formatMs(kf.time)} — double-click to delete`}
          />
        ))}
      </div>

      {selectedPathId ? (
        <div className="Timeline-pathControls">
          <label className="Timeline-opacityLabel">
            Opacity
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={keyframeValue}
              onChange={(e) => setKeyframeValueOverride(Number(e.target.value))}
            />
          </label>
          <button type="button" onClick={handleAddKeyframe}>
            Set opacity keyframe at playhead
          </button>
        </div>
      ) : (
        <div className="Timeline-hint">Select a single path to add opacity keyframes.</div>
      )}
    </div>
  )
}

export default Timeline
