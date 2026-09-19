import { useEffect, useRef } from 'react'
import paper from 'paper'
import { useEditorStore, type SelectedPathProps, type PropsEdit } from '../store/editorStore'

const VIEW_PADDING = 40
const GRID_SIZE = 20
const GRID_MAJOR_EVERY = 5
const GRID_MINOR_COLOR = '#2a2b33'
const GRID_MAJOR_COLOR = '#35363f'
const RULER_COLOR = '#6b6d78'
const ARTBOARD_FILL = '#1f2028'
const ARTBOARD_STROKE = '#35363f'

const SELECT_HIT_TOLERANCE = 6
const NODE_HIT_TOLERANCE = 7
const ADD_POINT_TOLERANCE = 12
const ANCHOR_RADIUS = 4
const HANDLE_RADIUS = 3
const ACCENT = '#aa3bff'
const OVERLAY_LINE = 'rgba(170, 59, 255, 0.6)'
const ANCHOR_FILL = '#1c1d24'
const HANDLE_FILL = '#1c1d24'
const MIN_SEGMENTS = 2

const AUTOSAVE_KEY = 'boring-vectors:autosave'
const AUTOSAVE_DEBOUNCE_MS = 500

interface AutosavePayload {
  svg: string
  canvasWidth: number
  canvasHeight: number
}

function loadAutosave(): AutosavePayload | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AutosavePayload
  } catch {
    return null
  }
}

function saveAutosave(payload: AutosavePayload) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload))
  } catch {
    // Storage full or unavailable — autosave is best-effort.
  }
}

function drawBackground(
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

function fitCanvasInView(view: paper.View, width: number, height: number) {
  const scale = Math.min(
    (view.viewSize.width - VIEW_PADDING * 2) / width,
    (view.viewSize.height - VIEW_PADDING * 2) / height,
  )
  view.zoom = scale > 0 ? scale : 1
  view.center = new paper.Point(width / 2, height / 2)
}

function findPathById(contentLayer: paper.Layer, id: string | null): paper.Path | null {
  if (!id) return null
  const match = contentLayer.children.find((child) => String(child.id) === id)
  return match instanceof paper.Path ? match : null
}

function hitTestPath(contentLayer: paper.Layer, point: paper.Point, zoom: number) {
  const result = contentLayer.hitTest(point, {
    fill: true,
    stroke: true,
    tolerance: SELECT_HIT_TOLERANCE / zoom,
  })
  if (!result) return null
  const item = result.item
  return item instanceof paper.Path ? item : null
}

type OverlayHit =
  | { type: 'anchor'; segmentIndex: number }
  | { type: 'handleIn'; segmentIndex: number }
  | { type: 'handleOut'; segmentIndex: number }

function hitTestOverlay(
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

function clearOverlay(overlayLayer: paper.Layer) {
  overlayLayer.removeChildren()
}

function drawSelectionHighlight(overlayLayer: paper.Layer, path: paper.Path, zoom: number) {
  new paper.Path.Rectangle({
    rectangle: path.bounds,
    strokeColor: ACCENT,
    strokeWidth: 1 / zoom,
    dashArray: [4 / zoom, 3 / zoom],
    parent: overlayLayer,
  })
}

function drawNodeOverlay(
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

function findNearestLocation(
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

function importSvgIntoContent(
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

function computeSelectedPathProps(
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

function isTextInputFocused() {
  const active = document.activeElement
  if (!active) return false
  const tag = active.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA'
}

function PaperCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scopeRef = useRef<paper.PaperScope | null>(null)

  const width = useEditorStore((s) => s.canvas.width)
  const height = useEditorStore((s) => s.canvas.height)
  const gridVisible = useEditorStore((s) => s.canvas.gridVisible)

  // Store snapshot read inside Paper event handlers via getState() — handlers
  // are created once at mount and must always see current tool/selection.
  const storeRef = useRef(useEditorStore.getState())
  useEffect(() => useEditorStore.subscribe((state) => (storeRef.current = state)), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const scope = new paper.PaperScope()
    scope.setup(canvas)
    scopeRef.current = scope

    new scope.Layer({ name: 'background' })
    const contentLayer = new scope.Layer({ name: 'content' })
    const overlayLayer = new scope.Layer({ name: 'overlay' })

    const saved = loadAutosave()
    if (saved) {
      importSvgIntoContent(contentLayer, saved.svg, saved.canvasWidth, saved.canvasHeight, false)
      if (
        saved.canvasWidth !== storeRef.current.canvas.width ||
        saved.canvasHeight !== storeRef.current.canvas.height
      ) {
        storeRef.current.setCanvasSize(saved.canvasWidth, saved.canvasHeight)
      }
    }

    let autosaveTimeout: ReturnType<typeof setTimeout> | undefined
    const scheduleAutosave = () => {
      if (autosaveTimeout) clearTimeout(autosaveTimeout)
      autosaveTimeout = setTimeout(() => {
        const svg = contentLayer.exportSVG({ asString: true }) as string
        saveAutosave({
          svg,
          canvasWidth: storeRef.current.canvas.width,
          canvasHeight: storeRef.current.canvas.height,
        })
      }, AUTOSAVE_DEBOUNCE_MS)
    }

    const redrawOverlay = () => {
      const { selectedPathId, selectedSegmentIndex, tool } = storeRef.current
      scheduleAutosave()
      clearOverlay(overlayLayer)
      const path = findPathById(contentLayer, selectedPathId)
      if (!path) {
        storeRef.current.setSelectedPathProps(null)
        return
      }
      storeRef.current.setSelectedPathProps(computeSelectedPathProps(path, selectedSegmentIndex))
      const zoom = scope.view.zoom
      if (tool === 'node') {
        drawNodeOverlay(overlayLayer, path, zoom, selectedSegmentIndex)
      } else {
        drawSelectionHighlight(overlayLayer, path, zoom)
      }
    }

    // --- Select tool ---
    let dragPath: paper.Path | null = null
    const selectTool = new scope.Tool()
    selectTool.onMouseDown = (event: paper.ToolEvent) => {
      const hit = hitTestPath(contentLayer, event.point, scope.view.zoom)
      dragPath = hit
      if (hit) {
        storeRef.current.setSelection(String(hit.id))
      } else {
        storeRef.current.clearSelection()
      }
      redrawOverlay()
    }
    selectTool.onMouseDrag = (event: paper.ToolEvent) => {
      if (!dragPath) return
      dragPath.position = dragPath.position.add(event.delta)
      redrawOverlay()
    }
    selectTool.onMouseUp = () => {
      dragPath = null
    }

    // --- Node tool ---
    let nodeDragPath: paper.Path | null = null
    let nodeDrag: OverlayHit | null = null
    const nodeTool = new scope.Tool()
    nodeTool.onMouseDown = (event: paper.ToolEvent) => {
      const { selectedPathId } = storeRef.current
      const activePath = findPathById(contentLayer, selectedPathId)

      if (activePath) {
        const overlayHit = hitTestOverlay(overlayLayer, event.point, scope.view.zoom)
        if (overlayHit) {
          nodeDragPath = activePath
          nodeDrag = overlayHit
          if (overlayHit.type === 'anchor') {
            storeRef.current.setSelection(String(activePath.id), overlayHit.segmentIndex)
          }
          redrawOverlay()
          return
        }
      }

      const hit = hitTestPath(contentLayer, event.point, scope.view.zoom)
      nodeDragPath = null
      nodeDrag = null
      storeRef.current.setSelection(hit ? String(hit.id) : null)
      redrawOverlay()
    }
    nodeTool.onMouseDrag = (event: paper.ToolEvent) => {
      if (!nodeDragPath || !nodeDrag) return
      const segment = nodeDragPath.segments[nodeDrag.segmentIndex]
      if (!segment) return

      if (nodeDrag.type === 'anchor') {
        segment.point = segment.point.add(event.delta)
      } else if (nodeDrag.type === 'handleIn') {
        segment.handleIn = segment.handleIn.add(event.delta)
        if (!event.modifiers.alt) {
          segment.handleOut = segment.handleIn.multiply(-1)
        }
      } else if (nodeDrag.type === 'handleOut') {
        segment.handleOut = segment.handleOut.add(event.delta)
        if (!event.modifiers.alt) {
          segment.handleIn = segment.handleOut.multiply(-1)
        }
      }
      redrawOverlay()
    }
    nodeTool.onMouseUp = () => {
      nodeDragPath = null
      nodeDrag = null
    }

    // --- Add Point tool ---
    let hoverMarker: paper.Path.Circle | null = null
    const addPointTool = new scope.Tool()
    addPointTool.onMouseMove = (event: paper.ToolEvent) => {
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
    addPointTool.onMouseDown = (event: paper.ToolEvent) => {
      const zoom = scope.view.zoom
      const location = findNearestLocation(contentLayer, event.point, ADD_POINT_TOLERANCE / zoom)
      if (!location || !(location.path instanceof paper.Path)) return
      location.path.divideAt(location)
      storeRef.current.setSelection(String(location.path.id))
      redrawOverlay()
    }

    const tools = { select: selectTool, node: nodeTool, addPoint: addPointTool }

    const deleteSelected = () => {
      const { tool, selectedPathId, selectedSegmentIndex } = storeRef.current
      const path = findPathById(contentLayer, selectedPathId)
      if (!path) return

      if (tool === 'node' && selectedSegmentIndex !== null) {
        if (path.segments.length > MIN_SEGMENTS) {
          path.removeSegment(selectedSegmentIndex)
          storeRef.current.setSelection(String(path.id))
        }
      } else {
        path.remove()
        storeRef.current.clearSelection()
      }
      redrawOverlay()
    }

    const exportSvg = () => {
      const svg = contentLayer.exportSVG({ asString: true }) as string
      navigator.clipboard.writeText(svg).catch(() => {
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank')
      })
    }

    const applyPropsEdit = (edit: PropsEdit) => {
      const { selectedPathId, selectedSegmentIndex } = storeRef.current
      const path = findPathById(contentLayer, selectedPathId)
      if (!path) return

      if (edit.kind === 'position') {
        path.bounds = new paper.Rectangle(
          new paper.Point(edit.x, edit.y),
          path.bounds.size,
        )
      } else if (edit.kind === 'node') {
        const segment =
          selectedSegmentIndex !== null ? path.segments[selectedSegmentIndex] : undefined
        if (segment) {
          segment.point = new paper.Point(edit.x, edit.y)
        }
      } else if (edit.kind === 'stroke') {
        if (edit.color !== undefined) path.strokeColor = new paper.Color(edit.color)
        if (edit.width !== undefined) path.strokeWidth = edit.width
      } else if (edit.kind === 'fill') {
        path.fillColor = edit.color === null ? null : new paper.Color(edit.color)
      }

      redrawOverlay()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInputFocused()) return
      const key = event.key

      if (key === 'v' || key === 'V') {
        storeRef.current.setTool('select')
      } else if (key === 'n' || key === 'N') {
        storeRef.current.setTool('node')
      } else if (key === '+' || key === '=') {
        storeRef.current.setTool('addPoint')
      } else if (key === 'g' || key === 'G') {
        storeRef.current.toggleGrid()
      } else if (key === '0') {
        scope.activate()
        fitCanvasInView(scope.view, storeRef.current.canvas.width, storeRef.current.canvas.height)
      } else if (key === 'Delete' || key === 'Backspace') {
        event.preventDefault()
        scope.activate()
        deleteSelected()
      } else {
        return
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    const resize = () => {
      scope.activate()
      scope.view.viewSize = new paper.Size(canvas.clientWidth, canvas.clientHeight)
      fitCanvasInView(scope.view, storeRef.current.canvas.width, storeRef.current.canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    tools[storeRef.current.tool].activate()
    const unsubscribeTool = useEditorStore.subscribe((state, prevState) => {
      if (state.tool !== prevState.tool) {
        tools[state.tool].activate()
      }
      if (
        state.selectedPathId !== prevState.selectedPathId ||
        state.selectedSegmentIndex !== prevState.selectedSegmentIndex ||
        state.tool !== prevState.tool
      ) {
        scope.activate()
        redrawOverlay()
      }
      if (state.deleteRequest !== prevState.deleteRequest) {
        scope.activate()
        deleteSelected()
      }
      if (state.importRequest.nonce !== prevState.importRequest.nonce) {
        scope.activate()
        const imported = importSvgIntoContent(
          contentLayer,
          state.importRequest.svg,
          state.canvas.width,
          state.canvas.height,
        )
        if (imported) {
          storeRef.current.setSelection(String(imported.id))
        }
      }
      if (state.propsEditRequest && state.propsEditRequest.nonce !== prevState.propsEditRequest?.nonce) {
        scope.activate()
        applyPropsEdit(state.propsEditRequest.edit)
      }
      if (state.exportRequest !== prevState.exportRequest) {
        scope.activate()
        exportSvg()
      }
    })

    return () => {
      if (autosaveTimeout) clearTimeout(autosaveTimeout)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', handleKeyDown)
      unsubscribeTool()
      scope.project?.remove()
      scopeRef.current = null
    }
    // Mount/teardown only — size and grid changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const scope = scopeRef.current
    if (!scope) return
    scope.activate()
    const backgroundLayer = scope.project.layers.find((l) => l.name === 'background')
    if (!backgroundLayer) return
    drawBackground(backgroundLayer, width, height, gridVisible)
    fitCanvasInView(scope.view, width, height)
  }, [width, height, gridVisible])

  return <canvas ref={canvasRef} className="CanvasWrap-canvas" />
}

export default PaperCanvas
