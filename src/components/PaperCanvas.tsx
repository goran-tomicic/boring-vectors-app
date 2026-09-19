import { useEffect, useRef } from 'react'
import paper from 'paper'
import { useEditorStore, type PropsEdit } from '../store/editorStore'
import { drawBackground, fitCanvasInView } from '../canvasEngine/background'
import { findPathById, hitTestPath, findNearestLocation, isTextInputFocused } from '../canvasEngine/hitTest'
import {
  type OverlayHit,
  hitTestOverlay,
  clearOverlay,
  drawSelectionHighlight,
  drawNodeOverlay,
  computeSelectedPathProps,
} from '../canvasEngine/overlay'
import { loadAutosave, saveAutosave, importSvgIntoContent } from '../canvasEngine/svgIO'

const ADD_POINT_TOLERANCE = 12
const ANCHOR_RADIUS = 4
const ACCENT = '#aa3bff'
const MIN_SEGMENTS = 2
const MIN_ZOOM = 0.1
const MAX_ZOOM = 10
const ZOOM_WHEEL_SENSITIVITY = 1.0015
const AUTOSAVE_DEBOUNCE_MS = 500

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

    // --- Pan tool (space+drag override, any tool) ---
    const panTool = new scope.Tool()
    panTool.onMouseDown = () => {
      canvas.style.cursor = 'grabbing'
    }
    panTool.onMouseDrag = (event: paper.ToolEvent) => {
      scope.view.center = scope.view.center.subtract(event.delta)
    }
    panTool.onMouseUp = () => {
      canvas.style.cursor = 'grab'
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
      } else if (edit.kind === 'handleIn' || edit.kind === 'handleOut') {
        const segment =
          selectedSegmentIndex !== null ? path.segments[selectedSegmentIndex] : undefined
        if (segment) {
          const relative = new paper.Point(edit.x, edit.y).subtract(segment.point)
          if (edit.kind === 'handleIn') {
            segment.handleIn = relative
            segment.handleOut = relative.multiply(-1)
          } else {
            segment.handleOut = relative
            segment.handleIn = relative.multiply(-1)
          }
        }
      } else if (edit.kind === 'stroke') {
        if (edit.color !== undefined) path.strokeColor = new paper.Color(edit.color)
        if (edit.width !== undefined) path.strokeWidth = edit.width
      } else if (edit.kind === 'fill') {
        path.fillColor = edit.color === null ? null : new paper.Color(edit.color)
      }

      redrawOverlay()
    }

    let spacePressed = false

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInputFocused()) return
      const key = event.key

      if ((event.metaKey || event.ctrlKey) && (key === 'z' || key === 'Z')) {
        // Intercepted but a no-op — undo/redo is not implemented (per docs/SPEC.md).
        event.preventDefault()
        return
      }

      if (key === ' ') {
        event.preventDefault()
        if (!spacePressed) {
          spacePressed = true
          scope.activate()
          panTool.activate()
          canvas.style.cursor = 'grab'
        }
        return
      }

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

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ' && spacePressed) {
        spacePressed = false
        scope.activate()
        tools[storeRef.current.tool].activate()
        canvas.style.cursor = ''
      }
    }
    window.addEventListener('keyup', handleKeyUp)

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      scope.activate()
      const isZoomModifier = event.ctrlKey || event.metaKey
      const shouldZoom = storeRef.current.settings.scrollZoomOnly || isZoomModifier

      if (shouldZoom) {
        const rect = canvas.getBoundingClientRect()
        const cursor = new paper.Point(event.clientX - rect.left, event.clientY - rect.top)
        const factor = Math.pow(ZOOM_WHEEL_SENSITIVITY, -event.deltaY)
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scope.view.zoom * factor))
        const beforePoint = scope.view.viewToProject(cursor)
        scope.view.zoom = newZoom
        const afterPoint = scope.view.viewToProject(cursor)
        scope.view.center = scope.view.center.add(beforePoint.subtract(afterPoint))
      } else {
        const delta = new paper.Point(event.deltaX, event.deltaY).divide(scope.view.zoom)
        scope.view.center = scope.view.center.add(delta)
      }
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })

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
      window.removeEventListener('keyup', handleKeyUp)
      canvas.removeEventListener('wheel', handleWheel)
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
