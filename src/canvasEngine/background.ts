import paper from 'paper'

const VIEW_PADDING = 40
const GRID_SIZE = 20
const GRID_MAJOR_EVERY = 5
const GRID_MINOR_COLOR = '#2a2b33'
const GRID_MAJOR_COLOR = '#35363f'
const RULER_COLOR = '#6b6d78'
const ARTBOARD_FILL = '#1f2028'
const ARTBOARD_STROKE = '#35363f'

export function drawBackground(
  layer: paper.Layer,
  width: number,
  height: number,
  showGrid: boolean,
) {
  layer.removeChildren()

  new paper.Path.Rectangle({
    point: [0, 0],
    size: [width, height],
    fillColor: ARTBOARD_FILL,
    strokeColor: ARTBOARD_STROKE,
    strokeWidth: 1,
    parent: layer,
  })

  if (!showGrid) return

  const cols = Math.floor(width / GRID_SIZE)
  const rows = Math.floor(height / GRID_SIZE)

  for (let c = 0; c <= cols; c++) {
    const x = c * GRID_SIZE
    const isMajor = c % GRID_MAJOR_EVERY === 0
    new paper.Path.Line({
      from: [x, 0],
      to: [x, height],
      strokeColor: isMajor ? GRID_MAJOR_COLOR : GRID_MINOR_COLOR,
      strokeWidth: isMajor ? 1 : 0.5,
      parent: layer,
    })
  }

  for (let r = 0; r <= rows; r++) {
    const y = r * GRID_SIZE
    const isMajor = r % GRID_MAJOR_EVERY === 0
    new paper.Path.Line({
      from: [0, y],
      to: [width, y],
      strokeColor: isMajor ? GRID_MAJOR_COLOR : GRID_MINOR_COLOR,
      strokeWidth: isMajor ? 1 : 0.5,
      parent: layer,
    })
  }

  drawRulers(layer, width, height)
}

function drawRulers(layer: paper.Layer, width: number, height: number) {
  for (let c = 0; c <= Math.floor(width / GRID_SIZE); c += GRID_MAJOR_EVERY) {
    const x = c * GRID_SIZE
    new paper.Path.Line({
      from: [x, -6],
      to: [x, 0],
      strokeColor: RULER_COLOR,
      strokeWidth: 1,
      parent: layer,
    })
    new paper.PointText({
      point: [x + 2, -10],
      content: String(x),
      fillColor: RULER_COLOR,
      fontSize: 9,
      parent: layer,
    })
  }

  for (let r = 0; r <= Math.floor(height / GRID_SIZE); r += GRID_MAJOR_EVERY) {
    const y = r * GRID_SIZE
    new paper.Path.Line({
      from: [-6, y],
      to: [0, y],
      strokeColor: RULER_COLOR,
      strokeWidth: 1,
      parent: layer,
    })
    new paper.PointText({
      point: [-24, y + 3],
      content: String(y),
      fillColor: RULER_COLOR,
      fontSize: 9,
      parent: layer,
    })
  }
}

export function fitCanvasInView(view: paper.View, width: number, height: number) {
  const scale = Math.min(
    (view.viewSize.width - VIEW_PADDING * 2) / width,
    (view.viewSize.height - VIEW_PADDING * 2) / height,
  )
  view.zoom = scale > 0 ? scale : 1
  view.center = new paper.Point(width / 2, height / 2)
}
