import { useRef, useState } from 'react'

/**
 * Drag-to-resize for a fixed-width side panel, clamped to [min, max]. Width updates are
 * throttled to one per animation frame rather than applied on every raw pointermove — a
 * continuous drag can fire pointermove far faster than the browser can deliver
 * ResizeObserver notifications for the resulting layout change (PaperCanvas.tsx observes
 * the canvas element to re-fit the view on any flex-layout change, Rulers.tsx included),
 * and applying every event synchronously was overwhelming it: the Rulers component would
 * occasionally redraw against a stale width mid-drag, out of sync with the actual layout.
 */
export function usePanelResize(
  defaultWidth: number,
  min: number,
  max: number,
  direction: 'grow-right' | 'grow-left',
) {
  const [width, setWidth] = useState(defaultWidth)
  const latestRef = useRef(width)
  const rafRef = useRef<number | null>(null)

  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = direction === 'grow-right' ? moveEvent.clientX - startX : startX - moveEvent.clientX
      latestRef.current = Math.min(max, Math.max(min, startWidth + delta))
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          setWidth(latestRef.current)
          rafRef.current = null
        })
      }
    }
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  return { width, handleResizeStart }
}
