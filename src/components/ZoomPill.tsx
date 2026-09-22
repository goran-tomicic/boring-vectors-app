import { useEditorStore } from '../store/editorStore'
import './ZoomPill.css'

function ZoomPill() {
  const gridVisible = useEditorStore((s) => s.canvas.gridVisible)
  const toggleGrid = useEditorStore((s) => s.toggleGrid)
  const zoom = useEditorStore((s) => s.viewTransform.zoom)

  return (
    <div className="ZoomPill">
      <button
        type="button"
        className="ZoomPill-btn"
        title="Toggle grid (G)"
        aria-pressed={gridVisible}
        onClick={toggleGrid}
      >
        <svg viewBox="0 0 16 16" fill="none">
          <path d="M2 6h12M2 10h12M6 2v12M10 2v12" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </button>
      <div className="ZoomPill-div" />
      <span className="ZoomPill-value" title="Zoom (fit to view: 0)">
        {Math.round(zoom * 100)}%
      </span>
    </div>
  )
}

export default ZoomPill
