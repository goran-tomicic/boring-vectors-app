import { describe, it, expect } from 'vitest'
import paper from 'paper'
import { computeResizedBounds, computeResizedBoundsFromCenter } from './tools'

// paper.Rectangle/Point are plain geometry classes — no canvas/DOM needed, so this is safe
// to unit-test in Vitest's node environment without a paper.setup() scope.
function rect(x: number, y: number, w: number, h: number) {
  return new paper.Rectangle(new paper.Point(x, y), new paper.Size(w, h))
}

describe('computeResizedBounds', () => {
  const start = rect(100, 100, 200, 100) // left 100, top 100, right 300, bottom 200

  it('br corner: drags the bottom-right edge, anchors top-left', () => {
    const next = computeResizedBounds(start, 'br', new paper.Point(350, 250), false)
    expect(next.left).toBe(100)
    expect(next.top).toBe(100)
    expect(next.right).toBe(350)
    expect(next.bottom).toBe(250)
  })

  it('tl corner: drags the top-left edge, anchors bottom-right', () => {
    const next = computeResizedBounds(start, 'tl', new paper.Point(50, 50), false)
    expect(next.left).toBe(50)
    expect(next.top).toBe(50)
    expect(next.right).toBe(300)
    expect(next.bottom).toBe(200)
  })

  it('edge handles only move one axis', () => {
    const r = computeResizedBounds(start, 'r', new paper.Point(400, 999), false)
    expect(r.right).toBe(400)
    expect(r.left).toBe(100)
    expect(r.top).toBe(100)
    expect(r.bottom).toBe(200)

    const b = computeResizedBounds(start, 'b', new paper.Point(999, 400), false)
    expect(b.bottom).toBe(400)
    expect(b.top).toBe(100)
    expect(b.left).toBe(100)
    expect(b.right).toBe(300)
  })

  it('keepAspect preserves the start aspect ratio on a corner drag', () => {
    // start is 200x100 (2:1). Dragging br to (300+200, 100+200) = (500,300) without aspect
    // lock would give 400x200 (still 2:1 incidentally) — use a non-matching drag instead.
    const next = computeResizedBounds(start, 'br', new paper.Point(500, 150), true)
    const aspect = next.width / next.height
    expect(aspect).toBeCloseTo(2, 5)
  })

  it('keepAspect is ignored on edge handles (only one axis is user-controlled)', () => {
    const next = computeResizedBounds(start, 'r', new paper.Point(500, 999), true)
    expect(next.width).toBe(400)
    expect(next.height).toBe(100)
  })

  it('clamps to a minimum size instead of collapsing or inverting', () => {
    const next = computeResizedBounds(start, 'br', new paper.Point(100, 100), false)
    expect(next.width).toBeGreaterThan(0)
    expect(next.height).toBeGreaterThan(0)
    expect(next.left).toBe(100)
    expect(next.top).toBe(100)
  })

  it('clamps from the correct anchor when dragging past the opposite edge', () => {
    // Dragging tl past the bottom-right anchor should clamp width/height to the minimum,
    // keeping the anchor (bottom-right) fixed rather than flipping left/top past it.
    const next = computeResizedBounds(start, 'tl', new paper.Point(400, 300), false)
    expect(next.right).toBe(300)
    expect(next.bottom).toBe(200)
    expect(next.width).toBeGreaterThan(0)
    expect(next.height).toBeGreaterThan(0)
  })
})

describe('computeResizedBoundsFromCenter', () => {
  const start = rect(100, 100, 200, 100) // center at (200, 150)

  it('corner handle: grows symmetrically about the center on both axes', () => {
    const next = computeResizedBoundsFromCenter(start, 'br', new paper.Point(300, 200), false)
    // point is 100 right / 50 down from center -> half extents 100/50 on both sides
    expect(next.left).toBe(100)
    expect(next.right).toBe(300)
    expect(next.top).toBe(100)
    expect(next.bottom).toBe(200)
  })

  it('edge handle: only its own axis changes, centered; the other axis keeps its original size', () => {
    const next = computeResizedBoundsFromCenter(start, 'r', new paper.Point(400, 999), false)
    expect(next.left).toBe(0) // center.x(200) - halfW(200)
    expect(next.right).toBe(400)
    expect(next.top).toBe(100) // unchanged
    expect(next.bottom).toBe(200)
  })

  it('keepAspect preserves the start aspect ratio on a corner drag', () => {
    const next = computeResizedBoundsFromCenter(start, 'br', new paper.Point(500, 160), true)
    expect(next.width / next.height).toBeCloseTo(2, 5)
  })

  it('center stays fixed regardless of which corner is dragged', () => {
    const center = start.center
    const next = computeResizedBoundsFromCenter(start, 'tl', new paper.Point(50, 50), false)
    expect(next.center.x).toBeCloseTo(center.x, 5)
    expect(next.center.y).toBeCloseTo(center.y, 5)
  })

  it('clamps to a minimum size instead of collapsing', () => {
    const next = computeResizedBoundsFromCenter(start, 'br', new paper.Point(201, 151), false)
    expect(next.width).toBeGreaterThan(0)
    expect(next.height).toBeGreaterThan(0)
  })
})
