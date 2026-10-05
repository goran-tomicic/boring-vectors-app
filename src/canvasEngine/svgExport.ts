import paper from 'paper'
import GIF from 'gif.js'
import gifWorkerUrl from 'gif.js/dist/gif.worker.js?url'
import { type AnimatableProperty, type AnimationClip, type PathTrack, buildSmilAnimatesForPath } from '../animation'
import type { EditorState } from '../store/editorStore'
import { findPathById } from './hitTest'
import { applyFullAnimationAtTime, applyGeometryAtTime } from './animationPlayback'

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const GEOMETRY_EXPORT_FPS = 24

/**
 * Everything that turns the live Paper.js content layer into exportable SVG/PNG/JPG/GIF/WebM
 * output. Takes `contentLayer` and `storeRef` once (matching the ToolContext convention in
 * tools.ts) so callers don't have to thread them through every function.
 */
export function createSvgExporter(contentLayer: paper.Layer, storeRef: { current: EditorState }) {
  // contentLayer.exportSVG returns a bare <g> fragment (not a standalone <svg> document), so
  // wrap it in an <svg> root sized to the artboard rather than Paper's tight bounding box of
  // the paths — export always captures the full canvas area the user set up, not just where
  // paths happen to be.
  const buildStandaloneSvg = () => {
    const raw = contentLayer.exportSVG({ asString: true }) as string
    const { width: w, height: h } = storeRef.current.canvas
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${raw}</svg>`
  }

  // Position/size/rotation/scale don't map onto a single SVG attribute the way opacity/color
  // do (see the note in animation.ts on buildSmilAnimatesForPath), so instead of asking the
  // SVG renderer to interpolate between authored keyframes, this densely samples the path's
  // geometry — reusing applyGeometryAtTime, the exact same code live playback uses — on an
  // offscreen clone, and bakes the result into a single <animate attributeName="d">. Easing is
  // already "baked in" by sampling at a fixed rate, so playback between samples is linear.
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

  // Bakes SMIL <animate> elements into a copy of the static export, keyed by matching each
  // <path>'s id attribute back to its pathId (Paper.js round-trips path.name through the SVG
  // id attribute — see hitTest.ts).
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

  // Shared by raster (PNG/JPG) export and GIF/video frame rendering — loads an arbitrary SVG
  // string as an <img> and draws it onto a fresh offscreen canvas at `scale`. `fillBackground`
  // is forced on for GIF/video (no alpha channel support worth relying on there) but optional
  // for a single-image export, where a transparent PNG is often exactly what's wanted.
  const svgStringToCanvas = (svgString: string, scale: number, fillBackground: boolean): Promise<HTMLCanvasElement> => {
    const { width: w, height: h, backgroundColor } = storeRef.current.canvas
    const svgUrl = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml' }))
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
        if (fillBackground) {
          ctx.fillStyle = backgroundColor
          ctx.fillRect(0, 0, offscreen.width, offscreen.height)
        }
        ctx.drawImage(img, 0, 0, offscreen.width, offscreen.height)
        resolve(offscreen)
      }
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl)
        reject(new Error('SVG image failed to load'))
      }
      img.src = svgUrl
    })
  }

  const rasterize = async (format: 'png' | 'jpg', scale: number, transparent: boolean): Promise<Blob> => {
    const canvasEl = await svgStringToCanvas(buildStandaloneSvg(), scale, !transparent || format === 'jpg')
    return new Promise((resolve, reject) => {
      canvasEl.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
        format === 'jpg' ? 'image/jpeg' : 'image/png',
        0.92,
      )
    })
  }

  // Renders one animation frame's full state (every property, not just the SMIL-exportable
  // subset — see buildAnimatedSvg) onto a detached clone group, so GIF/video frame rendering
  // never touches the live paths the user is editing.
  const renderAnimationFrameSvg = (timeMs: number): string => {
    const clip = storeRef.current.animation
    const group = new paper.Group({ insert: false })
    for (const child of contentLayer.children) {
      if (!(child instanceof paper.Path)) continue
      const clone = child.clone({ insert: false }) as paper.Path
      const pathTrack = clip.tracks.find((t) => t.pathId === child.name)
      if (pathTrack) applyFullAnimationAtTime(clone, pathTrack, clip, timeMs)
      group.addChild(clone)
    }
    const raw = group.exportSVG({ asString: true }) as string
    group.remove()
    const { width: w, height: h } = storeRef.current.canvas
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${raw}</svg>`
  }

  const renderAnimationFrames = async (fps: number, scale: number): Promise<HTMLCanvasElement[]> => {
    const durationMs = storeRef.current.animation.durationMs
    const frameCount = Math.max(1, Math.round((durationMs / 1000) * fps))
    const frames: HTMLCanvasElement[] = []
    for (let i = 0; i < frameCount; i++) {
      const t = frameCount === 1 ? 0 : (i / (frameCount - 1)) * durationMs
      frames.push(await svgStringToCanvas(renderAnimationFrameSvg(t), scale, true))
    }
    return frames
  }

  const exportGif = async (fps: number, scale: number): Promise<Blob> => {
    const frames = await renderAnimationFrames(fps, scale)
    const { width: w, height: h } = storeRef.current.canvas
    return new Promise((resolve, reject) => {
      const gif = new GIF({
        workers: 2,
        quality: 10,
        workerScript: gifWorkerUrl,
        width: w * scale,
        height: h * scale,
        // gif.js's own default (0) already loops forever — the point of setting this
        // explicitly is the -1 case, which makes the exported file match the in-app
        // Timeline's own "Loop timeline playback" setting when it's off (playback stops
        // and holds on the last frame, rather than looping, same as createPlaybackController
        // in animationPlayback.ts).
        repeat: storeRef.current.settings.loopPlayback ? 0 : -1,
      })
      for (const frame of frames) gif.addFrame(frame, { delay: 1000 / fps })
      gif.on('finished', (blob: Blob) => resolve(blob))
      // gif.js's types don't declare the 'abort' event, but it does emit one.
      ;(gif as unknown as { on: (event: string, cb: () => void) => void }).on('abort', () =>
        reject(new Error('GIF export aborted')),
      )
      gif.render()
    })
  }

  // Real-time canvas capture: draws each pre-rendered frame at a steady interval onto a canvas
  // whose MediaStream a MediaRecorder is watching — recording necessarily takes about as long
  // as the animation's own duration, same as watching it play once.
  const exportVideo = async (fps: number, scale: number): Promise<Blob> => {
    const frames = await renderAnimationFrames(fps, scale)
    const { width: w, height: h } = storeRef.current.canvas
    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = w * scale
    outputCanvas.height = h * scale
    const ctx = outputCanvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable')

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    const stream = outputCanvas.captureStream(fps)
    const recorder = new MediaRecorder(stream, { mimeType })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })

    recorder.start()
    const frameDurationMs = 1000 / fps
    for (const frame of frames) {
      ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height)
      ctx.drawImage(frame, 0, 0)
      await new Promise((r) => setTimeout(r, frameDurationMs))
    }
    recorder.stop()
    await stopped
    return new Blob(chunks, { type: 'video/webm' })
  }

  return { buildStandaloneSvg, buildAnimatedSvg, rasterize, exportGif, exportVideo }
}
