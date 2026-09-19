import paper from 'paper'

const AUTOSAVE_KEY = 'boring-vectors:autosave'

export interface AutosavePayload {
  svg: string
  canvasWidth: number
  canvasHeight: number
}

export function loadAutosave(): AutosavePayload | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AutosavePayload
  } catch {
    return null
  }
}

export function saveAutosave(payload: AutosavePayload) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload))
  } catch {
    // Storage full or unavailable — autosave is best-effort.
  }
}

export function importSvgIntoContent(
  contentLayer: paper.Layer,
  svg: string,
  artboardWidth: number,
  artboardHeight: number,
  center: boolean = true,
): paper.Path | null {
  const imported = contentLayer.importSVG(svg, { expandShapes: true })

  let paths: paper.Path[]
  if (imported instanceof paper.Path) {
    paths = [imported]
  } else {
    paths = imported.getItems({ class: paper.Path }) as paper.Path[]
    for (const path of paths) {
      path.parent = contentLayer
    }
    imported.remove()
  }

  if (paths.length === 0) return null

  if (center) {
    let bounds = paths[0].bounds
    for (const path of paths.slice(1)) {
      bounds = bounds.unite(path.bounds)
    }
    const target = new paper.Point(artboardWidth / 2, artboardHeight / 2)
    const delta = target.subtract(bounds.center)
    for (const path of paths) {
      path.position = path.position.add(delta)
    }
  }

  return paths[paths.length - 1]
}
