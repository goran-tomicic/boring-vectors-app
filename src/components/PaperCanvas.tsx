import { useEffect, useRef } from 'react'
import paper from 'paper'
import { useEditorStore, type PropsEdit, type ExportKind, type Tool } from '../store/editorStore'
import { drawBackground, fitCanvasInView, getViewTransform } from '../canvasEngine/background'
import { findPathById, findPathsByIds, isTextInputFocused } from '../canvasEngine/hitTest'
import {
  clearOverlay,
  drawSelectionHighlight,
  drawSelectionBoundsHighlight,
  drawNodeOverlay,
  drawTransformHandles,
  computeSelectedPathProps,
  computeSelectionBounds,
} from '../canvasEngine/overlay'
import { importSvgIntoContent } from '../canvasEngine/svgIO'
import { computeLayerList } from '../canvasEngine/layers'
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
  applyAnimationAtTime,
  createPlaybackController,
  syncKeyframesAfterDirectEdit,
} from '../canvasEngine/animationPlayback'
import { createSvgExporter, downloadBlob } from '../canvasEngine/svgExport'
import {
  type ProjectPayload,
  ensureCurrentProject,
  loadProject,
  saveProject,
  renameProject,
  listProjects,
  setCurrentProjectId,
  createProjectId,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BACKGROUND_OPACITY,
} from '../projects'
import {
  createEmptyAnimationClip,
  hasRestGeometry,
  type AnimatableProperty,
  type Easing,
  type SegmentSnapshot,
} from '../animation'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 10
const ZOOM_WHEEL_SENSITIVITY = 1.0015
const AUTOSAVE_DEBOUNCE_MS = 500
const MAX_HISTORY = 100
const NUDGE_STEP = 1
const NUDGE_STEP_LARGE = 10

// Select/Node manage their own cursor dynamically per-handle (see tools.ts's onMouseMove) —
// omitted here so the tool-switch effect below doesn't fight that. Every other tool places
// something at a point rather than manipulating existing geometry, so a plain crosshair
// (matching every other vector app) is a constant, correct cursor for as long as that tool
// stays active.
const CURSOR_BY_TOOL: Partial<Record<Tool, string>> = {
  pen: 'crosshair',
  rectangle: 'crosshair',
  ellipse: 'crosshair',
  ruler: 'crosshair',
  addPoint: 'crosshair',
}

function PaperCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scopeRef = useRef<paper.PaperScope | null>(null)
  const scheduleAutosaveRef = useRef<(() => void) | null>(null)

  const width = useEditorStore((s) => s.canvas.width)
  const height = useEditorStore((s) => s.canvas.height)
  const gridVisible = useEditorStore((s) => s.canvas.gridVisible)
  const backgroundColor = useEditorStore((s) => s.canvas.backgroundColor)
  const backgroundOpacity = useEditorStore((s) => s.canvas.backgroundOpacity)
  const gridColor = useEditorStore((s) => s.canvas.gridColor)
  const gridOpacity = useEditorStore((s) => s.canvas.gridOpacity)

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

    // Animation playback + export logic lives in canvasEngine/animationPlayback.ts and
    // svgExport.ts (same pattern as tools.ts/hitTest.ts) — only wired together here.
    const playback = createPlaybackController(storeRef)
    const exporter = createSvgExporter(contentLayer, storeRef)

    let currentProjectId: string
    let currentProjectName: string
    const initialDoc = ensureCurrentProject()
    currentProjectId = initialDoc.id
    currentProjectName = initialDoc.name
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
    storeRef.current.setBackgroundColor(initialDoc.payload.backgroundColor ?? DEFAULT_BACKGROUND_COLOR)
    storeRef.current.setBackgroundOpacity(initialDoc.payload.backgroundOpacity ?? DEFAULT_BACKGROUND_OPACITY)
    storeRef.current.setCurrentProject(currentProjectId, currentProjectName)
    storeRef.current.setAnimationClip(initialDoc.payload.animation ?? createEmptyAnimationClip())
    storeRef.current.setPlayhead(0)
    applyAnimationAtTime(contentLayer, storeRef.current.animation, 0)
    storeRef.current.setLayerNameOverrides(initialDoc.payload.layerNames ?? {})

    // Layers panel data — read-only, rebuilt whenever the content layer's paths change or
    // layerNameOverrides changes (see call sites below: initial load, commitHistory,
    // undo/redo, project load/switch, and the layerNameOverrides subscription further down).
    const refreshLayers = () =>
      storeRef.current.setLayers(computeLayerList(contentLayer, storeRef.current.layerNameOverrides))
    refreshLayers()

    const buildCurrentPayload = (): ProjectPayload => ({
      svg: contentLayer.exportSVG({ asString: true }) as string,
      canvasWidth: storeRef.current.canvas.width,
      canvasHeight: storeRef.current.canvas.height,
      backgroundColor: storeRef.current.canvas.backgroundColor,
      backgroundOpacity: storeRef.current.canvas.backgroundOpacity,
      animation: storeRef.current.animation,
      layerNames: storeRef.current.layerNameOverrides,
    })

    let autosaveTimeout: ReturnType<typeof setTimeout> | undefined
    const scheduleAutosave = () => {
      if (autosaveTimeout) clearTimeout(autosaveTimeout)
      autosaveTimeout = setTimeout(() => {
        saveProject(currentProjectId, currentProjectName, buildCurrentPayload())
      }, AUTOSAVE_DEBOUNCE_MS)
    }
    scheduleAutosaveRef.current = scheduleAutosave

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
      refreshLayers()
      redrawOverlay()
    }

    const commitHistory = () => {
      const snap = snapshotContent()
      if (snap === currentSnapshot) return
      history.push(currentSnapshot)
      if (history.length > MAX_HISTORY) history.shift()
      currentSnapshot = snap
      future.length = 0
      refreshLayers()
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

    // Redraws the selection overlay (selection box / node handles) and refreshes
    // selectedPathProps (what Timeline.tsx's property rows and the Properties panel read
    // live values from) to match the path's current state. No side effects beyond that —
    // split out from redrawOverlay so a playhead-driven refresh (every animation frame
    // during scrubbing/playback) doesn't also reschedule autosave on every tick.
    const refreshSelectionDisplay = () => {
      const { selectedPathIds, selectedSegmentIndex, selectedSegmentIndices, tool } = storeRef.current
      clearOverlay(overlayLayer)
      const zoom = scope.view.zoom

      if (selectedPathIds.length === 1) {
        const path = findPathById(contentLayer, selectedPathIds[0])
        if (path) {
          storeRef.current.setSelectedPathProps(computeSelectedPathProps(path, selectedSegmentIndex))
          storeRef.current.setSelectionBounds(null)
          if (tool === 'node') {
            drawNodeOverlay(overlayLayer, path, zoom, new Set(selectedSegmentIndices))
          } else if (tool === 'select') {
            drawSelectionHighlight(overlayLayer, path, zoom)
            drawTransformHandles(overlayLayer, path.bounds, zoom)
            drawNodeOverlay(overlayLayer, path, zoom, null, false)
          } else {
            drawSelectionHighlight(overlayLayer, path, zoom)
          }
          return
        }
      }

      storeRef.current.setSelectedPathProps(null)
      const paths = findPathsByIds(contentLayer, selectedPathIds)
      for (const path of paths) {
        drawSelectionHighlight(overlayLayer, path, zoom)
      }
      const bounds = computeSelectionBounds(paths)
      storeRef.current.setSelectionBounds(bounds)
      if (bounds && paths.length > 1) {
        drawSelectionBoundsHighlight(overlayLayer, bounds, zoom)
        if (tool === 'select') {
          drawTransformHandles(overlayLayer, new paper.Rectangle(bounds.x, bounds.y, bounds.width, bounds.height), zoom)
        }
      }
    }

    const redrawOverlay = () => {
      scheduleAutosave()
      refreshSelectionDisplay()
    }

    const flushAutosaveNow = () => {
      if (autosaveTimeout) {
        clearTimeout(autosaveTimeout)
        autosaveTimeout = undefined
      }
      saveProject(currentProjectId, currentProjectName, buildCurrentPayload())
    }

    const loadProjectIntoCanvas = (id: string, name: string, payload: ProjectPayload) => {
      contentLayer.removeChildren()
      if (payload.svg) {
        importSvgIntoContent(contentLayer, payload.svg, payload.canvasWidth, payload.canvasHeight, false)
      }
      currentProjectId = id
      currentProjectName = name
      setCurrentProjectId(id)
      storeRef.current.setCurrentProject(id, name)
      if (
        payload.canvasWidth !== storeRef.current.canvas.width ||
        payload.canvasHeight !== storeRef.current.canvas.height
      ) {
        storeRef.current.setCanvasSize(payload.canvasWidth, payload.canvasHeight)
      }
      storeRef.current.setBackgroundColor(payload.backgroundColor ?? DEFAULT_BACKGROUND_COLOR)
      storeRef.current.setBackgroundOpacity(payload.backgroundOpacity ?? DEFAULT_BACKGROUND_OPACITY)
      storeRef.current.pause()
      storeRef.current.setAnimationClip(payload.animation ?? createEmptyAnimationClip())
      storeRef.current.setPlayhead(0)
      applyAnimationAtTime(contentLayer, storeRef.current.animation, 0)
      storeRef.current.setLayerNameOverrides(payload.layerNames ?? {})
      storeRef.current.clearSelection()
      history.length = 0
      future.length = 0
      currentSnapshot = snapshotContent()
      refreshLayers()
      redrawOverlay()
    }

    const switchToProject = (id: string) => {
      if (id === currentProjectId) return
      flushAutosaveNow()
      const payload = loadProject(id)
      if (!payload) return
      const meta = listProjects().find((doc) => doc.id === id)
      loadProjectIntoCanvas(id, meta?.name ?? 'Untitled', payload)
    }

    const createNewProject = (name: string) => {
      flushAutosaveNow()
      const id = createProjectId()
      const payload: ProjectPayload = {
        svg: '',
        canvasWidth: 800,
        canvasHeight: 600,
        backgroundColor: DEFAULT_BACKGROUND_COLOR,
        backgroundOpacity: DEFAULT_BACKGROUND_OPACITY,
      }
      saveProject(id, name, payload)
      loadProjectIntoCanvas(id, name, payload)
    }

    const renameCurrentProject = (name: string) => {
      const trimmed = name.trim() || 'Untitled'
      renameProject(currentProjectId, trimmed)
      currentProjectName = trimmed
      storeRef.current.setCurrentProject(currentProjectId, trimmed)
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
      const { tool, selectedPathIds, selectedSegmentIndices } = storeRef.current
      if (storeRef.current.isPlaying) return

      if (tool === 'node' && selectedPathIds.length === 1 && selectedSegmentIndices.length > 0) {
        const path = findPathById(contentLayer, selectedPathIds[0])
        if (path) {
          // Descending order so removing one segment never shifts the index of one still queued.
          const sorted = [...selectedSegmentIndices].sort((a, b) => b - a)
          for (const index of sorted) {
            if (path.segments.length <= MIN_SEGMENTS) break
            path.removeSegment(index)
          }
          storeRef.current.setSelection([path.name])
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

    const handleExport = async (kind: ExportKind) => {
      const filenameBase = currentProjectName || 'untitled'
      if (kind.kind === 'copySvg') {
        const svg = exporter.buildStandaloneSvg()
        navigator.clipboard.writeText(svg).catch(() => {
          downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${filenameBase}.svg`)
        })
      } else if (kind.kind === 'downloadSvg') {
        downloadBlob(new Blob([exporter.buildStandaloneSvg()], { type: 'image/svg+xml' }), `${filenameBase}.svg`)
      } else if (kind.kind === 'downloadAnimatedSvg') {
        downloadBlob(
          new Blob([exporter.buildAnimatedSvg()], { type: 'image/svg+xml' }),
          `${filenameBase}-animated.svg`,
        )
      } else if (kind.kind === 'downloadRaster') {
        try {
          const blob = await exporter.rasterize(kind.format, kind.scale, kind.transparent)
          downloadBlob(blob, `${filenameBase}.${kind.format}`)
        } catch {
          // Best-effort export — silently drop on rasterization failure.
        }
      } else if (kind.kind === 'downloadGif') {
        try {
          const blob = await exporter.exportGif(kind.fps, kind.scale)
          downloadBlob(blob, `${filenameBase}.gif`)
        } catch {
          // Best-effort export — silently drop on encoding failure.
        }
      } else if (kind.kind === 'downloadVideo') {
        try {
          const blob = await exporter.exportVideo(kind.fps, kind.scale)
          downloadBlob(blob, `${filenameBase}.webm`)
        } catch {
          // Best-effort export — silently drop on recording failure.
        }
      } else if (kind.kind === 'downloadProjectFile') {
        downloadBlob(
          new Blob([JSON.stringify({ name: currentProjectName, ...buildCurrentPayload() }, null, 2)], {
            type: 'application/json',
          }),
          `${filenameBase}.json`,
        )
      }
    }

    const importProjectFile = (name: string, payload: ProjectPayload) => {
      flushAutosaveNow()
      const id = createProjectId()
      saveProject(id, name, payload)
      loadProjectIntoCanvas(id, name, payload)
    }

    const handleTransformKeyframeRequest = (
      pathId: string,
      property: AnimatableProperty,
      time: number,
      value: number,
      easing: Easing,
    ) => {
      const path = findPathById(contentLayer, pathId)
      if (!path) return
      if (!hasRestGeometry(storeRef.current.animation, pathId)) {
        const segments: SegmentSnapshot[] = path.segments.map((s) => ({
          point: { x: s.point.x, y: s.point.y },
          handleIn: { x: s.handleIn.x, y: s.handleIn.y },
          handleOut: { x: s.handleOut.x, y: s.handleOut.y },
        }))
        storeRef.current.setRestGeometry(pathId, segments, { x: path.bounds.center.x, y: path.bounds.center.y })
      }
      storeRef.current.setKeyframe(pathId, property, time, value, easing)
    }

    // Stroke/fill edits apply uniformly to every selected path at once, same as Figma — unlike
    // position/node edits below, there's no per-path geometry to reconcile, so multi-select
    // doesn't need its own semantics (e.g. "same value for all" vs. "offset each by a delta").
    const applyColorEdit = (path: paper.Path, edit: Extract<PropsEdit, { kind: 'stroke' | 'fill' }>) => {
      if (edit.kind === 'stroke') {
        if (edit.color === null) {
          path.strokeColor = null
        } else if (edit.color !== undefined) {
          path.strokeColor = new paper.Color(edit.color)
        }
        if (edit.opacity !== undefined && path.strokeColor) path.strokeColor.alpha = edit.opacity
        if (edit.width !== undefined) path.strokeWidth = edit.width
      } else {
        if (edit.color === null) {
          path.fillColor = null
        } else {
          path.fillColor = new paper.Color(edit.color)
          if (edit.opacity !== undefined) path.fillColor.alpha = edit.opacity
        }
      }
    }

    const applyPropsEdit = (edit: PropsEdit) => {
      const { selectedPathIds, selectedSegmentIndex } = storeRef.current
      if (storeRef.current.isPlaying) return
      if (selectedPathIds.length === 0) return

      if (edit.kind === 'stroke' || edit.kind === 'fill') {
        for (const path of findPathsByIds(contentLayer, selectedPathIds)) {
          applyColorEdit(path, edit)
          syncKeyframesAfterDirectEdit(path, storeRef)
        }
        redrawOverlay()
        commitHistory()
        return
      }

      // Position is the one edit kind that still makes sense across a multi-selection: move
      // every selected path by the same delta, keeping their relative arrangement intact
      // (same semantics as dragging the group on canvas in tools.ts's createSelectTool).
      // Node/handle edits have no equivalent — there's no single "the node" across several
      // different paths — so those stay gated to a single selection below.
      if (edit.kind === 'position' && selectedPathIds.length > 1) {
        const paths = findPathsByIds(contentLayer, selectedPathIds)
        const bounds = computeSelectionBounds(paths)
        if (!bounds) return
        const delta = new paper.Point(edit.x - bounds.x, edit.y - bounds.y)
        for (const p of paths) {
          p.position = p.position.add(delta)
          syncKeyframesAfterDirectEdit(p, storeRef)
        }
        redrawOverlay()
        commitHistory()
        return
      }

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
      }

      syncKeyframesAfterDirectEdit(path, storeRef)
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
      } else if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
        if (storeRef.current.isPlaying) return
        const { selectedPathIds, selectedSegmentIndices, tool } = storeRef.current
        if (selectedPathIds.length === 0) return
        event.preventDefault()
        scope.activate()
        const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP
        const delta = new paper.Point(
          key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0,
          key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0,
        )
        // In Node mode with one or more nodes selected, the arrow keys nudge those nodes —
        // matching Figma/Illustrator's direct-select tool — otherwise they move the whole
        // selection, same as the Select tool's drag.
        if (tool === 'node' && selectedPathIds.length === 1 && selectedSegmentIndices.length > 0) {
          const path = findPathById(contentLayer, selectedPathIds[0])
          if (path) {
            for (const index of selectedSegmentIndices) {
              const segment = path.segments[index]
              if (segment) segment.point = segment.point.add(delta)
            }
            syncKeyframesAfterDirectEdit(path, storeRef)
          }
        } else {
          for (const path of findPathsByIds(contentLayer, selectedPathIds)) {
            path.position = path.position.add(delta)
            syncKeyframesAfterDirectEdit(path, storeRef)
          }
        }
        redrawOverlay()
        commitHistory()
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
    canvas.style.cursor = CURSOR_BY_TOOL[storeRef.current.tool] ?? ''
    const unsubscribeTool = useEditorStore.subscribe((state, prevState) => {
      if (state.tool !== prevState.tool) {
        if (prevState.tool === 'pen' && pen.isDrawing()) {
          scope.activate()
          pen.finish(false)
        }
        tools[state.tool].activate()
        // A handle-specific cursor (resize/rotate/pointer) set by the previous tool would
        // otherwise stick around until the next mousemove on the new tool.
        canvas.style.cursor = CURSOR_BY_TOOL[state.tool] ?? ''
      }
      if (
        state.selectedPathIds !== prevState.selectedPathIds ||
        state.selectedSegmentIndex !== prevState.selectedSegmentIndex ||
        state.selectedSegmentIndices !== prevState.selectedSegmentIndices ||
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
          storeRef.current.setSelection([imported.name])
        }
        redrawOverlay()
        commitHistory()
      }
      if (state.propsEditRequest && state.propsEditRequest.nonce !== prevState.propsEditRequest?.nonce) {
        scope.activate()
        applyPropsEdit(state.propsEditRequest.edit)
      }
      if (state.exportRequest && state.exportRequest.nonce !== prevState.exportRequest?.nonce) {
        scope.activate()
        void handleExport(state.exportRequest.kind)
      }
      if (state.switchProjectRequest && state.switchProjectRequest.nonce !== prevState.switchProjectRequest?.nonce) {
        scope.activate()
        switchToProject(state.switchProjectRequest.id)
      }
      if (state.renameProjectRequest && state.renameProjectRequest.nonce !== prevState.renameProjectRequest?.nonce) {
        renameCurrentProject(state.renameProjectRequest.name)
      }
      if (state.newProjectRequest && state.newProjectRequest.nonce !== prevState.newProjectRequest?.nonce) {
        scope.activate()
        createNewProject(state.newProjectRequest.name)
      }
      if (
        state.importProjectFileRequest &&
        state.importProjectFileRequest.nonce !== prevState.importProjectFileRequest?.nonce
      ) {
        scope.activate()
        importProjectFile(state.importProjectFileRequest.name, state.importProjectFileRequest.payload)
      }
      if (
        state.transformKeyframeRequest &&
        state.transformKeyframeRequest.nonce !== prevState.transformKeyframeRequest?.nonce
      ) {
        scope.activate()
        const req = state.transformKeyframeRequest
        handleTransformKeyframeRequest(req.pathId, req.property, req.time, req.value, req.easing)
      }
      if (state.isPlaying !== prevState.isPlaying) {
        if (state.isPlaying) playback.start()
        else playback.stop()
      }
      if (state.playheadMs !== prevState.playheadMs || state.animation !== prevState.animation) {
        scope.activate()
        applyAnimationAtTime(contentLayer, state.animation, state.playheadMs)
        // Without this, the canvas animates correctly but the selection box and Timeline's
        // own property fields go stale — they only otherwise refresh on selection changes.
        refreshSelectionDisplay()
      }
      // Keyframe/duration edits don't touch Paper.js geometry, so redrawOverlay() (the usual
      // autosave trigger) never runs for them — schedule a save directly instead.
      if (state.animation !== prevState.animation) {
        scheduleAutosave()
      }
      // Renaming a layer doesn't touch Paper.js geometry either — same deal as animation
      // edits above, but also needs the Layers panel's own list rebuilt to show the new name.
      if (state.layerNameOverrides !== prevState.layerNameOverrides) {
        refreshLayers()
        scheduleAutosave()
      }
    })

    return () => {
      if (autosaveTimeout) clearTimeout(autosaveTimeout)
      playback.stop()
      resizeObserver.disconnect()
      scheduleAutosaveRef.current = null
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
    drawBackground(
      backgroundLayer,
      width,
      height,
      gridVisible,
      backgroundColor,
      backgroundOpacity,
      gridColor,
      gridOpacity,
    )
    fitCanvasInView(scope.view, width, height)
    useEditorStore.getState().setViewTransform(getViewTransform(scope.view))
    scheduleAutosaveRef.current?.()
  }, [width, height, gridVisible, backgroundColor, backgroundOpacity, gridColor, gridOpacity])

  return <canvas ref={canvasRef} className="CanvasWrap-canvas" />
}

export default PaperCanvas
