import paper from 'paper'
import type { SelectedPathProps } from '../store/editorStore'

const NODE_HIT_TOLERANCE = 7
const ANCHOR_RADIUS = 4
const HANDLE_RADIUS = 3
const ACCENT = '#aa3bff'
const OVERLAY_LINE = 'rgba(170, 59, 255, 0.6)'
const ANCHOR_FILL = '#1c1d24'
const HANDLE_FILL = '#1c1d24'

export type OverlayHit =
  | { type: 'anchor'; segmentIndex: number }
  | { type: 'handleIn'; segmentIndex: number }
  | { type: 'handleOut'; segmentIndex: number }

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

export function drawNodeOverlay(
  overlayLayer: paper.Layer,
  path: paper.Path,
  zoom: number,
  selectedSegmentIndex: number | null,
) {
  const anchorRadius = ANCHOR_RADIUS / zoom
  const handleRadius = HANDLE_RADIUS / zoom

  path.segments.forEach((segment, index) => {
    const isSelected = index === selectedSegmentIndex

    if (!segment.handleIn.isZero()) {
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

    if (!segment.handleOut.isZero()) {
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
    strokeColor: path.strokeColor ? path.strokeColor.toCSS(true) : '#000000',
    strokeWidth: path.strokeWidth,
    fillColor: path.fillColor ? path.fillColor.toCSS(true) : null,
    nodeCount: path.segments.length,
    closed: path.closed,
  }
}
