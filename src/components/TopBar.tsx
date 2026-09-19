import { useEditorStore, type Tool } from '../store/editorStore'
import './TopBar.css'

const TOOLS: { tool: Tool; label: string; title: string }[] = [
  { tool: 'select', label: 'V', title: 'Select (V)' },
  { tool: 'node', label: 'N', title: 'Node (N)' },
  { tool: 'addPoint', label: '+', title: 'Add Point (+)' },
]

function TopBar() {
  const tool = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)
  const gridVisible = useEditorStore((s) => s.canvas.gridVisible)
  const toggleGrid = useEditorStore((s) => s.toggleGrid)
  const selectedPathId = useEditorStore((s) => s.selectedPathId)
  const requestDelete = useEditorStore((s) => s.requestDelete)
  const openImportModal = useEditorStore((s) => s.openImportModal)

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

      <div className="TopBar-group TopBar-canvasSize">
        <input type="number" className="TopBar-sizeInput" disabled />
        <span className="TopBar-sizeTimes">×</span>
        <input type="number" className="TopBar-sizeInput" disabled />
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
        <button type="button" className="TopBar-action" disabled>
          Export
        </button>
        <button
          type="button"
          className="TopBar-action"
          disabled={!selectedPathId}
          onClick={requestDelete}
        >
          Delete
        </button>
        <button type="button" className="TopBar-action" disabled>
          Settings
        </button>
      </div>
    </header>
  )
}

export default TopBar
