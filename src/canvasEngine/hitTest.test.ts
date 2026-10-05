import { describe, it, expect, beforeEach } from 'vitest'
import paper from 'paper'
import {
  generatePathName,
  ensurePathName,
  findPathById,
  findPathsByIds,
  hitTestPath,
  findNearestLocation,
} from './hitTest'

let scope: paper.PaperScope
let contentLayer: paper.Layer

beforeEach(() => {
  scope = new paper.PaperScope()
  scope.setup(new paper.Size(800, 600))
  contentLayer = new scope.Layer()
})

function rectangle(id?: string) {
  const p = new scope.Path.Rectangle({ point: [100, 100], size: [100, 100], parent: contentLayer })
  if (id) p.name = id
  return p
}

describe('generatePathName / ensurePathName', () => {
  it('generates distinct names', () => {
    expect(generatePathName()).not.toBe(generatePathName())
  })

  it('assigns a name only when missing', () => {
    const p = rectangle()
    expect(p.name).toBeFalsy()
    const assigned = ensurePathName(p)
    expect(p.name).toBe(assigned)

    const p2 = rectangle('kept')
    expect(ensurePathName(p2)).toBe('kept')
  })
})

describe('findPathById / findPathsByIds', () => {
  it('finds a path by its name, keyed by name not Paper.js .id', () => {
    const p = rectangle('a')
    expect(findPathById(contentLayer, 'a')).toBe(p)
    expect(findPathById(contentLayer, 'missing')).toBeNull()
    expect(findPathById(contentLayer, null)).toBeNull()
  })

  it('ignores non-path children with a matching name', () => {
    const group = new scope.Group({ parent: contentLayer })
    group.name = 'a'
    expect(findPathById(contentLayer, 'a')).toBeNull()
  })

  it('finds multiple paths by id, skipping ones that no longer exist', () => {
    rectangle('a')
    rectangle('b')
    const found = findPathsByIds(contentLayer, ['a', 'missing', 'b'])
    expect(found.map((p) => p.name)).toEqual(['a', 'b'])
  })
})

describe('hitTestPath', () => {
  it('hits a path whose fill contains the point', () => {
    const p = rectangle('a')
    p.fillColor = new paper.Color('black')
    expect(hitTestPath(contentLayer, new paper.Point(150, 150), 1)).toBe(p)
  })

  it('misses empty space, even within the bounding box of a non-filled shape', () => {
    rectangle('a') // no fill, no stroke
    expect(hitTestPath(contentLayer, new paper.Point(150, 150), 1)).toBeNull()
  })

  it('returns null for a point well outside any path', () => {
    const p = rectangle('a')
    p.fillColor = new paper.Color('black')
    expect(hitTestPath(contentLayer, new paper.Point(700, 500), 1)).toBeNull()
  })
})

describe('findNearestLocation', () => {
  it('finds the nearest point on a path within tolerance', () => {
    const p = rectangle('a')
    // (150, 100) sits exactly on the rectangle's top edge.
    const loc = findNearestLocation(contentLayer, new paper.Point(150, 95), 10)
    expect(loc).not.toBeNull()
    expect(loc!.path).toBe(p)
    expect(loc!.point.y).toBeCloseTo(100, 0)
  })

  it('returns null when nothing is within tolerance', () => {
    rectangle('a')
    expect(findNearestLocation(contentLayer, new paper.Point(150, 50), 5)).toBeNull()
  })

  it('picks the closer of two candidate paths', () => {
    const near = rectangle('near') // top edge at y=100
    const far = new scope.Path.Rectangle({ point: [100, 300], size: [100, 100], parent: contentLayer })
    far.name = 'far'
    const loc = findNearestLocation(contentLayer, new paper.Point(150, 96), 20)
    expect(loc!.path).toBe(near)
    void far
  })
})
