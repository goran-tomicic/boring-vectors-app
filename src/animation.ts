// Keyframe timeline data model (docs/ROADMAP.md step 3). This is the "second
// source of truth" the CLAUDE.md architectural amendment describes: it
// captures how a path's properties change over time, which Paper.js has no
// concept of. Paper.js remains authoritative for current, static geometry —
// the animation engine in PaperCanvas.tsx writes interpolated values onto
// live Paper.js objects each frame but never reads them back as truth.

export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

/**
 * Properties keyframes can drive (docs/ROADMAP.md step 3.4). All of these are stored and
 * applied as absolute values (never relative deltas) so evaluating a keyframe never depends
 * on whatever transient state the path happened to be in — see the note on applyAnimationAtTime
 * in PaperCanvas.tsx. Rotation and ratio-based scale are deferred: Paper.js bakes transforms
 * directly into path segments rather than keeping a separate matrix, so animating them
 * correctly needs a persisted "rest geometry" snapshot to transform from each frame, not just
 * an absolute number — width/height cover most of the same "resize over time" use case without
 * that extra machinery.
 */
// fillColorR/G/B and strokeColorR/G/B are 0-255 channel values, deliberately separate numeric
// properties rather than a dedicated "color" keyframe type — reuses the same absolute-numeric
// machinery as everything else instead of a parallel data shape. Each trio is always keyed
// together (see Timeline.tsx's color rows), so a path either has all three of one or none.
// rotation (degrees) and scale (ratio, 1 = 100%) are absolute too, but unlike everything
// else they can't be applied directly to the path's current state — Paper.js bakes
// transforms into segment data rather than keeping a matrix, so "rotate to 45deg" only
// means something relative to a fixed rest shape. See PathTrack.restSegments below and the
// note on applyAnimationAtTime in PaperCanvas.tsx.
export type AnimatableProperty =
  | 'opacity'
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'fillColorR'
  | 'fillColorG'
  | 'fillColorB'
  | 'strokeColorR'
  | 'strokeColorG'
  | 'strokeColorB'
  | 'rotation'
  | 'scale'

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return { r: Number.isNaN(r) ? 0 : r, g: Number.isNaN(g) ? 0 : g, b: Number.isNaN(b) ? 0 : b }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)))
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`
}

export interface Keyframe {
  time: number
  value: number
  easing: Easing
}

export interface PropertyTrack {
  property: AnimatableProperty
  /** Always kept sorted by time. */
  keyframes: Keyframe[]
}

export interface SegmentSnapshot {
  point: { x: number; y: number }
  handleIn: { x: number; y: number }
  handleOut: { x: number; y: number }
}

export interface PathTrack {
  pathId: string
  properties: PropertyTrack[]
  /**
   * The path's segment geometry and bounds center at the moment rotation or scale was first
   * keyframed for it — captured once, from PaperCanvas.tsx (only it can read Paper.js state).
   * Playback resets to this snapshot each frame, then applies the evaluated rotation/scale
   * around restCenter, rather than rotating/scaling incrementally — Paper.js has no separate
   * transform matrix to reset, so incremental application would drift and compound. Absent
   * for paths that have never had rotation/scale keyframed.
   */
  restSegments?: SegmentSnapshot[]
  restCenter?: { x: number; y: number }
}

export interface AnimationClip {
  durationMs: number
  tracks: PathTrack[]
}

export const DEFAULT_ANIMATION_DURATION_MS = 3000
const KEYFRAME_MERGE_EPSILON_MS = 1

export function createEmptyAnimationClip(): AnimationClip {
  return { durationMs: DEFAULT_ANIMATION_DURATION_MS, tracks: [] }
}

function easeValue(t: number, easing: Easing): number {
  switch (easing) {
    case 'easeIn':
      return t * t
    case 'easeOut':
      return 1 - (1 - t) * (1 - t)
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    default:
      return t
  }
}

export function findPropertyTrack(
  clip: AnimationClip,
  pathId: string,
  property: AnimatableProperty,
): PropertyTrack | undefined {
  return clip.tracks.find((t) => t.pathId === pathId)?.properties.find((p) => p.property === property)
}

/** Interpolated value at `time`, or null if the path has no keyframes for this property. */
export function evaluateProperty(
  clip: AnimationClip,
  pathId: string,
  property: AnimatableProperty,
  time: number,
): number | null {
  const track = findPropertyTrack(clip, pathId, property)
  if (!track || track.keyframes.length === 0) return null

  const keyframes = track.keyframes
  if (time <= keyframes[0].time) return keyframes[0].value
  if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]
    const b = keyframes[i + 1]
    if (time >= a.time && time <= b.time) {
      const span = b.time - a.time
      const t = span === 0 ? 1 : (time - a.time) / span
      return a.value + (b.value - a.value) * easeValue(t, b.easing)
    }
  }
  return keyframes[keyframes.length - 1].value
}

export function hasRestGeometry(clip: AnimationClip, pathId: string): boolean {
  return clip.tracks.find((t) => t.pathId === pathId)?.restSegments !== undefined
}

/** Returns a new clip with the path's rest geometry set — no-op if it's already captured (see PathTrack.restSegments). */
export function withRestGeometrySet(
  clip: AnimationClip,
  pathId: string,
  segments: SegmentSnapshot[],
  center: { x: number; y: number },
): AnimationClip {
  if (hasRestGeometry(clip, pathId)) return clip
  const tracks = clip.tracks.map((t) => ({ ...t }))
  let pathTrack = tracks.find((t) => t.pathId === pathId)
  if (!pathTrack) {
    pathTrack = { pathId, properties: [] }
    tracks.push(pathTrack)
  }
  pathTrack.restSegments = segments
  pathTrack.restCenter = center
  return { ...clip, tracks }
}

/** Returns a new clip with the given path/property keyframe inserted or replaced (immutable, for Zustand). */
export function withKeyframeSet(
  clip: AnimationClip,
  pathId: string,
  property: AnimatableProperty,
  time: number,
  value: number,
  easing: Easing = 'linear',
): AnimationClip {
  const tracks = clip.tracks.map((t) => ({ ...t, properties: t.properties.map((p) => ({ ...p })) }))
  let pathTrack = tracks.find((t) => t.pathId === pathId)
  if (!pathTrack) {
    pathTrack = { pathId, properties: [] }
    tracks.push(pathTrack)
  }
  let propTrack = pathTrack.properties.find((p) => p.property === property)
  if (!propTrack) {
    propTrack = { property, keyframes: [] }
    pathTrack.properties.push(propTrack)
  }
  const withoutExisting = propTrack.keyframes.filter((k) => Math.abs(k.time - time) > KEYFRAME_MERGE_EPSILON_MS)
  propTrack.keyframes = [...withoutExisting, { time, value, easing }].sort((a, b) => a.time - b.time)
  return { ...clip, tracks }
}

/** Returns a new clip with the keyframe nearest `time` (within epsilon) removed, pruning empty tracks. */
export function withKeyframeRemoved(
  clip: AnimationClip,
  pathId: string,
  property: AnimatableProperty,
  time: number,
): AnimationClip {
  const tracks = clip.tracks
    .map((t) => {
      if (t.pathId !== pathId) return t
      return {
        ...t,
        properties: t.properties
          .map((p) => {
            if (p.property !== property) return p
            return { ...p, keyframes: p.keyframes.filter((k) => Math.abs(k.time - time) > KEYFRAME_MERGE_EPSILON_MS) }
          })
          .filter((p) => p.keyframes.length > 0),
      }
    })
    .filter((t) => t.properties.length > 0)
  return { ...clip, tracks }
}

/** Returns a new clip with the keyframe nearest `oldTime` moved to `newTime` (clamped, re-sorted). */
export function withKeyframeMoved(
  clip: AnimationClip,
  pathId: string,
  property: AnimatableProperty,
  oldTime: number,
  newTime: number,
): AnimationClip {
  const track = findPropertyTrack(clip, pathId, property)
  const keyframe = track?.keyframes.find((k) => Math.abs(k.time - oldTime) <= KEYFRAME_MERGE_EPSILON_MS)
  if (!track || !keyframe) return clip
  const clampedTime = Math.min(Math.max(newTime, 0), clip.durationMs)
  return withKeyframeSet(
    withKeyframeRemoved(clip, pathId, property, oldTime),
    pathId,
    property,
    clampedTime,
    keyframe.value,
    keyframe.easing,
  )
}

/**
 * If `property` already has a track for `pathId` (i.e. it's already being animated) and there's
 * a keyframe at exactly `time`, updates its value (time/easing unchanged). If the property is
 * already animated but has no keyframe at exactly `time`, inserts a new one there — extends an
 * animation you've already started by posing it at a new time, rather than requiring a trip
 * back to the Timeline to type a number. If the property has never been keyframed for this path
 * at all, this is a no-op: an unanimated property's direct edits stay plain, unrecorded edits,
 * same as Draw mode — direct manipulation never starts a new animation on its own, only extends
 * one that already exists.
 */
export function withKeyframeAutoInserted(
  clip: AnimationClip,
  pathId: string,
  property: AnimatableProperty,
  time: number,
  value: number,
): AnimationClip {
  const track = findPropertyTrack(clip, pathId, property)
  if (!track) return clip

  const existing = track.keyframes.find((k) => Math.abs(k.time - time) <= KEYFRAME_MERGE_EPSILON_MS)
  if (existing) {
    return withKeyframeSet(clip, pathId, property, existing.time, value, existing.easing)
  }

  // New keyframe — inherit easing from whichever existing keyframe is nearest in time, so
  // posing a new frame doesn't reset the curve back to linear.
  const nearest = [...track.keyframes].sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time))[0]
  return withKeyframeSet(clip, pathId, property, time, value, nearest?.easing ?? 'linear')
}

// --- SMIL export (docs/ROADMAP.md step 4) ---
// Scoped to opacity/fill/stroke color for this round: they map 1:1 onto a native SVG
// <animate attributeName="..."> with no ambiguity. Position/size/rotation/scale don't have
// an equally direct mapping — x/y/width/height mutate a path's bounds in place with no
// separate "authoring shape" to preserve, and rotation/scale already need a rest-geometry
// snapshot just to play back correctly in-app — so baking them into portable SMIL/CSS is
// deferred rather than shipped half-right.

// Approximates each named easing as the closest standard CSS/SMIL cubic-bezier keySpline —
// not identical to the quadratic curves evaluateProperty() uses, but visually equivalent and
// the conventional mapping every export tool uses.
const EASING_KEY_SPLINES: Record<Easing, string | null> = {
  linear: null,
  easeIn: '0.42 0 1 1',
  easeOut: '0 0 0.58 1',
  easeInOut: '0.42 0 0.58 1',
}

/** Keyframes padded so the first is at t=0 and the last at t=durationMs, matching evaluateProperty's boundary behavior (holds the nearest value outside the keyed range). Required because SMIL's keyTimes must span the full 0-1 range. */
function padKeyframesToDuration(keyframes: Keyframe[], durationMs: number): Keyframe[] {
  const padded = [...keyframes]
  if (padded[0].time > 0) {
    padded.unshift({ time: 0, value: padded[0].value, easing: padded[0].easing })
  }
  const last = padded[padded.length - 1]
  if (last.time < durationMs) {
    padded.push({ time: durationMs, value: last.value, easing: 'linear' })
  }
  return padded
}

/**
 * A single <animate> element string for one numeric property track, or null if the track
 * has too few keyframes to animate (a single keyframe is a constant, not an animation).
 */
export function buildSmilAnimate(
  track: PropertyTrack,
  attributeName: string,
  durationMs: number,
  formatValue: (v: number) => string,
): string | null {
  if (track.keyframes.length < 2) return null
  const keyframes = padKeyframesToDuration(track.keyframes, durationMs)
  const values = keyframes.map((k) => formatValue(k.value)).join(';')
  const keyTimes = keyframes.map((k) => (k.time / durationMs).toFixed(4)).join(';')
  const needsSpline = keyframes.slice(1).some((k) => k.easing !== 'linear')
  const calcMode = needsSpline ? ' calcMode="spline"' : ''
  const keySplines = needsSpline
    ? ` keySplines="${keyframes
        .slice(1)
        .map((k) => EASING_KEY_SPLINES[k.easing] ?? '0 0 1 1')
        .join(' ')}"`
    : ''
  return `<animate attributeName="${attributeName}" values="${values}" keyTimes="${keyTimes}" dur="${durationMs}ms" begin="0s" fill="freeze"${calcMode}${keySplines}/>`
}

/** All SMIL <animate> element strings this path track supports exporting (opacity, fill, stroke — see the note above). */
/** A color's R/G/B channel tracks combined into a single <animate> on the given SVG color attribute (fill/stroke), or null if the color has fewer than 2 keyframes. R/G/B are always keyed together (see Timeline.tsx), so R's keyframe times are canonical. */
function buildSmilColorAnimate(
  track: PathTrack,
  prefix: 'fillColor' | 'strokeColor',
  attributeName: string,
  durationMs: number,
): string | null {
  const rTrack = track.properties.find((p) => p.property === `${prefix}R`)
  const gTrack = track.properties.find((p) => p.property === `${prefix}G`)
  const bTrack = track.properties.find((p) => p.property === `${prefix}B`)
  if (!rTrack || !gTrack || !bTrack || rTrack.keyframes.length < 2) return null

  const valueAt = (channelTrack: PropertyTrack, time: number) =>
    channelTrack.keyframes.find((k) => Math.abs(k.time - time) < 1)?.value ?? 0

  const keyframes: Keyframe[] = rTrack.keyframes.map((k) => ({
    time: k.time,
    // Not an interpolated numeric value — a marker this loop resolves to a hex string per
    // keyframe, below. The SVG renderer does the actual per-channel color interpolation
    // between these hex strings; nothing in this file computes an "in-between" color.
    value: k.time,
    easing: k.easing,
  }))
  const hexAtTime = new Map(keyframes.map((k) => [k.time, rgbToHex(valueAt(rTrack, k.time), valueAt(gTrack, k.time), valueAt(bTrack, k.time))]))

  return buildSmilAnimate(
    { property: rTrack.property, keyframes },
    attributeName,
    durationMs,
    (time) => hexAtTime.get(time) ?? '#000000',
  )
}

export function buildSmilAnimatesForPath(track: PathTrack, durationMs: number): string[] {
  const elements: string[] = []

  const opacityTrack = track.properties.find((p) => p.property === 'opacity')
  if (opacityTrack) {
    const el = buildSmilAnimate(opacityTrack, 'opacity', durationMs, (v) => v.toFixed(3))
    if (el) elements.push(el)
  }

  for (const [prefix, attributeName] of [
    ['fillColor', 'fill'],
    ['strokeColor', 'stroke'],
  ] as const) {
    const el = buildSmilColorAnimate(track, prefix, attributeName, durationMs)
    if (el) elements.push(el)
  }

  return elements
}
