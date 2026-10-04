import { describe, it, expect, beforeEach } from 'vitest'
import paper from 'paper'
import { inferShapeKind, computeLayerList } from './layers'

let scope: paper.PaperScope
let contentLayer: paper.Layer

beforeEach(() => {
  scope = new paper.PaperScope()
  scope.setup(new paper.Size(800, 600))
  contentLayer = new scope.Layer()
})

function rectangle(id: string) {
  const p = new scope.Path.Rectangle({ point: [0, 0], size: [40, 20], parent: contentLayer })
  p.name = id
  return p
}
function ellipse(id: string) {
  const p = new scope.Path.Ellipse({ center: [0, 0], radius: [20, 10], parent: contentLayer })
  p.name = id
  return p
}
function line(id: string) {
  const p = new scope.Path({ segments: [[0, 0], [10, 10]], parent: contentLayer })
  p.name = id
  return p
}
function freeform(id: string) {
  const p = new scope.Path({ segments: [[0, 0], [5, 5], [10, 0], [5, -5]], closed: true, parent: contentLayer })
  p.name = id
  return p
}

describe('inferShapeKind', () => {
  it('recognizes a rectangle (closed, 4 segments, no handles)', () => {
    expect(inferShapeKind(rectangle('a'))).toBe('Rectangle')
  })
  it('recognizes an ellipse (closed, 4 segments, all handles set)', () => {
    expect(inferShapeKind(ellipse('a'))).toBe('Ellipse')
  })
  it('recognizes a line (open, 2 segments, no handles)', () => {
    expect(inferShapeKind(line('a'))).toBe('Line')
  })
  it('falls back to Shape for anything else (e.g. a free-form closed polygon)', () => {
    expect(inferShapeKind(freeform('a'))).toBe('Shape')
  })
})

describe('computeLayerList', () => {
  it('leaves a sole shape of its kind unnumbered', () => {
    rectangle('r1')
    expect(computeLayerList(contentLayer)).toEqual([{ id: 'r1', name: 'Rectangle' }])
  })

  it('numbers shapes only once more than one of a kind exists', () => {
    rectangle('r1')
    rectangle('r2')
    ellipse('e1')
    const list = computeLayerList(contentLayer)
    expect(list).toEqual([
      { id: 'e1', name: 'Ellipse' },
      { id: 'r2', name: 'Rectangle 2' },
      { id: 'r1', name: 'Rectangle 1' },
    ])
  })

  it('orders frontmost-first (reverse of Paper.js back-to-front child order)', () => {
    rectangle('back')
    rectangle('front')
    const list = computeLayerList(contentLayer)
    expect(list.map((l) => l.id)).toEqual(['front', 'back'])
  })

  it('ignores non-path children', () => {
    rectangle('r1')
    new scope.Group({ parent: contentLayer })
    expect(computeLayerList(contentLayer)).toHaveLength(1)
  })

  it('uses a name override as-is instead of the inferred kind', () => {
    rectangle('r1')
    expect(computeLayerList(contentLayer, { r1: 'Background' })).toEqual([{ id: 'r1', name: 'Background' }])
  })

  it('excludes renamed paths from kind numbering, so the rest renumber as if it were never there', () => {
    rectangle('r1')
    rectangle('r2')
    const list = computeLayerList(contentLayer, { r2: 'Background' })
    expect(list).toEqual([
      { id: 'r2', name: 'Background' },
      { id: 'r1', name: 'Rectangle' },
    ])
  })
})
