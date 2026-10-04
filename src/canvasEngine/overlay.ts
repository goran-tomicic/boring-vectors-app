import paper from 'paper'
import type { SelectedPathProps } from '../store/editorStore'

const NODE_HIT_TOLERANCE = 7
const ANCHOR_RADIUS = 4
const HANDLE_RADIUS = 3
const ACCENT = '#aa3bff'
const OVERLAY_LINE = 'rgba(170, 59, 255, 0.6)'
const ANCHOR_FILL = '#1c1d24'
const HANDLE_FILL = '#1c1d24'
const RESIZE_HANDLE_SIZE = 7
const ROTATE_HANDLE_RADIUS = 5
const ROTATE_HANDLE_OFFSET = 22

export type ResizeCorner = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r'

export type OverlayHit =
  | { type: 'anchor'; segmentIndex: number }
  | { type: 'handleIn'; segmentIndex: number }
  | { type: 'handleOut'; segmentIndex: number }
  | { type: 'resize'; corner: ResizeCorner }
  | { type: 'rotate' }

export function hitTestOverlay(
  overlayLayer: paper.Layer,
  point: paper.Point,
  zoom: number,
): OverlayHit | null {
  const tolerance = NODE_HIT_TOLERANCE / zoom
  let best: { hit: OverlayHit; dist: number } | null = null
  for (const child of overlayLayer.children) {
    const data = child.data as OverlayHit | undefined
    if (!data) continue
    const dist = child.position.getDistance(point)
    if (dist <= tolerance && (!best || dist < best.dist)) {
      best = { hit: data, dist }
    }
  }
  return best?.hit ?? null
}

export function clearOverlay(overlayLayer: paper.Layer) {
  overlayLayer.removeChildren()
}

export function drawSelectionHighlight(overlayLayer: paper.Layer, path: paper.Path, zoom: number) {
  new paper.Path.Rectangle({
    rectangle: path.bounds,
    strokeColor: ACCENT,
    strokeWidth: 1 / zoom,
    dashArray: [4 / zoom, 3 / zoom],
    parent: overlayLayer,
  })
}

/** Resize (8 handles around the bounds) + rotate (one handle above top-center) overlay for the Select tool's single-selection case — lets the user resize/rotate without switching to a dedicated tool. */
export function drawTransformHandles(overlayLayer: paper.Layer, path: paper.Path, zoom: number) {
  const bounds = path.bounds
  const size = RESIZE_HANDLE_SIZE / zoom
  const corners: { corner: ResizeCorner; point: paper.Point }[] = [
    { corner: 'tl', point: bounds.topLeft },
    { corner: 'tr', point: bounds.topRight },
    { corner: 'bl', point: bounds.bottomLeft },
    { corner: 'br', point: bounds.bottomRight },
    { corner: 't', point: bounds.topCenter },
    { corner: 'b', point: bounds.bottomCenter },
    { corner: 'l', point: bounds.leftCenter },
    { corner: 'r', point: bounds.rightCenter },
  ]
  for (const { corner, point } of corners) {
    const handle = new paper.Path.Rectangle({
      rectangle: new paper.Rectangle(point.subtract(size / 2), new paper.Size(size, size)),
      fillColor: ANCHOR_FILL,
      strokeColor: ACCENT,
      strokeWidth: 1.5 / zoom,
      parent: overlayLayer,
    })
    handle.data = { type: 'resize', corner } satisfies OverlayHit
  }

  const rotateAnchor = bounds.topCenter.subtract(new paper.Point(0, ROTATE_HANDLE_OFFSET / zoom))
  new paper.Path.Line({
    from: bounds.topCenter,
    to: rotateAnchor,
    strokeColor: OVERLAY_LINE,
    strokeWidth: 1 / zoom,
    parent: overlayLayer,
  })
  const rotateHandle = new paper.Path.Circle({
    center: rotateAnchor,
    radius: ROTATE_HANDLE_RADIUS / zoom,
    fillColor: HANDLE_FILL,
    strokeColor: ACCENT,
    strokeWidth: 1.5 / zoom,
    parent: overlayLayer,
  })
  rotateHandle.data = { type: 'rotate' } satisfies OverlayHit
}

/**
 * Draws node anchors (and, when `showHandles`, each node's in/out bezier handles). The Select
 * tool uses `showHandles: false` to show anchors — so a node can be clicked straight from
 * Select without first switching to the Node tool — without the handle-line clutter that's
 * only useful once a specific node is actively being edited.
 */
/** A small floating label near the cursor during a resize/rotate drag (e.g. "42°", "120×80") — the on-canvas feedback a user needs to see the value they're dragging to, since neither gesture has any other live readout while in progress. */
export function drawTransformLabel(overlayLayer: paper.Layer, anchor: paper.Point, text: string, zoom: number) {
  const point = anchor.add(new paper.Point(14 / zoom, -14 / zoom))
  const label = new paper.PointText({
    point,
    content: text,
    fillColor: '#ffffff',
    fontSize: 12 / zoom,
    fontWeight: 'bold',
    parent: overlayLayer,
  })
  const padding = 4 / zoom
  const background = new paper.Path.Rectangle({
    rectangle: label.bounds.expand(padding * 2),
    radius: 3 / zoom,
    fillColor: ACCENT,
    parent: overlayLayer,
  })
  background.insertBelow(label)
}

export function drawNodeOverlay(
  overlayLayer: paper.Layer,
  path: paper.Path,
  zoom: number,
  selectedSegmentIndex: number | null,
  showHandles = true,
) {
  const anchorRadius = ANCHOR_RADIUS / zoom
  const handleRadius = HANDLE_RADIUS / zoom

  path.segments.forEach((segment, index) => {
    const isSelected = index === selectedSegmentIndex

    if (showHandles && !segment.handleIn.isZero()) {
      const handlePoint = segment.point.add(segment.handleIn)
      new paper.Path.Line({
        from: segment.point,
        to: handlePoint,
        strokeColor: OVERLAY_LINE,
        strokeWidth: 1 / zoom,
        parent: overlayLayer,
      })
      const circle = new paper.Path.Circle({
        center: handlePoint,
        radius: handleRadius,
        fillColor: HANDLE_FILL,
        strokeColor: ACCENT,
        strokeWidth: 1 / zoom,
        parent: overlayLayer,
      })
      circle.data = { type: 'handleIn', segmentIndex: index } satisfies OverlayHit
    }

    if (showHandles && !segment.handleOut.isZero()) {
      const handlePoint = segment.point.add(segment.handleOut)
      new paper.Path.Line({
        from: segment.point,
        to: handlePoint,
        strokeColor: OVERLAY_LINE,
        strokeWidth: 1 / zoom,
        parent: overlayLayer,
      })
      const circle = new paper.Path.Circle({
        center: handlePoint,
        radius: handleRadius,
        fillColor: HANDLE_FILL,
        strokeColor: ACCENT,
        strokeWidth: 1 / zoom,
        parent: overlayLayer,
      })
      circle.data = { type: 'handleOut', segmentIndex: index } satisfies OverlayHit
    }

    const anchor = new paper.Path.Circle({
      center: segment.point,
      radius: anchorRadius,
      fillColor: isSelected ? ACCENT : ANCHOR_FILL,
      strokeColor: ACCENT,
      strokeWidth: 1.5 / zoom,
      parent: overlayLayer,
    })
    anchor.data = { type: 'anchor', segmentIndex: index } satisfies OverlayHit
  })
}

/** paper.Color#toCSS() emits rgb()/hsl() for non-RGB color spaces — always build a plain hex string instead, since PropsPanel's ColorPicker only parses #rrggbb. */
function colorToHex(color: paper.Color): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255)))
  return `#${[color.red, color.green, color.blue].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`
}

export function computeSelectedPathProps(
  path: paper.Path,
  selectedSegmentIndex: number | null,
): SelectedPathProps {
  const segment =
    selectedSegmentIndex !== null ? path.segments[selectedSegmentIndex] : undefined

  return {
    x: path.bounds.x,
    y: path.bounds.y,
    width: path.bounds.width,
    height: path.bounds.height,
    node: segment ? { x: segment.point.x, y: segment.point.y } : null,
    handleIn:
      segment && !segment.handleIn.isZero()
        ? {
            x: segment.point.x + segment.handleIn.x,
            y: segment.point.y + segment.handleIn.y,
          }
        : null,
    handleOut:
      segment && !segment.handleOut.isZero()
        ? {
            x: segment.point.x + segment.handleOut.x,
            y: segment.point.y + segment.handleOut.y,
          }
        : null,
    strokeColor: path.strokeColor ? colorToHex(path.strokeColor) : null,
    strokeOpacity: path.strokeColor ? path.strokeColor.alpha : 1,
    strokeWidth: path.strokeWidth,
    fillColor: path.fillColor ? colorToHex(path.fillColor) : null,
    fillOpacity: path.fillColor ? path.fillColor.alpha : 1,
    opacity: path.opacity,
    nodeCount: path.segments.length,
    closed: path.closed,
  }
}
