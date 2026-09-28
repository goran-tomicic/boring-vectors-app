// Keyframe timeline data model (docs/ROADMAP.md step 3). This is the "second
// source of truth" the CLAUDE.md architectural amendment describes: it
// captures how a path's properties change over time, which Paper.js has no
// concept of. Paper.js remains authoritative for current, static geometry —
// the animation engine in PaperCanvas.tsx writes interpolated values onto
// live Paper.js objects each frame but never reads them back as truth.

export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

/** Properties keyframes can drive. Starts with opacity only (docs/ROADMAP.md step 3.2); more land in 3.4. */
export type AnimatableProperty = 'opacity'

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

export interface PathTrack {
  pathId: string
  properties: PropertyTrack[]
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
