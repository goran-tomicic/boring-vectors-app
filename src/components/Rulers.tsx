import { useEffect, useRef } from 'react'
import { useEditorStore } from '../store/editorStore'
import './Rulers.css'

const RULER_SIZE = 20
const TARGET_TICK_SPACING = 80
const RULER_BG = '#1c1d24'
const RULER_TEXT = '#6b6d78'
const RULER_TICK = '#35363f'
const ARTBOARD_BAND = 'rgba(170, 59, 255, 0.35)'
const ARTBOARD_LABEL = '#d9a8ff'

/** Rounds a raw project-unit spacing up to a human-friendly 1/2/5 * 10^n step. */
function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1
  const exponent = Math.floor(Math.log10(rawStep))
  const base = Math.pow(10, exponent)
  const fraction = rawStep / base
  if (fraction < 1.5) return base
  if (fraction < 3.5) return 2 * base
  if (fraction < 7.5) return 5 * base
  return 10 * base
}

function setupCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(cssWidth * dpr))
  canvas.height = Math.max(1, Math.round(cssHeight * dpr))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

function Rulers() {
  const topRef = useRef<HTMLCanvasElement>(null)
  const leftRef = useRef<HTMLCanvasElement>(null)
  const viewTransform = useEditorStore((s) => s.viewTransform)
  const canvasWidth = useEditorStore((s) => s.canvas.width)
  const canvasHeight = useEditorStore((s) => s.canvas.height)

  useEffect(() => {
    const topCanvas = topRef.current
    const leftCanvas = leftRef.current
    if (!topCanvas || !leftCanvas) return
    const { zoom, centerX, centerY, viewWidth, viewHeight } = viewTransform
    if (viewWidth === 0 || viewHeight === 0) return

    const toScreenX = (px: number) => (px - centerX) * zoom + viewWidth / 2
    const toScreenY = (py: number) => (py - centerY) * zoom + viewHeight / 2

    const majorStep = niceStep(TARGET_TICK_SPACING / zoom)
    const minorStep = majorStep / 5

    // --- Top ruler (X axis) ---
    const topCtx = setupCanvas(topCanvas, viewWidth, RULER_SIZE)
    if (topCtx) {
      topCtx.clearRect(0, 0, viewWidth, RULER_SIZE)
      topCtx.fillStyle = RULER_BG
      topCtx.fillRect(0, 0, viewWidth, RULER_SIZE)

      const bandStartX = toScreenX(0)
      const bandEndX = toScreenX(canvasWidth)
      topCtx.fillStyle = ARTBOARD_BAND
      topCtx.fillRect(bandStartX, RULER_SIZE - 4, bandEndX - bandStartX, 4)

      topCtx.fillStyle = ARTBOARD_LABEL
      topCtx.font = '9px sans-serif'
      topCtx.textBaseline = 'top'
      topCtx.fillText(`${canvasWidth} × ${canvasHeight}`, Math.max(4, bandStartX + 2), 2)

      topCtx.strokeStyle = RULER_TICK
      topCtx.fillStyle = RULER_TEXT
      const startProjX = centerX - viewWidth / 2 / zoom
      const endProjX = centerX + viewWidth / 2 / zoom
      const firstTick = Math.floor(startProjX / minorStep) * minorStep
      for (let v = firstTick; v <= endProjX; v += minorStep) {
        const x = toScreenX(v)
        const isMajor = Math.abs(Math.round(v / majorStep) * majorStep - v) < minorStep / 2
        topCtx.beginPath()
        topCtx.moveTo(x, isMajor ? 8 : 14)
        topCtx.lineTo(x, RULER_SIZE)
        topCtx.stroke()
        if (isMajor) {
          topCtx.fillText(String(Math.round(v)), x + 2, RULER_SIZE - 12)
        }
      }
    }

    // --- Left ruler (Y axis) ---
    const leftCtx = setupCanvas(leftCanvas, RULER_SIZE, viewHeight)
    if (leftCtx) {
      leftCtx.clearRect(0, 0, RULER_SIZE, viewHeight)
      leftCtx.fillStyle = RULER_BG
      leftCtx.fillRect(0, 0, RULER_SIZE, viewHeight)

      const bandStartY = toScreenY(0)
      const bandEndY = toScreenY(canvasHeight)
      leftCtx.fillStyle = ARTBOARD_BAND
      leftCtx.fillRect(RULER_SIZE - 4, bandStartY, 4, bandEndY - bandStartY)

      leftCtx.strokeStyle = RULER_TICK
      leftCtx.fillStyle = RULER_TEXT
      leftCtx.font = '9px sans-serif'
      const startProjY = centerY - viewHeight / 2 / zoom
      const endProjY = centerY + viewHeight / 2 / zoom
      const firstTickY = Math.floor(startProjY / minorStep) * minorStep
      for (let v = firstTickY; v <= endProjY; v += minorStep) {
        const y = toScreenY(v)
        const isMajor = Math.abs(Math.round(v / majorStep) * majorStep - v) < minorStep / 2
        leftCtx.beginPath()
        leftCtx.moveTo(isMajor ? 8 : 14, y)
        leftCtx.lineTo(RULER_SIZE, y)
        leftCtx.stroke()
        if (isMajor) {
          leftCtx.save()
          leftCtx.translate(10, y - 2)
          leftCtx.rotate(-Math.PI / 2)
          leftCtx.textBaseline = 'bottom'
          leftCtx.fillText(String(Math.round(v)), 0, 0)
          leftCtx.restore()
        }
      }
    }
  }, [viewTransform, canvasWidth, canvasHeight])

  return (
    <>
      <canvas ref={topRef} className="Rulers-top" />
      <canvas ref={leftRef} className="Rulers-left" />
      <div className="Rulers-corner" />
    </>
  )
}

export default Rulers
