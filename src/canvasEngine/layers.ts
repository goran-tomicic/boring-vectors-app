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
 *
 * A path with a user-given name in `nameOverrides` (keyed by path id) uses that name as-is and
 * is excluded from the inferred-kind numbering below — renaming a shape takes it out of the
 * auto-naming pool entirely, so the remaining un-renamed shapes of that kind renumber as if it
 * were never there (e.g. renaming "Rectangle 2" to "Background" leaves the other one as plain
 * "Rectangle", not "Rectangle 1").
 *
 * Everything else is named by its inferred shape kind, with a number suffix only when more
 * than one (un-renamed) path shares that kind — "Rectangle" stays bare until a second
 * rectangle exists, then both become "Rectangle 1"/"Rectangle 2".
 */
export function computeLayerList(
  contentLayer: paper.Layer,
  nameOverrides: Record<string, string> = {},
): LayerEntry[] {
  const paths = contentLayer.children.filter((child): child is paper.Path => child instanceof paper.Path)
  const autoNamed = paths.filter((path) => !nameOverrides[path.name])
  const kinds = autoNamed.map(inferShapeKind)

  const totalByKind = new Map<ShapeKind, number>()
  for (const kind of kinds) totalByKind.set(kind, (totalByKind.get(kind) ?? 0) + 1)

  const seenByKind = new Map<ShapeKind, number>()
  const autoNames = new Map<string, string>()
  autoNamed.forEach((path, i) => {
    const kind = kinds[i]
    const total = totalByKind.get(kind) ?? 1
    if (total <= 1) {
      autoNames.set(path.name, kind)
      return
    }
    const n = (seenByKind.get(kind) ?? 0) + 1
    seenByKind.set(kind, n)
    autoNames.set(path.name, `${kind} ${n}`)
  })

  const entries: LayerEntry[] = paths.map((path) => ({
    id: path.name,
    name: nameOverrides[path.name] ?? autoNames.get(path.name) ?? 'Shape',
  }))

  return entries.reverse()
}
