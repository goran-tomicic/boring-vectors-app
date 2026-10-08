import paper from 'paper'
import type { EditorState } from '../store/editorStore'
import {
  findPathById,
  findPathsByIds,
  hitTestPath,
  findNearestLocation,
  ensurePathName,
  generatePathName,
} from './hitTest'
import {
  type OverlayHit,
  type ResizeCorner,
  hitTestOverlay,
  drawTransformLabel,
  drawHoverHighlight,
  cursorForOverlayHit,
  computeSelectionBounds,
} from './overlay'
import { syncKeyframesAfterDirectEdit } from './animationPlayback'

const MIN_RESIZE_SIZE = 2
const ROTATE_SNAP_DEGREES = 15

/** Computes the new bounds for a resize drag, anchored to the opposite side/corner from `corner`. Shift preserves the original aspect ratio when dragging a corner handle. Exported for unit testing — pure geometry, no live Paper.js scene involved. */
export function computeResizedBounds(
  start: paper.Rectangle,
  corner: ResizeCorner,
  point: paper.Point,
  keepAspect: boolean,
): paper.Rectangle {
  let left = start.left
  let right = start.right
  let top = start.top
  let bottom = start.bottom
  if (corner.includes('l')) left = point.x
  if (corner.includes('r')) right = point.x
  if (corner.includes('t')) top = point.y
  if (corner.includes('b')) bottom = point.y

  const isCornerHandle = corner.length === 2
  if (keepAspect && isCornerHandle && start.width > 0 && start.height > 0) {
    const aspect = start.width / start.height
    const width = Math.abs(right - left)
    const height = Math.abs(width / aspect)
    if (corner.includes('t')) top = bottom - height
    else bottom = top + height
  }

  if (right - left < MIN_RESIZE_SIZE) {
    if (corner.includes('l')) left = right - MIN_RESIZE_SIZE
    else right = left + MIN_RESIZE_SIZE
  }
  if (bottom - top < MIN_RESIZE_SIZE) {
    if (corner.includes('t')) top = bottom - MIN_RESIZE_SIZE
    else bottom = top + MIN_RESIZE_SIZE
  }

  return new paper.Rectangle(new paper.Point(left, top), new paper.Point(right, bottom))
}

/** Alt-resize variant: the handle's own axis grows/shrinks symmetrically about the bounds' center instead of anchoring the opposite edge — same behavior as Figma/Illustrator's "resize from center" modifier. An edge handle (e.g. 't') only touches its own axis; the other axis keeps its original half-size, centered. Exported for unit testing — pure geometry. */
export function computeResizedBoundsFromCenter(
  start: paper.Rectangle,
  corner: ResizeCorner,
  point: paper.Point,
  keepAspect: boolean,
): paper.Rectangle {
  const center = start.center
  let halfW = start.width / 2
  let halfH = start.height / 2
  if (corner.includes('l') || corner.includes('r')) halfW = Math.abs(point.x - center.x)
  if (corner.includes('t') || corner.includes('b')) halfH = Math.abs(point.y - center.y)

  const isCornerHandle = corner.length === 2
  if (keepAspect && isCornerHandle && start.width > 0 && start.height > 0) {
    halfH = halfW / (start.width / start.height)
  }

  halfW = Math.max(MIN_RESIZE_SIZE / 2, halfW)
  halfH = Math.max(MIN_RESIZE_SIZE / 2, halfH)
  return new paper.Rectangle(
    new paper.Point(center.x - halfW, center.y - halfH),
    new paper.Point(center.x + halfW, center.y + halfH),
  )
}

/** Maps every path's own original bounds through the same scale/translate transform that takes the group's combined `startBounds` to `nextBounds` — lets a multi-selection resize as one bounding box while each shape individually scales and repositions, instead of every shape collapsing onto the same rectangle. For a single-path selection this reduces to exactly `path.bounds = nextBounds`, so single-shape resize behavior is unchanged. */
function applyGroupResize(
  paths: paper.Path[],
  originalBounds: paper.Rectangle[],
  startBounds: paper.Rectangle,
  nextBounds: paper.Rectangle,
) {
  const scaleX = startBounds.width > 0 ? nextBounds.width / startBounds.width : 1
  const scaleY = startBounds.height > 0 ? nextBounds.height / startBounds.height : 1
  paths.forEach((path, i) => {
    const orig = originalBounds[i]
    const newTopLeft = nextBounds.topLeft.add(
      new paper.Point((orig.x - startBounds.x) * scaleX, (orig.y - startBounds.y) * scaleY),
    )
    path.bounds = new paper.Rectangle(newTopLeft, new paper.Size(orig.width * scaleX, orig.height * scaleY))
  })
}

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
  // Move-drag state. `start` is each path's position captured at mousedown — deltas are
  // computed from the fixed `dragOrigin` every frame (not accumulated via event.delta) so
  // Shift-constrain can pick the dominant axis from the *total* drag, not frame-to-frame.
  let dragPaths: { path: paper.Path; start: paper.Point }[] = []
  let dragOrigin: paper.Point | null = null
  let marqueeStart: paper.Point | null = null
  let marqueeAdditive = false
  let marqueeRect: paper.Path | null = null

  // Resize/rotate handle drag state — mutually exclusive with dragPaths/marqueeStart above.
  // Works for one path or a whole multi-selection: transformStartBounds/transformOriginalBounds
  // capture the group's combined bounds and each path's own original bounds once at drag start,
  // so every frame can recompute an absolute target (no per-frame drift) via applyGroupResize.
  let transformPaths: paper.Path[] = []
  let transformHit: OverlayHit | null = null
  let transformStartBounds: paper.Rectangle | null = null
  let transformOriginalBounds: paper.Rectangle[] = []
  let transformCenter: paper.Point | null = null
  let transformStartAngle = 0
  let transformTotalRotationDeg = 0

  // Node-anchor drag state — lets a node be grabbed straight from the Select tool (anchors are
  // drawn, without handle-line clutter, whenever it has a single selection — see
  // drawNodeOverlay's showHandles param) instead of requiring a prior switch to the Node tool.
  // Paper's active tool can't be switched mid-gesture (see PaperCanvas.tsx's tool-activation
  // subscription — it would stop routing drag/up events here), so the actual segment mutation
  // happens inline and the store's `tool` only flips to 'node' once the gesture ends.
  let draggingAnchorPath: paper.Path | null = null
  let draggingAnchorIndex: number | null = null

  // Hover preview (unselected shape under the cursor) — see drawHoverHighlight. Kept separate
  // from the main overlay-clear/redraw cycle so it doesn't need a full redrawOverlay() (which
  // also reschedules autosave) on every plain mousemove.
  let hoverPathName: string | null = null
  let hoverHighlight: paper.Item | null = null
  const clearHover = () => {
    if (hoverHighlight) hoverHighlight.remove()
    hoverHighlight = null
    hoverPathName = null
  }
  const showHover = (path: paper.Path) => {
    if (hoverPathName === path.name) return
    clearHover()
    drawHoverHighlight(overlayLayer, path, scope.view.zoom)
    hoverHighlight = overlayLayer.lastChild
    hoverPathName = path.name
  }

  /** Begins a move-drag for `paths` — or, when `alt` is held, clones them first (Figma/Illustrator's Alt-drag-to-duplicate) and drags the clones instead, leaving the originals in place. */
  const startDrag = (paths: paper.Path[], origin: paper.Point, alt: boolean) => {
    let targets = paths
    if (alt) {
      targets = paths.map((p) => {
        const clone = p.clone({ insert: true }) as paper.Path
        clone.name = generatePathName()
        return clone
      })
      storeRef.current.setSelection(targets.map((p) => p.name))
    }
    dragPaths = targets.map((path) => ({ path, start: path.position.clone() }))
    dragOrigin = origin
  }

  const tool = new scope.Tool()
  tool.onMouseDown = (event: paper.ToolEvent) => {
    clearHover()
    marqueeStart = null
    dragPaths = []
    dragOrigin = null
    transformPaths = []
    transformHit = null
    draggingAnchorPath = null
    draggingAnchorIndex = null

    const { selectedPathIds } = storeRef.current
    if (selectedPathIds.length >= 1) {
      const selectedPaths = findPathsByIds(contentLayer, selectedPathIds)
      if (selectedPaths.length > 0) {
        const overlayHit = hitTestOverlay(overlayLayer, event.point, scope.view.zoom)
        if (overlayHit && (overlayHit.type === 'resize' || overlayHit.type === 'rotate')) {
          const bounds = computeSelectionBounds(selectedPaths)!
          transformPaths = selectedPaths
          transformHit = overlayHit
          transformStartBounds = new paper.Rectangle(bounds.x, bounds.y, bounds.width, bounds.height)
          transformOriginalBounds = selectedPaths.map((p) => p.bounds.clone())
          transformCenter = transformStartBounds.center
          transformStartAngle = event.point.subtract(transformCenter).angle
          transformTotalRotationDeg = 0
          scope.view.element.style.cursor = cursorForOverlayHit(overlayHit)
          return
        }
        if (selectedPaths.length === 1 && overlayHit && overlayHit.type === 'anchor') {
          draggingAnchorPath = selectedPaths[0]
          draggingAnchorIndex = overlayHit.segmentIndex
          storeRef.current.setSelection([selectedPaths[0].name], overlayHit.segmentIndex)
          scope.view.element.style.cursor = 'grabbing'
          redrawOverlay()
          return
        }
      }
    }

    const hit = hitTestPath(contentLayer, event.point, scope.view.zoom)

    if (hit) {
      const hitId = hit.name
      if (event.modifiers.shift) {
        const already = selectedPathIds.includes(hitId)
        storeRef.current.setSelection(
          already ? selectedPathIds.filter((id) => id !== hitId) : [...selectedPathIds, hitId],
        )
      } else if (selectedPathIds.includes(hitId) && selectedPathIds.length > 1) {
        // Clicking a member of an existing multi-selection drags the whole group.
        startDrag(findPathsByIds(contentLayer, selectedPathIds), event.point, event.modifiers.alt)
      } else {
        if (!event.modifiers.alt) storeRef.current.setSelection([hitId])
        startDrag([hit], event.point, event.modifiers.alt)
      }
      scope.view.element.style.cursor = 'move'
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
  tool.onMouseMove = (event: paper.ToolEvent) => {
    const { selectedPathIds } = storeRef.current
    if (selectedPathIds.length >= 1) {
      const overlayHit = hitTestOverlay(overlayLayer, event.point, scope.view.zoom)
      const overlayCursor = cursorForOverlayHit(overlayHit)
      if (overlayCursor) {
        scope.view.element.style.cursor = overlayCursor
        clearHover()
        return
      }
    }
    const hit = hitTestPath(contentLayer, event.point, scope.view.zoom)
    scope.view.element.style.cursor = hit ? 'move' : ''
    if (hit && !selectedPathIds.includes(hit.name)) {
      showHover(hit)
    } else {
      clearHover()
    }
  }
  tool.onMouseDrag = (event: paper.ToolEvent) => {
    if (transformPaths.length > 0 && transformHit && transformCenter) {
      if (transformHit.type === 'rotate') {
        let angle = event.point.subtract(transformCenter).angle
        if (event.modifiers.shift) {
          angle = Math.round(angle / ROTATE_SNAP_DEGREES) * ROTATE_SNAP_DEGREES
        }
        const delta = angle - transformStartAngle
        if (delta !== 0) {
          for (const path of transformPaths) path.rotate(delta, transformCenter)
          transformTotalRotationDeg += delta
          transformStartAngle = angle
        }
        redrawOverlay()
        drawTransformLabel(overlayLayer, event.point, `${Math.round(transformTotalRotationDeg)}°`, scope.view.zoom)
        return
      } else if (transformHit.type === 'resize' && transformStartBounds) {
        const nextBounds = event.modifiers.alt
          ? computeResizedBoundsFromCenter(transformStartBounds, transformHit.corner, event.point, event.modifiers.shift)
          : computeResizedBounds(transformStartBounds, transformHit.corner, event.point, event.modifiers.shift)
        applyGroupResize(transformPaths, transformOriginalBounds, transformStartBounds, nextBounds)
        redrawOverlay()
        drawTransformLabel(
          overlayLayer,
          event.point,
          `${Math.round(nextBounds.width)} × ${Math.round(nextBounds.height)}`,
          scope.view.zoom,
        )
        return
      }
      redrawOverlay()
      return
    }
    if (draggingAnchorPath && draggingAnchorIndex !== null) {
      const segment = draggingAnchorPath.segments[draggingAnchorIndex]
      if (segment) segment.point = segment.point.add(event.delta)
      redrawOverlay()
      return
    }
    if (dragPaths.length > 0 && dragOrigin) {
      let delta = event.point.subtract(dragOrigin)
      if (event.modifiers.shift) {
        delta = Math.abs(delta.x) > Math.abs(delta.y) ? new paper.Point(delta.x, 0) : new paper.Point(0, delta.y)
      }
      for (const { path, start } of dragPaths) {
        path.position = start.add(delta)
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
    if (transformPaths.length > 0) {
      for (const path of transformPaths) {
        syncKeyframesAfterDirectEdit(path, storeRef, { rotationDeltaDeg: transformTotalRotationDeg })
      }
      transformPaths = []
      transformHit = null
      transformStartBounds = null
      transformOriginalBounds = []
      transformCenter = null
      transformTotalRotationDeg = 0
      commitHistory()
      tool.onMouseMove?.(event)
      return
    }
    if (draggingAnchorPath) {
      draggingAnchorPath = null
      draggingAnchorIndex = null
      commitHistory()
      // Switches Paper's active tool to Node (see the draggingAnchorPath comment above) —
      // deferred until the gesture is fully done so this tool keeps receiving its own
      // drag/up events throughout, instead of Paper rerouting them to Node mid-drag.
      storeRef.current.setTool('node')
      return
    }
    if (dragPaths.length > 0) {
      for (const { path } of dragPaths) syncKeyframesAfterDirectEdit(path, storeRef)
      dragPaths = []
      dragOrigin = null
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
        .map((path) => path.name)
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

const DOUBLE_CLICK_MS = 350

export function createNodeTool(ctx: ToolContext): paper.Tool {
  const { scope, contentLayer, overlayLayer, storeRef, redrawOverlay, commitHistory } = ctx
  let dragPath: paper.Path | null = null
  let drag: OverlayHit | null = null

  // Nodes toggled "corner" via double-click (see onMouseDown below) stop mirroring their
  // opposite handle on drag, same as Figma/Illustrator's smooth↔corner node toggle — persists
  // for the rest of the session (ephemeral, not saved with the project; same tier of state as
  // the drag/transform variables above it, just longer-lived).
  const cornerNodes = new Set<string>()
  const cornerKey = (pathName: string, index: number) => `${pathName}:${index}`
  let lastClickKey: string | null = null
  let lastClickTime = 0

  let hoverPathName: string | null = null
  let hoverHighlight: paper.Item | null = null
  const clearHover = () => {
    if (hoverHighlight) hoverHighlight.remove()
    hoverHighlight = null
    hoverPathName = null
  }
  const showHover = (path: paper.Path) => {
    if (hoverPathName === path.name) return
    clearHover()
    drawHoverHighlight(overlayLayer, path, scope.view.zoom)
    hoverHighlight = overlayLayer.lastChild
    hoverPathName = path.name
  }

  const tool = new scope.Tool()
  tool.onMouseDown = (event: paper.ToolEvent) => {
    clearHover()
    const { selectedPathIds } = storeRef.current
    const activePath =
      selectedPathIds.length === 1 ? findPathById(contentLayer, selectedPathIds[0]) : null

    if (activePath) {
      const overlayHit = hitTestOverlay(overlayLayer, event.point, scope.view.zoom)
      if (overlayHit) {
        if (overlayHit.type === 'anchor') {
          const key = cornerKey(activePath.name, overlayHit.segmentIndex)
          const now = Date.now()
          const isDoubleClick = lastClickKey === key && now - lastClickTime < DOUBLE_CLICK_MS
          lastClickKey = isDoubleClick ? null : key
          lastClickTime = now
          if (isDoubleClick) {
            if (cornerNodes.has(key)) cornerNodes.delete(key)
            else cornerNodes.add(key)
            redrawOverlay()
            return
          }
        }
        dragPath = activePath
        drag = overlayHit
        if (overlayHit.type === 'anchor') {
          storeRef.current.setSelection([activePath.name], overlayHit.segmentIndex)
        }
        scope.view.element.style.cursor = 'grabbing'
        redrawOverlay()
        return
      }

      // Clicking directly on the selected path's own curve (not an existing anchor/handle)
      // inserts a new point there and picks it straight up to drag — Figma/Illustrator let you
      // add a point without switching away from the node-editing tool, instead of requiring
      // the separate Add Point tool this app also still has.
      const zoom = scope.view.zoom
      const location = activePath.getNearestLocation(event.point)
      if (location && location.point.getDistance(event.point) <= ADD_POINT_TOLERANCE / zoom) {
        const segment = activePath.divideAt(location)
        if (segment) {
          dragPath = activePath
          drag = { type: 'anchor', segmentIndex: segment.index }
          storeRef.current.setSelection([activePath.name], segment.index)
          scope.view.element.style.cursor = 'grabbing'
          redrawOverlay()
          return
        }
      }
    }

    const hit = hitTestPath(contentLayer, event.point, scope.view.zoom)
    dragPath = null
    drag = null
    storeRef.current.setSelection(hit ? [hit.name] : [])
    redrawOverlay()
  }
  tool.onMouseMove = (event: paper.ToolEvent) => {
    const { selectedPathIds } = storeRef.current
    const activePath = selectedPathIds.length === 1 ? findPathById(contentLayer, selectedPathIds[0]) : null
    const overlayHit = activePath ? hitTestOverlay(overlayLayer, event.point, scope.view.zoom) : null
    const overlayCursor = cursorForOverlayHit(overlayHit)
    if (overlayCursor) {
      scope.view.element.style.cursor = overlayCursor
      clearHover()
      return
    }
    const hit = hitTestPath(contentLayer, event.point, scope.view.zoom)
    scope.view.element.style.cursor = hit ? 'pointer' : ''
    if (hit && !selectedPathIds.includes(hit.name)) {
      showHover(hit)
    } else {
      clearHover()
    }
  }
  tool.onMouseDrag = (event: paper.ToolEvent) => {
    if (!dragPath || !drag) return
    if (drag.type !== 'anchor' && drag.type !== 'handleIn' && drag.type !== 'handleOut') return
    const segment = dragPath.segments[drag.segmentIndex]
    if (!segment) return

    const isCorner = event.modifiers.alt || cornerNodes.has(cornerKey(dragPath.name, drag.segmentIndex))
    if (drag.type === 'anchor') {
      segment.point = segment.point.add(event.delta)
    } else if (drag.type === 'handleIn') {
      segment.handleIn = segment.handleIn.add(event.delta)
      if (!isCorner) {
        segment.handleOut = segment.handleIn.multiply(-1)
      }
    } else if (drag.type === 'handleOut') {
      segment.handleOut = segment.handleOut.add(event.delta)
      if (!isCorner) {
        segment.handleIn = segment.handleOut.multiply(-1)
      }
    }
    redrawOverlay()
  }
  tool.onMouseUp = (event: paper.ToolEvent) => {
    dragPath = null
    drag = null
    commitHistory()
    scope.view.element.style.cursor = ''
    tool.onMouseMove?.(event)
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
    storeRef.current.setSelection([location.path.name])
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
        storeRef.current.setSelection([ensurePathName(shapePreview)])
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
      storeRef.current.setSelection([ensurePathName(penPath)])
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
