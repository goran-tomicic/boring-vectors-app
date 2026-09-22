import { useRef, useState } from 'react'
import { useEditorStore, type Tool } from '../store/editorStore'
import './Toolbar.css'

const TOOLS: { tool: Tool; title: string; icon: React.ReactNode }[] = [
  {
    tool: 'select',
    title: 'Select (V)',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <path d="M3 2l9 4.5-3.8 1.2L7 11.5 3 2z" fill="currentColor" />
      </svg>
    ),
  },
  {
    tool: 'node',
    title: 'Node (N)',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="4" cy="12" r="1.6" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="12" cy="4" r="1.6" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5.2 10.8L10.8 5.2" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    tool: 'addPoint',
    title: 'Add Point (+)',
    icon: <span style={{ fontSize: 15 }}>+</span>,
  },
]

const MAKER_TOOLS: { tool: Tool; title: string; icon: React.ReactNode }[] = [
  {
    tool: 'pen',
    title: 'Pen (P)',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <path
          d="M11 2l3 3-7.5 7.5-3.8 1 1-3.8L11 2z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    tool: 'rectangle',
    title: 'Rectangle (M)',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <rect x="3" y="4.5" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    tool: 'ellipse',
    title: 'Ellipse (L)',
    icon: (
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
]

const RULER_TOOL: { tool: Tool; title: string; icon: React.ReactNode } = {
  tool: 'ruler',
  title: 'Ruler (R)',
  icon: (
    <svg viewBox="0 0 16 16" fill="none">
      <rect x="2" y="6" width="12" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 6v1.4M7 6v2M9.5 6v1.4M12 6v2" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  ),
}

interface DragPosition {
  left: number
  top: number
}

function Toolbar() {
  const tool = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)

  const pillRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<DragPosition | null>(null)
  const dragOffset = useRef({ x: 0, y: 0 })

  const handleDragStart = (event: React.PointerEvent) => {
    const pill = pillRef.current
    const bounds = pill?.offsetParent as HTMLElement | null
    if (!pill || !bounds) return

    const pillRect = pill.getBoundingClientRect()
    dragOffset.current = {
      x: event.clientX - pillRect.left,
      y: event.clientY - pillRect.top,
    }

    const handleMove = (moveEvent: PointerEvent) => {
      const boundsRect = bounds.getBoundingClientRect()
      let left = moveEvent.clientX - boundsRect.left - dragOffset.current.x
      let top = moveEvent.clientY - boundsRect.top - dragOffset.current.y
      left = Math.max(0, Math.min(left, boundsRect.width - pillRect.width))
      top = Math.max(0, Math.min(top, boundsRect.height - pillRect.height))
      setPosition({ left, top })
    }
    const handleUp = () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
    }
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
  }

  return (
    <div
      ref={pillRef}
      className="Toolbar"
      style={position ? { left: position.left, top: position.top, bottom: 'auto', transform: 'none' } : undefined}
    >
      <div className="Toolbar-handle" title="Drag to move" onPointerDown={handleDragStart}>
        <svg viewBox="0 0 6 16" fill="none">
          <circle cx="1.2" cy="1.5" r="1.1" fill="currentColor" />
          <circle cx="4.8" cy="1.5" r="1.1" fill="currentColor" />
          <circle cx="1.2" cy="8" r="1.1" fill="currentColor" />
          <circle cx="4.8" cy="8" r="1.1" fill="currentColor" />
          <circle cx="1.2" cy="14.5" r="1.1" fill="currentColor" />
          <circle cx="4.8" cy="14.5" r="1.1" fill="currentColor" />
        </svg>
      </div>

      <div className="Toolbar-div" />

      {TOOLS.map(({ tool: t, title, icon }) => (
        <button
          key={t}
          type="button"
          className="Toolbar-btn"
          title={title}
          aria-pressed={tool === t}
          onClick={() => setTool(t)}
        >
          {icon}
        </button>
      ))}

      <div className="Toolbar-div" />

      {MAKER_TOOLS.map(({ tool: t, title, icon }) => (
        <button
          key={t}
          type="button"
          className="Toolbar-btn"
          title={title}
          aria-pressed={tool === t}
          onClick={() => setTool(t)}
        >
          {icon}
        </button>
      ))}

      <div className="Toolbar-div" />

      <button
        type="button"
        className="Toolbar-btn"
        title={RULER_TOOL.title}
        aria-pressed={tool === RULER_TOOL.tool}
        onClick={() => setTool(RULER_TOOL.tool)}
      >
        {RULER_TOOL.icon}
      </button>
    </div>
  )
}

export default Toolbar
