import { describe, it, expect, beforeEach } from 'vitest'
import paper from 'paper'
import { computeSelectionBounds } from './overlay'

let scope: paper.PaperScope
let contentLayer: paper.Layer

beforeEach(() => {
  scope = new paper.PaperScope()
  scope.setup(new paper.Size(800, 600))
  contentLayer = new scope.Layer()
})

function rectAt(x: number, y: number, w: number, h: number) {
  return new scope.Path.Rectangle({ point: [x, y], size: [w, h], parent: contentLayer })
}

describe('computeSelectionBounds', () => {
  it('returns null for an empty selection', () => {
    expect(computeSelectionBounds([])).toBeNull()
  })

  it('returns a single path\'s own bounds', () => {
    const path = rectAt(10, 20, 30, 40)
    expect(computeSelectionBounds([path])).toEqual({ x: 10, y: 20, width: 30, height: 40 })
  })

  it('unions bounds across multiple disjoint paths', () => {
    const a = rectAt(0, 0, 10, 10)
    const b = rectAt(100, 50, 20, 20)
    expect(computeSelectionBounds([a, b])).toEqual({ x: 0, y: 0, width: 120, height: 70 })
  })

  it('unions bounds across overlapping paths', () => {
    const a = rectAt(0, 0, 50, 50)
    const b = rectAt(25, 25, 50, 50)
    expect(computeSelectionBounds([a, b])).toEqual({ x: 0, y: 0, width: 75, height: 75 })
  })
})
