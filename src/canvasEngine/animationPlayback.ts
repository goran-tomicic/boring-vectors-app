import paper from 'paper'
import {
  type AnimatableProperty,
  type AnimationClip,
  type PathTrack,
  type SegmentSnapshot,
  evaluateProperty,
} from '../animation'
import type { EditorState } from '../store/editorStore'
import { findPathById } from './hitTest'

/**
 * Mutates `path`'s position/size to match `pathTrack` at `timeMs`, including resetting to a
 * stored rest shape and reapplying rotation/scale when present — see PathTrack.restSegments
 * in animation.ts for why that reset is necessary (Paper.js has no separate transform matrix
 * to undo a relative scale()/rotate() call from). Shared by live playback (applied to a real
 * path) and offscreen frame rendering for export (applied to a detached clone), so both can
 * never drift into separate implementations.
 */
export function applyGeometryAtTime(path: paper.Path, pathTrack: PathTrack, clip: AnimationClip, timeMs: number) {
  if (pathTrack.restSegments && pathTrack.restCenter) {
    const segments = pathTrack.restSegments.map(
      (s: SegmentSnapshot) =>
        new paper.Segment(
          new paper.Point(s.point.x, s.point.y),
          new paper.Point(s.handleIn.x, s.handleIn.y),
          new paper.Point(s.handleOut.x, s.handleOut.y),
        ),
    )
    path.removeSegments()
    path.addSegments(segments)
    const center = new paper.Point(pathTrack.restCenter.x, pathTrack.restCenter.y)
    const scale = evaluateProperty(clip, pathTrack.pathId, 'scale', timeMs) ?? 1
    const rotation = evaluateProperty(clip, pathTrack.pathId, 'rotation', timeMs) ?? 0
    if (scale !== 1) path.scale(scale, center)
    if (rotation !== 0) path.rotate(rotation, center)
  }

  for (const propertyTrack of pathTrack.properties) {
    if (
      propertyTrack.property !== 'x' &&
      propertyTrack.property !== 'y' &&
      propertyTrack.property !== 'width' &&
      propertyTrack.property !== 'height'
    ) {
      continue
    }
    const value = evaluateProperty(clip, pathTrack.pathId, propertyTrack.property, timeMs)
    if (value === null) continue
    if (propertyTrack.property === 'x') {
      path.bounds = new paper.Rectangle(new paper.Point(value, path.bounds.y), path.bounds.size)
    } else if (propertyTrack.property === 'y') {
      path.bounds = new paper.Rectangle(new paper.Point(path.bounds.x, value), path.bounds.size)
    } else if (propertyTrack.property === 'width') {
      path.bounds = new paper.Rectangle(path.bounds.point, new paper.Size(Math.max(1, value), path.bounds.height))
    } else if (propertyTrack.property === 'height') {
      path.bounds = new paper.Rectangle(path.bounds.point, new paper.Size(path.bounds.width, Math.max(1, value)))
    }
  }
}

/** Applies every animatable property (geometry + opacity + color) to `path` at `timeMs`. */
export function applyFullAnimationAtTime(path: paper.Path, pathTrack: PathTrack, clip: AnimationClip, timeMs: number) {
  applyGeometryAtTime(path, pathTrack, clip, timeMs)

  const opacityValue = evaluateProperty(clip, pathTrack.pathId, 'opacity', timeMs)
  if (opacityValue !== null) path.opacity = opacityValue

  // Each color trio (R/G/B) is always keyed together (see Timeline.tsx), so it's only
  // applied once all three channels evaluate to a value this frame.
  const evalColor = (prefix: 'fillColor' | 'strokeColor'): paper.Color | null => {
    const r = evaluateProperty(clip, pathTrack.pathId, `${prefix}R` as AnimatableProperty, timeMs)
    const g = evaluateProperty(clip, pathTrack.pathId, `${prefix}G` as AnimatableProperty, timeMs)
    const b = evaluateProperty(clip, pathTrack.pathId, `${prefix}B` as AnimatableProperty, timeMs)
    return r !== null && g !== null && b !== null ? new paper.Color(r / 255, g / 255, b / 255) : null
  }
  const fillColor = evalColor('fillColor')
  if (fillColor) path.fillColor = fillColor
  const strokeColor = evalColor('strokeColor')
  if (strokeColor) path.strokeColor = strokeColor
}

/**
 * Applies the full animation clip to every live path in `contentLayer` at `timeMs` — writes
 * interpolated keyframe values onto live Paper.js objects; never reads them back as truth
 * (see CLAUDE.md's architectural amendment).
 */
export function applyAnimationAtTime(contentLayer: paper.Layer, clip: AnimationClip, timeMs: number) {
  for (const pathTrack of clip.tracks) {
    const path = findPathById(contentLayer, pathTrack.pathId)
    if (!path) continue
    applyFullAnimationAtTime(path, pathTrack, clip, timeMs)
  }
}

export interface PlaybackController {
  start: () => void
  stop: () => void
}

/** rAF-driven playback loop — advances the store's playhead each frame, looping or pausing at the animation's end per settings.loopPlayback. */
export function createPlaybackController(storeRef: { current: EditorState }): PlaybackController {
  let rafId: number | null = null
  let startWallMs = 0
  let startPlayheadMs = 0

  const stop = () => {
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
  }

  const tick = () => {
    const elapsed = performance.now() - startWallMs
    const duration = storeRef.current.animation.durationMs
    const next = startPlayheadMs + elapsed
    if (next >= duration) {
      if (storeRef.current.settings.loopPlayback) {
        // Carries over the overshoot past duration so the wrap is seamless — no stutter or
        // pause at the loop seam.
        const overshoot = duration > 0 ? next % duration : 0
        startPlayheadMs = 0
        startWallMs = performance.now() - overshoot
        storeRef.current.setPlayhead(overshoot)
        rafId = requestAnimationFrame(tick)
        return
      }
      storeRef.current.setPlayhead(duration)
      storeRef.current.pause()
      return
    }
    storeRef.current.setPlayhead(next)
    rafId = requestAnimationFrame(tick)
  }

  const start = () => {
    startPlayheadMs =
      storeRef.current.playheadMs >= storeRef.current.animation.durationMs ? 0 : storeRef.current.playheadMs
    storeRef.current.setPlayhead(startPlayheadMs)
    startWallMs = performance.now()
    rafId = requestAnimationFrame(tick)
  }

  return { start, stop }
}

/**
 * After a direct edit to `path` (drag, Properties panel position/color edit) while in Animate
 * mode, extends any animation already in progress on that path to match: a property that's
 * already keyframed gets its keyframe at the current playhead time updated (or a new one
 * inserted there, if it's animated but wasn't yet keyed at this exact moment). A property
 * that's never been keyframed for this path is left alone — direct manipulation only continues
 * an animation you've started, it never starts one on its own.
 */
export function syncKeyframesAfterDirectEdit(path: paper.Path, storeRef: { current: EditorState }) {
  if (storeRef.current.appMode !== 'animate') return
  const pathId = path.name
  if (!pathId) return
  const t = storeRef.current.playheadMs
  const update = storeRef.current.autoKeyframeIfAnimated

  update(pathId, 'x', t, path.bounds.x)
  update(pathId, 'y', t, path.bounds.y)
  if (path.fillColor) {
    update(pathId, 'fillColorR', t, Math.round(path.fillColor.red * 255))
    update(pathId, 'fillColorG', t, Math.round(path.fillColor.green * 255))
    update(pathId, 'fillColorB', t, Math.round(path.fillColor.blue * 255))
  }
  if (path.strokeColor) {
    update(pathId, 'strokeColorR', t, Math.round(path.strokeColor.red * 255))
    update(pathId, 'strokeColorG', t, Math.round(path.strokeColor.green * 255))
    update(pathId, 'strokeColorB', t, Math.round(path.strokeColor.blue * 255))
  }
}
