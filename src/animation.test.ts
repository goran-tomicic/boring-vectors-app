import { describe, expect, it } from 'vitest'
import {
  type AnimationClip,
  createEmptyAnimationClip,
  evaluateProperty,
  findPropertyTrack,
  hasRestGeometry,
  hexToRgb,
  rgbToHex,
  withKeyframeAutoInserted,
  withKeyframeMoved,
  withKeyframeRemoved,
  withKeyframeSet,
  withRestGeometrySet,
  buildSmilAnimate,
  buildSmilAnimatesForPath,
} from './animation'

describe('hexToRgb / rgbToHex', () => {
  it('round-trips a color', () => {
    expect(hexToRgb('#c084fc')).toEqual({ r: 192, g: 132, b: 252 })
    expect(rgbToHex(192, 132, 252)).toBe('#c084fc')
  })

  it('clamps out-of-range channel values', () => {
    expect(rgbToHex(-10, 300, 128)).toBe('#00ff80')
  })

  it('tolerates a malformed hex string instead of producing NaN', () => {
    expect(hexToRgb('nope')).toEqual({ r: 0, g: 0, b: 0 })
  })
})

describe('withKeyframeSet / findPropertyTrack', () => {
  it('creates a path track and property track on first use', () => {
    const clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'opacity', 0, 1)
    const track = findPropertyTrack(clip, 'path1', 'opacity')
    expect(track?.keyframes).toEqual([{ time: 0, value: 1, easing: 'linear' }])
  })

  it('keeps keyframes sorted by time regardless of insertion order', () => {
    let clip = createEmptyAnimationClip()
    clip = withKeyframeSet(clip, 'path1', 'x', 1000, 100)
    clip = withKeyframeSet(clip, 'path1', 'x', 0, 0)
    clip = withKeyframeSet(clip, 'path1', 'x', 500, 50)
    const track = findPropertyTrack(clip, 'path1', 'x')
    expect(track?.keyframes.map((k) => k.time)).toEqual([0, 500, 1000])
  })

  it('replaces a keyframe within epsilon of an existing time rather than adding a second one', () => {
    let clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'x', 100, 1)
    clip = withKeyframeSet(clip, 'path1', 'x', 100.5, 2)
    const track = findPropertyTrack(clip, 'path1', 'x')
    expect(track?.keyframes).toHaveLength(1)
    expect(track?.keyframes[0].value).toBe(2)
  })

  it('does not mutate the original clip (immutable update)', () => {
    const original = createEmptyAnimationClip()
    withKeyframeSet(original, 'path1', 'opacity', 0, 1)
    expect(original.tracks).toHaveLength(0)
  })
})

describe('withKeyframeRemoved', () => {
  it('removes a keyframe and prunes the now-empty property/path tracks', () => {
    const clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'opacity', 0, 1)
    const after = withKeyframeRemoved(clip, 'path1', 'opacity', 0)
    expect(after.tracks).toHaveLength(0)
  })

  it('leaves other properties on the same path alone', () => {
    let clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'opacity', 0, 1)
    clip = withKeyframeSet(clip, 'path1', 'x', 0, 10)
    const after = withKeyframeRemoved(clip, 'path1', 'opacity', 0)
    expect(findPropertyTrack(after, 'path1', 'opacity')).toBeUndefined()
    expect(findPropertyTrack(after, 'path1', 'x')?.keyframes).toHaveLength(1)
  })

  it('is a no-op when no keyframe exists at that time', () => {
    const clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'opacity', 0, 1)
    const after = withKeyframeRemoved(clip, 'path1', 'opacity', 500)
    expect(findPropertyTrack(after, 'path1', 'opacity')?.keyframes).toHaveLength(1)
  })
})

describe('withKeyframeMoved', () => {
  it('moves a keyframe to a new time, preserving its value and easing', () => {
    const clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'opacity', 0, 0.5, 'easeIn')
    const after = withKeyframeMoved(clip, 'path1', 'opacity', 0, 1000)
    const track = findPropertyTrack(after, 'path1', 'opacity')
    expect(track?.keyframes).toEqual([{ time: 1000, value: 0.5, easing: 'easeIn' }])
  })

  it('clamps the new time to the clip duration', () => {
    const clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'opacity', 0, 1)
    const after = withKeyframeMoved(clip, 'path1', 'opacity', 0, 999999)
    expect(findPropertyTrack(after, 'path1', 'opacity')?.keyframes[0].time).toBe(clip.durationMs)
  })

  it('is a no-op when no keyframe exists at the given time', () => {
    const clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'opacity', 0, 1)
    const after = withKeyframeMoved(clip, 'path1', 'opacity', 500, 1000)
    expect(after).toBe(clip)
  })
})

describe('withKeyframeAutoInserted (direct-manipulation auto-key)', () => {
  it('does nothing when the property has never been keyframed for this path', () => {
    const clip = createEmptyAnimationClip()
    const after = withKeyframeAutoInserted(clip, 'path1', 'x', 500, 123)
    expect(after).toBe(clip)
    expect(findPropertyTrack(after, 'path1', 'x')).toBeUndefined()
  })

  it('updates the value of an existing keyframe at exactly the given time', () => {
    const clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'x', 0, 100, 'easeOut')
    const after = withKeyframeAutoInserted(clip, 'path1', 'x', 0, 200)
    const track = findPropertyTrack(after, 'path1', 'x')
    expect(track?.keyframes).toEqual([{ time: 0, value: 200, easing: 'easeOut' }])
  })

  it('inserts a new keyframe when the property is animated but not keyed at this exact time', () => {
    const clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'x', 0, 100)
    const after = withKeyframeAutoInserted(clip, 'path1', 'x', 1500, 300)
    const track = findPropertyTrack(after, 'path1', 'x')
    expect(track?.keyframes).toHaveLength(2)
    expect(track?.keyframes[1]).toEqual({ time: 1500, value: 300, easing: 'linear' })
  })

  it('inherits easing from the nearest existing keyframe for a newly inserted one', () => {
    let clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'x', 0, 0, 'linear')
    clip = withKeyframeSet(clip, 'path1', 'x', 1000, 100, 'easeInOut')
    const after = withKeyframeAutoInserted(clip, 'path1', 'x', 900, 80)
    const inserted = findPropertyTrack(after, 'path1', 'x')?.keyframes.find((k) => k.time === 900)
    expect(inserted?.easing).toBe('easeInOut') // 1000 is nearer to 900 than 0 is
  })
})

describe('evaluateProperty', () => {
  function clipWith(keyframes: { time: number; value: number; easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' }[]): AnimationClip {
    let clip = createEmptyAnimationClip()
    for (const k of keyframes) clip = withKeyframeSet(clip, 'path1', 'opacity', k.time, k.value, k.easing)
    return clip
  }

  it('returns null when the path has no keyframes for the property', () => {
    expect(evaluateProperty(createEmptyAnimationClip(), 'path1', 'opacity', 500)).toBeNull()
  })

  it('holds the first value before the first keyframe', () => {
    const clip = clipWith([{ time: 1000, value: 0.5 }])
    expect(evaluateProperty(clip, 'path1', 'opacity', 0)).toBe(0.5)
  })

  it('holds the last value after the last keyframe', () => {
    const clip = clipWith([{ time: 0, value: 0 }, { time: 1000, value: 1 }])
    expect(evaluateProperty(clip, 'path1', 'opacity', 5000)).toBe(1)
  })

  it('interpolates linearly by default at the midpoint', () => {
    const clip = clipWith([{ time: 0, value: 0 }, { time: 1000, value: 100 }])
    expect(evaluateProperty(clip, 'path1', 'opacity', 500)).toBeCloseTo(50)
  })

  it('returns exact keyframe values at their own times', () => {
    const clip = clipWith([{ time: 0, value: 10 }, { time: 1000, value: 20 }])
    expect(evaluateProperty(clip, 'path1', 'opacity', 0)).toBe(10)
    expect(evaluateProperty(clip, 'path1', 'opacity', 1000)).toBe(20)
  })

  it('applies easeIn so the midpoint is below the linear midpoint', () => {
    const clip = clipWith([{ time: 0, value: 0 }, { time: 1000, value: 100, easing: 'easeIn' }])
    const mid = evaluateProperty(clip, 'path1', 'opacity', 500)!
    expect(mid).toBeLessThan(50)
  })

  it('applies easeOut so the midpoint is above the linear midpoint', () => {
    const clip = clipWith([{ time: 0, value: 0 }, { time: 1000, value: 100, easing: 'easeOut' }])
    const mid = evaluateProperty(clip, 'path1', 'opacity', 500)!
    expect(mid).toBeGreaterThan(50)
  })

  it('interpolates across the correct segment with three or more keyframes', () => {
    const clip = clipWith([
      { time: 0, value: 0 },
      { time: 1000, value: 100 },
      { time: 2000, value: 0 },
    ])
    expect(evaluateProperty(clip, 'path1', 'opacity', 500)).toBeCloseTo(50)
    expect(evaluateProperty(clip, 'path1', 'opacity', 1500)).toBeCloseTo(50)
    expect(evaluateProperty(clip, 'path1', 'opacity', 1000)).toBe(100)
  })
})

describe('rest geometry', () => {
  const segments = [{ point: { x: 0, y: 0 }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } }]
  const center = { x: 50, y: 50 }

  it('reports no rest geometry for an unanimated path', () => {
    expect(hasRestGeometry(createEmptyAnimationClip(), 'path1')).toBe(false)
  })

  it('captures rest geometry the first time it is set', () => {
    const clip = withRestGeometrySet(createEmptyAnimationClip(), 'path1', segments, center)
    expect(hasRestGeometry(clip, 'path1')).toBe(true)
    const track = clip.tracks.find((t) => t.pathId === 'path1')
    expect(track?.restSegments).toEqual(segments)
    expect(track?.restCenter).toEqual(center)
  })

  it('is a no-op if rest geometry is already captured, even with different segments', () => {
    let clip = withRestGeometrySet(createEmptyAnimationClip(), 'path1', segments, center)
    const differentSegments = [{ point: { x: 99, y: 99 }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } }]
    clip = withRestGeometrySet(clip, 'path1', differentSegments, { x: 1, y: 1 })
    const track = clip.tracks.find((t) => t.pathId === 'path1')
    expect(track?.restSegments).toEqual(segments) // unchanged
  })
})

describe('buildSmilAnimate', () => {
  it('returns null for a track with fewer than 2 keyframes (nothing to animate)', () => {
    const clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'opacity', 0, 1)
    const track = findPropertyTrack(clip, 'path1', 'opacity')!
    expect(buildSmilAnimate(track, 'opacity', 3000, (v) => v.toFixed(2))).toBeNull()
  })

  it('emits values/keyTimes spanning the full 0-1 range, padding to the clip duration', () => {
    let clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'opacity', 500, 0.2)
    clip = withKeyframeSet(clip, 'path1', 'opacity', 2000, 0.8)
    const track = findPropertyTrack(clip, 'path1', 'opacity')!
    const xml = buildSmilAnimate(track, 'opacity', 3000, (v) => v.toFixed(2))!
    expect(xml).toContain('keyTimes="0.0000;0.1667;0.6667;1.0000"')
    expect(xml).toContain('values="0.20;0.20;0.80;0.80"')
  })

  it('adds calcMode="spline" with keySplines only when a non-linear easing is used', () => {
    let clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'opacity', 0, 0)
    clip = withKeyframeSet(clip, 'path1', 'opacity', 1000, 1, 'easeInOut')
    const track = findPropertyTrack(clip, 'path1', 'opacity')!
    const xml = buildSmilAnimate(track, 'opacity', 1000, (v) => v.toFixed(2))!
    expect(xml).toContain('calcMode="spline"')
    expect(xml).toContain('keySplines="0.42 0 0.58 1"')
  })

  it('omits calcMode/keySplines for purely linear tracks', () => {
    let clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'opacity', 0, 0)
    clip = withKeyframeSet(clip, 'path1', 'opacity', 1000, 1, 'linear')
    const track = findPropertyTrack(clip, 'path1', 'opacity')!
    const xml = buildSmilAnimate(track, 'opacity', 1000, (v) => v.toFixed(2))!
    expect(xml).not.toContain('calcMode')
    expect(xml).not.toContain('keySplines')
  })
})

describe('buildSmilAnimatesForPath', () => {
  it('returns an empty array for a path with no keyframes', () => {
    expect(buildSmilAnimatesForPath({ pathId: 'path1', properties: [] }, 3000)).toEqual([])
  })

  it('includes an opacity animate when opacity has 2+ keyframes', () => {
    let clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'opacity', 0, 1)
    clip = withKeyframeSet(clip, 'path1', 'opacity', 1000, 0)
    const pathTrack = clip.tracks[0]
    const elements = buildSmilAnimatesForPath(pathTrack, clip.durationMs)
    expect(elements).toHaveLength(1)
    expect(elements[0]).toContain('attributeName="opacity"')
  })

  it('only emits a fill animate once all three R/G/B channels have 2+ keyframes', () => {
    let clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'fillColorR', 0, 255)
    clip = withKeyframeSet(clip, 'path1', 'fillColorR', 1000, 0)
    // G and B never keyed — fill should not appear despite R having a full track.
    let pathTrack = clip.tracks[0]
    expect(buildSmilAnimatesForPath(pathTrack, clip.durationMs)).toEqual([])

    clip = withKeyframeSet(clip, 'path1', 'fillColorG', 0, 0)
    clip = withKeyframeSet(clip, 'path1', 'fillColorG', 1000, 255)
    clip = withKeyframeSet(clip, 'path1', 'fillColorB', 0, 0)
    clip = withKeyframeSet(clip, 'path1', 'fillColorB', 1000, 0)
    pathTrack = clip.tracks[0]
    const elements = buildSmilAnimatesForPath(pathTrack, clip.durationMs)
    expect(elements).toHaveLength(1)
    expect(elements[0]).toContain('attributeName="fill"')
    expect(elements[0]).toContain('#ff0000') // t=0: R=255,G=0,B=0
    expect(elements[0]).toContain('#00ff00') // t=1000: R=0,G=255,B=0
  })

  it('keeps fill and stroke independent of each other', () => {
    let clip = withKeyframeSet(createEmptyAnimationClip(), 'path1', 'strokeColorR', 0, 0)
    clip = withKeyframeSet(clip, 'path1', 'strokeColorR', 1000, 255)
    clip = withKeyframeSet(clip, 'path1', 'strokeColorG', 0, 0)
    clip = withKeyframeSet(clip, 'path1', 'strokeColorG', 1000, 0)
    clip = withKeyframeSet(clip, 'path1', 'strokeColorB', 0, 0)
    clip = withKeyframeSet(clip, 'path1', 'strokeColorB', 1000, 0)
    const pathTrack = clip.tracks[0]
    const elements = buildSmilAnimatesForPath(pathTrack, clip.durationMs)
    expect(elements).toHaveLength(1)
    expect(elements[0]).toContain('attributeName="stroke"')
  })
})
