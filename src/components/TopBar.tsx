import { useEditorStore, type Tool } from '../store/editorStore'
import './TopBar.css'

const TOOLS: { tool: Tool; label: string; title: string }[] = [
  { tool: 'select', label: 'V', title: 'Select (V)' },
  { tool: 'node', label: 'N', title: 'Node (N)' },
  { tool: 'addPoint', label: '+', title: 'Add Point (+)' },
  { tool: 'ruler', label: 'R', title: 'Ruler (R)' },
  { tool: 'pen', label: 'P', title: 'Pen (P)' },
  { tool: 'rectangle', label: '▭', title: 'Rectangle (M)' },
  { tool: 'ellipse', label: '◯', title: 'Ellipse (L)' },
]

const MIN_CANVAS_SIZE = 100
const MAX_CANVAS_SIZE = 4000

function clampCanvasSize(value: number) {
  if (Number.isNaN(value)) return MIN_CANVAS_SIZE
  return Math.min(MAX_CANVAS_SIZE, Math.max(MIN_CANVAS_SIZE, value))
}

function TopBar() {
  const tool = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)
  const canvasWidth = useEditorStore((s) => s.canvas.width)
  const canvasHeight = useEditorStore((s) => s.canvas.height)
  const setCanvasSize = useEditorStore((s) => s.setCanvasSize)
  const gridVisible = useEditorStore((s) => s.canvas.gridVisible)
  const toggleGrid = useEditorStore((s) => s.toggleGrid)
  const selectedPathIds = useEditorStore((s) => s.selectedPathIds)
  const requestDelete = useEditorStore((s) => s.requestDelete)
  const openImportModal = useEditorStore((s) => s.openImportModal)
  const requestExport = useEditorStore((s) => s.requestExport)
  const openSettingsModal = useEditorStore((s) => s.openSettingsModal)
  const currentDocumentName = useEditorStore((s) => s.currentDocumentName)
  const openDocumentsModal = useEditorStore((s) => s.openDocumentsModal)

  return (
    <header className="TopBar">
      <div className="TopBar-group TopBar-tools">
        {TOOLS.map(({ tool: t, label, title }) => (
          <button
            key={t}
            type="button"
            className="TopBar-tool"
            title={title}
            aria-pressed={tool === t}
            onClick={() => setTool(t)}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="TopBar-documentName"
        onClick={openDocumentsModal}
        title="Documents"
      >
        {currentDocumentName || 'Untitled'}
      </button>

      <div className="TopBar-group TopBar-canvasSize">
        <input
          type="number"
          className="TopBar-sizeInput"
          min={MIN_CANVAS_SIZE}
          max={MAX_CANVAS_SIZE}
          value={canvasWidth}
          onChange={(e) => setCanvasSize(clampCanvasSize(Number(e.target.value)), canvasHeight)}
        />
        <span className="TopBar-sizeTimes">×</span>
        <input
          type="number"
          className="TopBar-sizeInput"
          min={MIN_CANVAS_SIZE}
          max={MAX_CANVAS_SIZE}
          value={canvasHeight}
          onChange={(e) => setCanvasSize(canvasWidth, clampCanvasSize(Number(e.target.value)))}
        />
      </div>

      <div className="TopBar-group TopBar-actions">
        <button
          type="button"
          className="TopBar-action"
          title="Toggle grid (G)"
          aria-pressed={gridVisible}
          onClick={toggleGrid}
        >
          Grid
        </button>
        <button type="button" className="TopBar-action" onClick={openImportModal}>
          Import
        </button>
        <button
          type="button"
          className="TopBar-action"
          onClick={requestExport}
          title="Copy SVG to clipboard"
        >
          Export
        </button>
        <button
          type="button"
          className="TopBar-action"
          disabled={selectedPathIds.length === 0}
          onClick={requestDelete}
        >
          Delete
        </button>
        <button type="button" className="TopBar-action" onClick={openSettingsModal}>
          Settings
        </button>
      </div>
    </header>
  )
}

export default TopBar
