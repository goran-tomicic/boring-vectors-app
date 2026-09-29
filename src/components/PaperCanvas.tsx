import { useEffect, useRef } from 'react'
import paper from 'paper'
import { useEditorStore, type PropsEdit, type ExportKind } from '../store/editorStore'
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
  evaluateProperty,
  hasRestGeometry,
  buildSmilAnimatesForPath,
  type AnimatableProperty,
  type AnimationClip,
  type Easing,
  type PathTrack,
  type SegmentSnapshot,
} from '../animation'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 10
const ZOOM_WHEEL_SENSITIVITY = 1.0015
const AUTOSAVE_DEBOUNCE_MS = 500
const MAX_HISTORY = 100

function PaperCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scopeRef = useRef<paper.PaperScope | null>(null)
  const scheduleAutosaveRef = useRef<(() => void) | null>(null)

  const width = useEditorStore((s) => s.canvas.width)
  const height = useEditorStore((s) => s.canvas.height)
  const gridVisible = useEditorStore((s) => s.canvas.gridVisible)
  const backgroundColor = useEditorStore((s) => s.canvas.backgroundColor)
  const backgroundOpacity = useEditorStore((s) => s.canvas.backgroundOpacity)

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

    // --- Animation playback ---
    // Writes interpolated keyframe values onto live Paper.js paths each frame;
    // never reads them back as truth (see CLAUDE.md's architectural amendment).
    // Mutates `path`'s position/size/rotation/scale to match `pathTrack` at `timeMs` — shared
    // between live playback (applied to the real path) and animated-SVG export (applied to an
    // offscreen clone, sampled at many time points to build a dense <animate attributeName="d">
    // — see buildGeometryAnimateForPath). Doesn't touch opacity/color; those are separate
    // attribute animations, not geometry.
    const applyGeometryAtTime = (path: paper.Path, pathTrack: PathTrack, clip: AnimationClip, timeMs: number) => {
      // Rotation/scale reset to a stored rest shape and reapply each frame, rather than
      // transforming incrementally — Paper.js has no separate matrix to reset, so repeated
      // relative scale()/rotate() calls would drift and compound. This must run before the
      // x/y/width/height loop below so those apply on top of the transformed shape, not the
      // rest shape.
      if (pathTrack.restSegments && pathTrack.restCenter) {
        const segments = pathTrack.restSegments.map(
          (s: SegmentSnapshot) =>
            new paper.Segment(
              new paper.Point(s.point.x, s.point.y),
              new paper.Point(s.handleIn.x, s.handleIn.y),
              new paper.Point(s.handleOut.x, s.handleOut.y),
            ),
        )
        path.removeSegments()
        path.addSegments(segments)
        const center = new paper.Point(pathTrack.restCenter.x, pathTrack.restCenter.y)
        const scale = evaluateProperty(clip, pathTrack.pathId, 'scale', timeMs) ?? 1
        const rotation = evaluateProperty(clip, pathTrack.pathId, 'rotation', timeMs) ?? 0
        if (scale !== 1) path.scale(scale, center)
        if (rotation !== 0) path.rotate(rotation, center)
      }

      for (const propertyTrack of pathTrack.properties) {
        if (
          propertyTrack.property !== 'x' &&
          propertyTrack.property !== 'y' &&
          propertyTrack.property !== 'width' &&
          propertyTrack.property !== 'height'
        ) {
          continue
        }
        const value = evaluateProperty(clip, pathTrack.pathId, propertyTrack.property, timeMs)
        if (value === null) continue
        if (propertyTrack.property === 'x') {
          path.bounds = new paper.Rectangle(new paper.Point(value, path.bounds.y), path.bounds.size)
        } else if (propertyTrack.property === 'y') {
          path.bounds = new paper.Rectangle(new paper.Point(path.bounds.x, value), path.bounds.size)
        } else if (propertyTrack.property === 'width') {
          path.bounds = new paper.Rectangle(
            path.bounds.point,
            new paper.Size(Math.max(1, value), path.bounds.height),
          )
        } else if (propertyTrack.property === 'height') {
          path.bounds = new paper.Rectangle(
            path.bounds.point,
            new paper.Size(path.bounds.width, Math.max(1, value)),
          )
        }
      }
    }

    const applyAnimationAtTime = (timeMs: number) => {
      const clip = storeRef.current.animation
      for (const pathTrack of clip.tracks) {
        const path = findPathById(contentLayer, pathTrack.pathId)
        if (!path) continue

        applyGeometryAtTime(path, pathTrack, clip, timeMs)

        const opacityValue = evaluateProperty(clip, pathTrack.pathId, 'opacity', timeMs)
        if (opacityValue !== null) path.opacity = opacityValue

        // Each color trio (R/G/B) is always keyed together (see Timeline.tsx), so it's only
        // applied once all three channels evaluate to a value this frame.
        const evalColor = (prefix: 'fillColor' | 'strokeColor'): paper.Color | null => {
          const r = evaluateProperty(clip, pathTrack.pathId, `${prefix}R` as AnimatableProperty, timeMs)
          const g = evaluateProperty(clip, pathTrack.pathId, `${prefix}G` as AnimatableProperty, timeMs)
          const b = evaluateProperty(clip, pathTrack.pathId, `${prefix}B` as AnimatableProperty, timeMs)
          return r !== null && g !== null && b !== null ? new paper.Color(r / 255, g / 255, b / 255) : null
        }
        const fillColor = evalColor('fillColor')
        if (fillColor) path.fillColor = fillColor
        const strokeColor = evalColor('strokeColor')
        if (strokeColor) path.strokeColor = strokeColor
      }
    }

    let playRafId: number | null = null
    let playStartWallMs = 0
    let playStartPlayheadMs = 0

    const stopPlaybackLoop = () => {
      if (playRafId !== null) cancelAnimationFrame(playRafId)
      playRafId = null
    }

    const tickPlayback = () => {
      const elapsed = performance.now() - playStartWallMs
      const duration = storeRef.current.animation.durationMs
      const next = playStartPlayheadMs + elapsed
      if (next >= duration) {
        storeRef.current.setPlayhead(duration)
        storeRef.current.pause()
        return
      }
      storeRef.current.setPlayhead(next)
      playRafId = requestAnimationFrame(tickPlayback)
    }

    const startPlaybackLoop = () => {
      playStartPlayheadMs =
        storeRef.current.playheadMs >= storeRef.current.animation.durationMs ? 0 : storeRef.current.playheadMs
      storeRef.current.setPlayhead(playStartPlayheadMs)
      playStartWallMs = performance.now()
      playRafId = requestAnimationFrame(tickPlayback)
    }

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
    applyAnimationAtTime(0)

    const buildCurrentPayload = (): ProjectPayload => ({
      svg: contentLayer.exportSVG({ asString: true }) as string,
      canvasWidth: storeRef.current.canvas.width,
      canvasHeight: storeRef.current.canvas.height,
      backgroundColor: storeRef.current.canvas.backgroundColor,
      backgroundOpacity: storeRef.current.canvas.backgroundOpacity,
      animation: storeRef.current.animation,
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
      applyAnimationAtTime(0)
      storeRef.current.clearSelection()
      history.length = 0
      future.length = 0
      currentSnapshot = snapshotContent()
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
      const { tool, selectedPathIds, selectedSegmentIndex } = storeRef.current
      if (storeRef.current.isPlaying) return

      if (tool === 'node' && selectedPathIds.length === 1 && selectedSegmentIndex !== null) {
        const path = findPathById(contentLayer, selectedPathIds[0])
        if (path && path.segments.length > MIN_SEGMENTS) {
          path.removeSegment(selectedSegmentIndex)
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

    const downloadBlob = (blob: Blob, filename: string) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    }

    // contentLayer.exportSVG returns a bare <g> fragment (not a standalone <svg>
    // document), so wrap it in an <svg> root sized to the artboard rather than
    // Paper's tight bounding box of the paths — export always captures the full
    // canvas area the user set up, not just where paths happen to be.
    const buildStandaloneSvg = () => {
      const raw = contentLayer.exportSVG({ asString: true }) as string
      const { width: w, height: h } = storeRef.current.canvas
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${raw}</svg>`
    }

    // Bakes SMIL <animate> elements (opacity/fill/stroke — see the note in animation.ts on
    // why position/size/rotation/scale aren't included yet) into a copy of the static export,
    // keyed by matching each <path>'s id attribute back to its pathId (Paper.js round-trips
    // path.name through the SVG id attribute — see hitTest.ts).
    // Position/size/rotation/scale don't map onto a single SVG attribute the way opacity/color
    // do (see the note in animation.ts on buildSmilAnimatesForPath), so instead of asking the
    // SVG renderer to interpolate between authored keyframes, this densely samples the path's
    // geometry — reusing applyGeometryAtTime, the exact same code live playback uses — on an
    // offscreen clone, and bakes the result into a single <animate attributeName="d">. Easing
    // is already "baked in" by sampling at a fixed rate, so playback between samples is linear.
    const GEOMETRY_EXPORT_FPS = 24
    const buildGeometryAnimateForPath = (path: paper.Path, pathTrack: PathTrack, clip: AnimationClip): string | null => {
      const hasGeometryTrack = pathTrack.properties.some((p) =>
        (['x', 'y', 'width', 'height', 'rotation', 'scale'] as AnimatableProperty[]).includes(p.property),
      )
      if (!hasGeometryTrack) return null

      const frameCount = Math.max(2, Math.round((clip.durationMs / 1000) * GEOMETRY_EXPORT_FPS))
      const clone = path.clone({ insert: false }) as paper.Path
      const dValues: string[] = []
      for (let i = 0; i <= frameCount; i++) {
        applyGeometryAtTime(clone, pathTrack, clip, (i / frameCount) * clip.durationMs)
        dValues.push(clone.pathData)
      }

      if (dValues.every((d) => d === dValues[0])) return null // no real motion — skip

      const keyTimes = dValues.map((_, i) => (i / frameCount).toFixed(4)).join(';')
      return `<animate attributeName="d" values="${dValues.join(';')}" keyTimes="${keyTimes}" dur="${clip.durationMs}ms" begin="0s" calcMode="linear" fill="freeze"/>`
    }

    const buildAnimatedSvg = () => {
      const doc = new DOMParser().parseFromString(buildStandaloneSvg(), 'image/svg+xml')
      const clip = storeRef.current.animation
      for (const pathTrack of clip.tracks) {
        const pathEl = doc.getElementById(pathTrack.pathId)
        const path = findPathById(contentLayer, pathTrack.pathId)
        if (!pathEl || !path) continue
        const animateXmls = [
          ...buildSmilAnimatesForPath(pathTrack, clip.durationMs),
          buildGeometryAnimateForPath(path, pathTrack, clip),
        ].filter((xml): xml is string => xml !== null)
        for (const animateXml of animateXmls) {
          const animateEl = new DOMParser()
            .parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${animateXml}</svg>`, 'image/svg+xml')
            .documentElement.firstElementChild
          if (animateEl) pathEl.appendChild(doc.importNode(animateEl, true))
        }
      }
      return new XMLSerializer().serializeToString(doc)
    }

    const rasterize = (format: 'png' | 'jpg', scale: number, transparent: boolean): Promise<Blob> => {
      const { width: w, height: h, backgroundColor } = storeRef.current.canvas
      const svgUrl = URL.createObjectURL(
        new Blob([buildStandaloneSvg()], { type: 'image/svg+xml' }),
      )
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const offscreen = document.createElement('canvas')
          offscreen.width = w * scale
          offscreen.height = h * scale
          const ctx = offscreen.getContext('2d')
          URL.revokeObjectURL(svgUrl)
          if (!ctx) {
            reject(new Error('2D context unavailable'))
            return
          }
          if (!transparent || format === 'jpg') {
            ctx.fillStyle = backgroundColor
            ctx.fillRect(0, 0, offscreen.width, offscreen.height)
          }
          ctx.drawImage(img, 0, 0, offscreen.width, offscreen.height)
          offscreen.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
            format === 'jpg' ? 'image/jpeg' : 'image/png',
            0.92,
          )
        }
        img.onerror = () => {
          URL.revokeObjectURL(svgUrl)
          reject(new Error('SVG image failed to load'))
        }
        img.src = svgUrl
      })
    }

    const handleExport = async (kind: ExportKind) => {
      const filenameBase = currentProjectName || 'untitled'
      if (kind.kind === 'copySvg') {
        const svg = buildStandaloneSvg()
        navigator.clipboard.writeText(svg).catch(() => {
          downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${filenameBase}.svg`)
        })
      } else if (kind.kind === 'downloadSvg') {
        downloadBlob(new Blob([buildStandaloneSvg()], { type: 'image/svg+xml' }), `${filenameBase}.svg`)
      } else if (kind.kind === 'downloadAnimatedSvg') {
        downloadBlob(new Blob([buildAnimatedSvg()], { type: 'image/svg+xml' }), `${filenameBase}-animated.svg`)
      } else if (kind.kind === 'downloadRaster') {
        try {
          const blob = await rasterize(kind.format, kind.scale, kind.transparent)
          downloadBlob(blob, `${filenameBase}.${kind.format}`)
        } catch {
          // Best-effort export — silently drop on rasterization failure.
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

    const applyPropsEdit = (edit: PropsEdit) => {
      const { selectedPathIds, selectedSegmentIndex } = storeRef.current
      if (storeRef.current.isPlaying) return
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
        if (edit.opacity !== undefined && path.strokeColor) path.strokeColor.alpha = edit.opacity
        if (edit.width !== undefined) path.strokeWidth = edit.width
      } else if (edit.kind === 'fill') {
        if (edit.color === null) {
          path.fillColor = null
        } else {
          path.fillColor = new paper.Color(edit.color)
          if (edit.opacity !== undefined) path.fillColor.alpha = edit.opacity
        }
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
        if (state.isPlaying) startPlaybackLoop()
        else stopPlaybackLoop()
      }
      if (state.playheadMs !== prevState.playheadMs || state.animation !== prevState.animation) {
        scope.activate()
        applyAnimationAtTime(state.playheadMs)
      }
      // Keyframe/duration edits don't touch Paper.js geometry, so redrawOverlay() (the usual
      // autosave trigger) never runs for them — schedule a save directly instead.
      if (state.animation !== prevState.animation) {
        scheduleAutosave()
      }
    })

    return () => {
      if (autosaveTimeout) clearTimeout(autosaveTimeout)
      stopPlaybackLoop()
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
    drawBackground(backgroundLayer, width, height, gridVisible, backgroundColor, backgroundOpacity)
    fitCanvasInView(scope.view, width, height)
    useEditorStore.getState().setViewTransform(getViewTransform(scope.view))
    scheduleAutosaveRef.current?.()
  }, [width, height, gridVisible, backgroundColor, backgroundOpacity])

  return <canvas ref={canvasRef} className="CanvasWrap-canvas" />
}

export default PaperCanvas
