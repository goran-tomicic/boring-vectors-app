import { useEffect, useRef } from 'react'
import paper from 'paper'
import { useEditorStore, type PropsEdit } from '../store/editorStore'
import { drawBackground, fitCanvasInView, getViewTransform } from '../canvasEngine/background'
import { findPathById, findPathsByIds, isTextInputFocused } from '../canvasEngine/hitTest'
import { clearOverlay, drawSelectionHighlight, drawNodeOverlay, computeSelectedPathProps } from '../canvasEngine/overlay'
import { importSvgIntoContent } from '../canvasEngine/svgIO'
import {
  type ToolContext,
  createSelectTool,
  createNodeTool,
  createAddPointTool,
  createRulerTool,
  createShapeTool,
  createPanTool,
  createPenTool,
  MIN_SEGMENTS,
} from '../canvasEngine/tools'
import {
  type DocumentPayload,
  ensureCurrentDocument,
  loadDocument,
  saveDocument,
  listDocuments,
  setCurrentDocumentId,
  createDocumentId,
} from '../documents'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 10
const ZOOM_WHEEL_SENSITIVITY = 1.0015
const AUTOSAVE_DEBOUNCE_MS = 500
const MAX_HISTORY = 100

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

    let currentDocId: string
    let currentDocName: string
    const initialDoc = ensureCurrentDocument()
    currentDocId = initialDoc.id
    currentDocName = initialDoc.name
    if (initialDoc.payload.svg) {
      importSvgIntoContent(
        contentLayer,
        initialDoc.payload.svg,
        initialDoc.payload.canvasWidth,
        initialDoc.payload.canvasHeight,
        false,
      )
    }
    if (
      initialDoc.payload.canvasWidth !== storeRef.current.canvas.width ||
      initialDoc.payload.canvasHeight !== storeRef.current.canvas.height
    ) {
      storeRef.current.setCanvasSize(initialDoc.payload.canvasWidth, initialDoc.payload.canvasHeight)
    }
    storeRef.current.setCurrentDocument(currentDocId, currentDocName)

    let autosaveTimeout: ReturnType<typeof setTimeout> | undefined
    const scheduleAutosave = () => {
      if (autosaveTimeout) clearTimeout(autosaveTimeout)
      autosaveTimeout = setTimeout(() => {
        const svg = contentLayer.exportSVG({ asString: true }) as string
        saveDocument(currentDocId, currentDocName, {
          svg,
          canvasWidth: storeRef.current.canvas.width,
          canvasHeight: storeRef.current.canvas.height,
        })
      }, AUTOSAVE_DEBOUNCE_MS)
    }

    // --- Undo/redo history ---
    // Snapshot-based: each entry is a serialized content-layer SVG, committed
    // once per finished interaction (mouseUp, delete, import, a props edit) —
    // not per drag frame, so one undo step matches one user gesture.
    const snapshotContent = () => contentLayer.exportSVG({ asString: true }) as string
    const history: string[] = []
    const future: string[] = []
    let currentSnapshot = snapshotContent()

    const restoreSnapshot = (svg: string) => {
      contentLayer.removeChildren()
      if (svg) {
        importSvgIntoContent(contentLayer, svg, storeRef.current.canvas.width, storeRef.current.canvas.height, false)
      }
      storeRef.current.clearSelection()
      redrawOverlay()
    }

    const commitHistory = () => {
      const snap = snapshotContent()
      if (snap === currentSnapshot) return
      history.push(currentSnapshot)
      if (history.length > MAX_HISTORY) history.shift()
      currentSnapshot = snap
      future.length = 0
    }

    const undo = () => {
      const prev = history.pop()
      if (prev === undefined) return
      future.push(currentSnapshot)
      currentSnapshot = prev
      restoreSnapshot(prev)
    }

    const redo = () => {
      const next = future.pop()
      if (next === undefined) return
      history.push(currentSnapshot)
      currentSnapshot = next
      restoreSnapshot(next)
    }

    const redrawOverlay = () => {
      const { selectedPathIds, selectedSegmentIndex, tool } = storeRef.current
      scheduleAutosave()
      clearOverlay(overlayLayer)
      const zoom = scope.view.zoom

      if (selectedPathIds.length === 1) {
        const path = findPathById(contentLayer, selectedPathIds[0])
        if (path) {
          storeRef.current.setSelectedPathProps(computeSelectedPathProps(path, selectedSegmentIndex))
          if (tool === 'node') {
            drawNodeOverlay(overlayLayer, path, zoom, selectedSegmentIndex)
          } else {
            drawSelectionHighlight(overlayLayer, path, zoom)
          }
          return
        }
      }

      storeRef.current.setSelectedPathProps(null)
      for (const path of findPathsByIds(contentLayer, selectedPathIds)) {
        drawSelectionHighlight(overlayLayer, path, zoom)
      }
    }

    const flushAutosaveNow = () => {
      if (autosaveTimeout) {
        clearTimeout(autosaveTimeout)
        autosaveTimeout = undefined
      }
      const svg = contentLayer.exportSVG({ asString: true }) as string
      saveDocument(currentDocId, currentDocName, {
        svg,
        canvasWidth: storeRef.current.canvas.width,
        canvasHeight: storeRef.current.canvas.height,
      })
    }

    const loadDocumentIntoCanvas = (id: string, name: string, payload: DocumentPayload) => {
      contentLayer.removeChildren()
      if (payload.svg) {
        importSvgIntoContent(contentLayer, payload.svg, payload.canvasWidth, payload.canvasHeight, false)
      }
      currentDocId = id
      currentDocName = name
      setCurrentDocumentId(id)
      storeRef.current.setCurrentDocument(id, name)
      if (
        payload.canvasWidth !== storeRef.current.canvas.width ||
        payload.canvasHeight !== storeRef.current.canvas.height
      ) {
        storeRef.current.setCanvasSize(payload.canvasWidth, payload.canvasHeight)
      }
      storeRef.current.clearSelection()
      history.length = 0
      future.length = 0
      currentSnapshot = snapshotContent()
      redrawOverlay()
    }

    const switchToDocument = (id: string) => {
      if (id === currentDocId) return
      flushAutosaveNow()
      const payload = loadDocument(id)
      if (!payload) return
      const meta = listDocuments().find((doc) => doc.id === id)
      loadDocumentIntoCanvas(id, meta?.name ?? 'Untitled', payload)
    }

    const createNewDocument = (name: string) => {
      flushAutosaveNow()
      const id = createDocumentId()
      const payload: DocumentPayload = { svg: '', canvasWidth: 800, canvasHeight: 600 }
      saveDocument(id, name, payload)
      loadDocumentIntoCanvas(id, name, payload)
    }

    const toolCtx: ToolContext = { scope, contentLayer, overlayLayer, storeRef, redrawOverlay, commitHistory }
    const selectTool = createSelectTool(toolCtx)
    const nodeTool = createNodeTool(toolCtx)
    const addPointTool = createAddPointTool(toolCtx)
    const rulerTool = createRulerTool(toolCtx)
    const rectangleTool = createShapeTool(toolCtx, 'rectangle')
    const ellipseTool = createShapeTool(toolCtx, 'ellipse')
    const pen = createPenTool(toolCtx)
    const panTool = createPanTool(scope, canvas, () => {
      storeRef.current.setViewTransform(getViewTransform(scope.view))
    })

    const tools = {
      select: selectTool,
      node: nodeTool,
      addPoint: addPointTool,
      ruler: rulerTool,
      pen: pen.tool,
      rectangle: rectangleTool,
      ellipse: ellipseTool,
    }

    const deleteSelected = () => {
      const { tool, selectedPathIds, selectedSegmentIndex } = storeRef.current

      if (tool === 'node' && selectedPathIds.length === 1 && selectedSegmentIndex !== null) {
        const path = findPathById(contentLayer, selectedPathIds[0])
        if (path && path.segments.length > MIN_SEGMENTS) {
          path.removeSegment(selectedSegmentIndex)
          storeRef.current.setSelection([String(path.id)])
        }
      } else {
        for (const path of findPathsByIds(contentLayer, selectedPathIds)) {
          path.remove()
        }
        storeRef.current.clearSelection()
      }
      redrawOverlay()
      commitHistory()
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
      const { selectedPathIds, selectedSegmentIndex } = storeRef.current
      if (selectedPathIds.length !== 1) return
      const path = findPathById(contentLayer, selectedPathIds[0])
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
      commitHistory()
    }

    let spacePressed = false

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInputFocused()) return
      const key = event.key

      if ((event.metaKey || event.ctrlKey) && (key === 'z' || key === 'Z')) {
        event.preventDefault()
        scope.activate()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }

      if ((event.metaKey || event.ctrlKey) && (key === 'y' || key === 'Y')) {
        event.preventDefault()
        scope.activate()
        redo()
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
      } else if (key === 'r' || key === 'R') {
        storeRef.current.setTool('ruler')
      } else if (key === 'p' || key === 'P') {
        storeRef.current.setTool('pen')
      } else if (key === 'm' || key === 'M') {
        storeRef.current.setTool('rectangle')
      } else if (key === 'l' || key === 'L') {
        storeRef.current.setTool('ellipse')
      } else if (key === 'Enter' && storeRef.current.tool === 'pen') {
        scope.activate()
        pen.finish(false)
      } else if (key === 'Escape' && storeRef.current.tool === 'pen') {
        scope.activate()
        pen.cancel()
      } else if (key === 'g' || key === 'G') {
        storeRef.current.toggleGrid()
      } else if (key === '0') {
        scope.activate()
        fitCanvasInView(scope.view, storeRef.current.canvas.width, storeRef.current.canvas.height)
        storeRef.current.setViewTransform(getViewTransform(scope.view))
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
      storeRef.current.setViewTransform(getViewTransform(scope.view))
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })

    const resize = () => {
      scope.activate()
      scope.view.viewSize = new paper.Size(canvas.clientWidth, canvas.clientHeight)
      fitCanvasInView(scope.view, storeRef.current.canvas.width, storeRef.current.canvas.height)
      storeRef.current.setViewTransform(getViewTransform(scope.view))
    }
    resize()
    // ResizeObserver (not just window resize) so toggling the props panel — a flex
    // layout change, not a window resize — still re-fits the view correctly.
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    tools[storeRef.current.tool].activate()
    const unsubscribeTool = useEditorStore.subscribe((state, prevState) => {
      if (state.tool !== prevState.tool) {
        if (prevState.tool === 'pen' && pen.isDrawing()) {
          scope.activate()
          pen.finish(false)
        }
        tools[state.tool].activate()
      }
      if (
        state.selectedPathIds !== prevState.selectedPathIds ||
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
          storeRef.current.setSelection([String(imported.id)])
        }
        redrawOverlay()
        commitHistory()
      }
      if (state.propsEditRequest && state.propsEditRequest.nonce !== prevState.propsEditRequest?.nonce) {
        scope.activate()
        applyPropsEdit(state.propsEditRequest.edit)
      }
      if (state.exportRequest !== prevState.exportRequest) {
        scope.activate()
        exportSvg()
      }
      if (state.switchDocumentRequest && state.switchDocumentRequest.nonce !== prevState.switchDocumentRequest?.nonce) {
        scope.activate()
        switchToDocument(state.switchDocumentRequest.id)
      }
      if (state.newDocumentRequest && state.newDocumentRequest.nonce !== prevState.newDocumentRequest?.nonce) {
        scope.activate()
        createNewDocument(state.newDocumentRequest.name)
      }
    })

    return () => {
      if (autosaveTimeout) clearTimeout(autosaveTimeout)
      resizeObserver.disconnect()
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
    useEditorStore.getState().setViewTransform(getViewTransform(scope.view))
  }, [width, height, gridVisible])

  return <canvas ref={canvasRef} className="CanvasWrap-canvas" />
}

export default PaperCanvas
