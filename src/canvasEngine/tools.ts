import paper from 'paper'
import type { EditorState } from '../store/editorStore'
import { findPathById, findPathsByIds, hitTestPath, findNearestLocation } from './hitTest'
import { type OverlayHit, hitTestOverlay } from './overlay'

export const ACCENT = '#aa3bff'
export const MARQUEE_FILL = 'rgba(170, 59, 255, 0.12)'
export const ANCHOR_RADIUS = 4
export const ADD_POINT_TOLERANCE = 12
export const MIN_SEGMENTS = 2
export const PEN_CLOSE_TOLERANCE = 10
export const NEW_SHAPE_FILL = '#c084fc'
export const NEW_SHAPE_STROKE = '#000000'

/** Shared dependencies every tool factory closes over — one per PaperCanvas mount. */
export interface ToolContext {
  scope: paper.PaperScope
  contentLayer: paper.Layer
  overlayLayer: paper.Layer
  storeRef: { current: EditorState }
  redrawOverlay: () => void
  commitHistory: () => void
}

export function createSelectTool(ctx: ToolContext): paper.Tool {
  const { scope, contentLayer, overlayLayer, storeRef, redrawOverlay, commitHistory } = ctx
  let dragPaths: paper.Path[] = []
  let marqueeStart: paper.Point | null = null
  let marqueeAdditive = false
  let marqueeRect: paper.Path | null = null

  const tool = new scope.Tool()
  tool.onMouseDown = (event: paper.ToolEvent) => {
    const hit = hitTestPath(contentLayer, event.point, scope.view.zoom)
    const { selectedPathIds } = storeRef.current
    marqueeStart = null
    dragPaths = []

    if (hit) {
      const hitId = String(hit.id)
      if (event.modifiers.shift) {
        const already = selectedPathIds.includes(hitId)
        storeRef.current.setSelection(
          already ? selectedPathIds.filter((id) => id !== hitId) : [...selectedPathIds, hitId],
        )
      } else if (selectedPathIds.includes(hitId) && selectedPathIds.length > 1) {
        // Clicking a member of an existing multi-selection drags the whole group.
        dragPaths = findPathsByIds(contentLayer, selectedPathIds)
      } else {
        storeRef.current.setSelection([hitId])
        dragPaths = [hit]
      }
    } else if (event.modifiers.shift) {
      marqueeAdditive = true
      marqueeStart = event.point
    } else {
      storeRef.current.clearSelection()
      marqueeAdditive = false
      marqueeStart = event.point
    }
    redrawOverlay()
  }
  tool.onMouseDrag = (event: paper.ToolEvent) => {
    if (dragPaths.length > 0) {
      for (const path of dragPaths) {
        path.position = path.position.add(event.delta)
      }
      redrawOverlay()
      return
    }
    if (marqueeStart) {
      if (marqueeRect) marqueeRect.remove()
      marqueeRect = new paper.Path.Rectangle({
        rectangle: new paper.Rectangle(marqueeStart, event.point),
        strokeColor: ACCENT,
        strokeWidth: 1 / scope.view.zoom,
        fillColor: MARQUEE_FILL,
        parent: overlayLayer,
      })
    }
  }
  tool.onMouseUp = (event: paper.ToolEvent) => {
    if (dragPaths.length > 0) {
      dragPaths = []
      commitHistory()
      return
    }
    if (marqueeStart) {
      const rect = new paper.Rectangle(marqueeStart, event.point)
      if (marqueeRect) {
        marqueeRect.remove()
        marqueeRect = null
      }
      const hitIds = contentLayer.children
        .filter((child): child is paper.Path => child instanceof paper.Path && rect.intersects(child.bounds))
        .map((path) => String(path.id))
      const nextIds = marqueeAdditive
        ? Array.from(new Set([...storeRef.current.selectedPathIds, ...hitIds]))
        : hitIds
      storeRef.current.setSelection(nextIds)
      marqueeStart = null
      redrawOverlay()
    }
  }
  return tool
}

export function createNodeTool(ctx: ToolContext): paper.Tool {
  const { scope, contentLayer, overlayLayer, storeRef, redrawOverlay, commitHistory } = ctx
  let dragPath: paper.Path | null = null
  let drag: OverlayHit | null = null

  const tool = new scope.Tool()
  tool.onMouseDown = (event: paper.ToolEvent) => {
    const { selectedPathIds } = storeRef.current
    const activePath =
      selectedPathIds.length === 1 ? findPathById(contentLayer, selectedPathIds[0]) : null

    if (activePath) {
      const overlayHit = hitTestOverlay(overlayLayer, event.point, scope.view.zoom)
      if (overlayHit) {
        dragPath = activePath
        drag = overlayHit
        if (overlayHit.type === 'anchor') {
          storeRef.current.setSelection([String(activePath.id)], overlayHit.segmentIndex)
        }
        redrawOverlay()
        return
      }
    }

    const hit = hitTestPath(contentLayer, event.point, scope.view.zoom)
    dragPath = null
    drag = null
    storeRef.current.setSelection(hit ? [String(hit.id)] : [])
    redrawOverlay()
  }
  tool.onMouseDrag = (event: paper.ToolEvent) => {
    if (!dragPath || !drag) return
    const segment = dragPath.segments[drag.segmentIndex]
    if (!segment) return

    if (drag.type === 'anchor') {
      segment.point = segment.point.add(event.delta)
    } else if (drag.type === 'handleIn') {
      segment.handleIn = segment.handleIn.add(event.delta)
      if (!event.modifiers.alt) {
        segment.handleOut = segment.handleIn.multiply(-1)
      }
    } else if (drag.type === 'handleOut') {
      segment.handleOut = segment.handleOut.add(event.delta)
      if (!event.modifiers.alt) {
        segment.handleIn = segment.handleOut.multiply(-1)
      }
    }
    redrawOverlay()
  }
  tool.onMouseUp = () => {
    dragPath = null
    drag = null
    commitHistory()
  }
  return tool
}

export function createAddPointTool(ctx: ToolContext): paper.Tool {
  const { scope, contentLayer, overlayLayer, storeRef, redrawOverlay, commitHistory } = ctx
  let hoverMarker: paper.Path.Circle | null = null

  const tool = new scope.Tool()
  tool.onMouseMove = (event: paper.ToolEvent) => {
    const zoom = scope.view.zoom
    const location = findNearestLocation(contentLayer, event.point, ADD_POINT_TOLERANCE / zoom)
    if (hoverMarker) {
      hoverMarker.remove()
      hoverMarker = null
    }
    if (location) {
      hoverMarker = new paper.Path.Circle({
        center: location.point,
        radius: ANCHOR_RADIUS / zoom,
        fillColor: ACCENT,
        parent: overlayLayer,
      })
    }
  }
  tool.onMouseDown = (event: paper.ToolEvent) => {
    const zoom = scope.view.zoom
    const location = findNearestLocation(contentLayer, event.point, ADD_POINT_TOLERANCE / zoom)
    if (!location || !(location.path instanceof paper.Path)) return
    location.path.divideAt(location)
    storeRef.current.setSelection([String(location.path.id)])
    redrawOverlay()
    commitHistory()
  }
  return tool
}

export function createRulerTool(ctx: ToolContext): paper.Tool {
  const { scope, overlayLayer } = ctx
  let rulerStart: paper.Point | null = null
  let rulerLine: paper.Path | null = null
  let rulerText: paper.PointText | null = null
  const clearRulerOverlay = () => {
    if (rulerLine) {
      rulerLine.remove()
      rulerLine = null
    }
    if (rulerText) {
      rulerText.remove()
      rulerText = null
    }
  }

  const tool = new scope.Tool()
  tool.onMouseDown = (event: paper.ToolEvent) => {
    clearRulerOverlay()
    rulerStart = event.point
  }
  tool.onMouseDrag = (event: paper.ToolEvent) => {
    if (!rulerStart) return
    clearRulerOverlay()
    const zoom = scope.view.zoom
    rulerLine = new paper.Path.Line({
      from: rulerStart,
      to: event.point,
      strokeColor: ACCENT,
      strokeWidth: 1.5 / zoom,
      dashArray: [4 / zoom, 3 / zoom],
      parent: overlayLayer,
    })
    const distance = rulerStart.getDistance(event.point)
    const angle = event.point.subtract(rulerStart).angle
    const mid = rulerStart.add(event.point).divide(2)
    rulerText = new paper.PointText({
      point: mid.add(new paper.Point(6 / zoom, -6 / zoom)),
      content: `${distance.toFixed(1)}px, ${angle.toFixed(1)}°`,
      fillColor: ACCENT,
      fontSize: 11 / zoom,
      parent: overlayLayer,
    })
  }
  tool.onMouseUp = () => {
    rulerStart = null
  }
  return tool
}

export function createShapeTool(ctx: ToolContext, kind: 'rectangle' | 'ellipse'): paper.Tool {
  const { scope, contentLayer, storeRef, redrawOverlay, commitHistory } = ctx
  let shapeStart: paper.Point | null = null
  let shapePreview: paper.Path | null = null

  const tool = new scope.Tool()
  tool.onMouseDown = (event: paper.ToolEvent) => {
    shapeStart = event.point
  }
  tool.onMouseDrag = (event: paper.ToolEvent) => {
    if (!shapeStart) return
    if (shapePreview) shapePreview.remove()
    let corner = event.point
    if (event.modifiers.shift) {
      const size = Math.max(Math.abs(corner.x - shapeStart.x), Math.abs(corner.y - shapeStart.y))
      corner = new paper.Point(
        shapeStart.x + Math.sign(corner.x - shapeStart.x || 1) * size,
        shapeStart.y + Math.sign(corner.y - shapeStart.y || 1) * size,
      )
    }
    const rect = new paper.Rectangle(shapeStart, corner)
    shapePreview =
      kind === 'rectangle'
        ? new paper.Path.Rectangle({
            rectangle: rect,
            strokeColor: NEW_SHAPE_STROKE,
            fillColor: NEW_SHAPE_FILL,
            strokeWidth: 1,
            parent: contentLayer,
          })
        : new paper.Path.Ellipse({
            rectangle: rect,
            strokeColor: NEW_SHAPE_STROKE,
            fillColor: NEW_SHAPE_FILL,
            strokeWidth: 1,
            parent: contentLayer,
          })
  }
  tool.onMouseUp = () => {
    shapeStart = null
    if (shapePreview) {
      if (shapePreview.bounds.width < 1 || shapePreview.bounds.height < 1) {
        shapePreview.remove()
      } else {
        storeRef.current.setSelection([String(shapePreview.id)])
        redrawOverlay()
        commitHistory()
      }
      shapePreview = null
    }
  }
  return tool
}

export function createPanTool(
  scope: paper.PaperScope,
  canvas: HTMLCanvasElement,
  onViewChange: () => void,
): paper.Tool {
  const tool = new scope.Tool()
  tool.onMouseDown = () => {
    canvas.style.cursor = 'grabbing'
  }
  tool.onMouseDrag = (event: paper.ToolEvent) => {
    scope.view.center = scope.view.center.subtract(event.delta)
    onViewChange()
  }
  tool.onMouseUp = () => {
    canvas.style.cursor = 'grab'
  }
  return tool
}

export interface PenToolController {
  tool: paper.Tool
  /** Finishes the in-progress path (closing it if `close` and there's enough segments); no-op if not drawing. */
  finish: (close: boolean) => void
  /** Discards the in-progress path entirely. */
  cancel: () => void
  isDrawing: () => boolean
}

export function createPenTool(ctx: ToolContext): PenToolController {
  const { scope, contentLayer, storeRef, redrawOverlay, commitHistory } = ctx
  let penPath: paper.Path | null = null
  let penDragging = false

  const finish = (close: boolean) => {
    if (!penPath) return
    if (close && penPath.segments.length > MIN_SEGMENTS) {
      penPath.closed = true
    }
    // A pen path started but abandoned with a single point isn't a real shape.
    if (penPath.segments.length < 2) {
      penPath.remove()
    } else {
      storeRef.current.setSelection([String(penPath.id)])
    }
    penPath = null
    penDragging = false
    redrawOverlay()
    commitHistory()
  }

  const cancel = () => {
    if (penPath) penPath.remove()
    penPath = null
    penDragging = false
    redrawOverlay()
  }

  const tool = new scope.Tool()
  tool.onMouseDown = (event: paper.ToolEvent) => {
    if (penPath) {
      const first = penPath.firstSegment
      if (
        penPath.segments.length > MIN_SEGMENTS &&
        first.point.getDistance(event.point) <= PEN_CLOSE_TOLERANCE / scope.view.zoom
      ) {
        finish(true)
        return
      }
      penPath.add(event.point)
    } else {
      penPath = new paper.Path({
        segments: [event.point],
        strokeColor: NEW_SHAPE_STROKE,
        fillColor: NEW_SHAPE_FILL,
        strokeWidth: 1,
        parent: contentLayer,
      })
    }
    penDragging = true
  }
  tool.onMouseDrag = (event: paper.ToolEvent) => {
    if (!penPath || !penDragging) return
    const segment = penPath.lastSegment
    segment.handleOut = segment.handleOut.add(event.delta)
    segment.handleIn = segment.handleOut.multiply(-1)
  }
  tool.onMouseUp = () => {
    penDragging = false
  }

  return { tool, finish, cancel, isDrawing: () => penPath !== null }
}
