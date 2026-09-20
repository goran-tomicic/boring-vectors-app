import paper from 'paper'

export function importSvgIntoContent(
  contentLayer: paper.Layer,
  svg: string,
  artboardWidth: number,
  artboardHeight: number,
  center: boolean = true,
): paper.Path | null {
  const imported = contentLayer.importSVG(svg, { expandShapes: true })
  if (!imported) return null

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
