import paper from 'paper'

const SELECT_HIT_TOLERANCE = 6

export function findPathById(contentLayer: paper.Layer, id: string | null): paper.Path | null {
  if (!id) return null
  const match = contentLayer.children.find((child) => String(child.id) === id)
  return match instanceof paper.Path ? match : null
}

export function hitTestPath(contentLayer: paper.Layer, point: paper.Point, zoom: number) {
  const result = contentLayer.hitTest(point, {
    fill: true,
    stroke: true,
    tolerance: SELECT_HIT_TOLERANCE / zoom,
  })
  if (!result) return null
  const item = result.item
  return item instanceof paper.Path ? item : null
}

export function findNearestLocation(
  contentLayer: paper.Layer,
  point: paper.Point,
  toleranceProject: number,
): paper.CurveLocation | null {
  let best: paper.CurveLocation | null = null
  let bestDist = Infinity
  for (const child of contentLayer.children) {
    if (!(child instanceof paper.Path)) continue
    const location = child.getNearestLocation(point)
    if (!location) continue
    const dist = location.point.getDistance(point)
    if (dist < bestDist) {
      bestDist = dist
      best = location
    }
  }
  return best && bestDist <= toleranceProject ? best : null
}

export function isTextInputFocused() {
  const active = document.activeElement
  if (!active) return false
  const tag = active.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA'
}
