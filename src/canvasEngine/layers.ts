import paper from 'paper'

/**
 * Paths carry no stored "shape type" — a rectangle drawn with the Rectangle tool and one
 * hand-drawn with the Pen tool are both just a generic paper.Path once created. Layer names
 * are inferred from geometry instead (closed/segment-count/handle shape), recomputed fresh
 * whenever the layer list is rebuilt, the same way Figma infers "Rectangle"/"Ellipse" labels.
 */
export type ShapeKind = 'Rectangle' | 'Ellipse' | 'Line' | 'Shape'

function allHandlesZero(path: paper.Path): boolean {
  return path.segments.every((s) => s.handleIn.isZero() && s.handleOut.isZero())
}

function allHandlesSet(path: paper.Path): boolean {
  return path.segments.every((s) => !s.handleIn.isZero() || !s.handleOut.isZero())
}

/** A closed 4-segment straight-edged quad (e.g. a diamond) isn't necessarily a rectangle — only one whose area fills its own bounding box is. */
function isRectangle(path: paper.Path): boolean {
  if (!path.closed || path.segments.length !== 4 || !allHandlesZero(path)) return false
  const bboxArea = path.bounds.width * path.bounds.height
  if (bboxArea <= 0) return false
  return Math.abs(Math.abs(path.area) - bboxArea) < bboxArea * 0.02
}

/** Same idea as isRectangle: a closed 4-segment curve only counts as an ellipse if its area matches an ellipse inscribed in its bounding box. */
function isEllipse(path: paper.Path): boolean {
  if (!path.closed || path.segments.length !== 4 || !allHandlesSet(path)) return false
  const { width, height } = path.bounds
  if (width <= 0 || height <= 0) return false
  const ellipseArea = Math.PI * (width / 2) * (height / 2)
  return Math.abs(Math.abs(path.area) - ellipseArea) < ellipseArea * 0.05
}

export function inferShapeKind(path: paper.Path): ShapeKind {
  if (!path.closed && path.segments.length === 2 && allHandlesZero(path)) return 'Line'
  if (isRectangle(path)) return 'Rectangle'
  if (isEllipse(path)) return 'Ellipse'
  return 'Shape'
}

export interface LayerEntry {
  id: string
  name: string
}

/**
 * Builds the Layers panel's list: one entry per path, newest/frontmost first (Paper.js layer
 * children are back-to-front, so reversed matches how layer lists conventionally read).
 * Names are the inferred shape kind, with a number suffix only when more than one path shares
 * that kind — "Rectangle" stays bare until a second rectangle exists, then both become
 * "Rectangle 1"/"Rectangle 2".
 */
export function computeLayerList(contentLayer: paper.Layer): LayerEntry[] {
  const paths = contentLayer.children.filter((child): child is paper.Path => child instanceof paper.Path)
  const kinds = paths.map(inferShapeKind)

  const totalByKind = new Map<ShapeKind, number>()
  for (const kind of kinds) totalByKind.set(kind, (totalByKind.get(kind) ?? 0) + 1)

  const seenByKind = new Map<ShapeKind, number>()
  const entries: LayerEntry[] = paths.map((path, i) => {
    const kind = kinds[i]
    const total = totalByKind.get(kind) ?? 1
    if (total <= 1) return { id: path.name, name: kind }
    const n = (seenByKind.get(kind) ?? 0) + 1
    seenByKind.set(kind, n)
    return { id: path.name, name: `${kind} ${n}` }
  })

  return entries.reverse()
}
