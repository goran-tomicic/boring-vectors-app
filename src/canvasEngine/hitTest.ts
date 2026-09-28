import paper from 'paper'

const SELECT_HIT_TOLERANCE = 6

/** Stable identifier assigned to a path at creation time — see the note on findPathById below. */
export function generatePathName(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Ensures a path has a stable name, assigning one if it's missing (e.g. pasted SVG with no id attribute). */
export function ensurePathName(path: paper.Path): string {
  if (!path.name) path.name = generatePathName()
  return path.name
}

// Keyed by path.name, not Paper.js's auto-incrementing .id — .id is a per-session counter
// that gets reassigned on every reload/re-import, so it can't identify a path across saves.
// .name is assigned once at path-creation time (see svgIO.ts, tools.ts) and round-trips
// through SVG export/import as the standard "id" attribute, so it stays stable.
export function findPathById(contentLayer: paper.Layer, id: string | null): paper.Path | null {
  if (!id) return null
  const match = contentLayer.children.find((child) => child.name === id)
  return match instanceof paper.Path ? match : null
}

export function findPathsByIds(contentLayer: paper.Layer, ids: string[]): paper.Path[] {
  return ids
    .map((id) => findPathById(contentLayer, id))
    .filter((path): path is paper.Path => path !== null)
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
