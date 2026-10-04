import { useState } from 'react'
import { useEditorStore } from '../store/editorStore'
import { usePanelResize } from './usePanelResize'
import './LayersPanel.css'

const MIN_PANEL_WIDTH = 160
const MAX_PANEL_WIDTH = 480
const DEFAULT_PANEL_WIDTH = 260

function LayersPanel() {
  const layers = useEditorStore((s) => s.layers)
  const selectedPathIds = useEditorStore((s) => s.selectedPathIds)
  const setSelection = useEditorStore((s) => s.setSelection)
  const renameLayer = useEditorStore((s) => s.renameLayer)

  // Docked on the left — dragging the right-edge handle right should grow the panel.
  const { width, handleResizeStart } = usePanelResize(
    DEFAULT_PANEL_WIDTH,
    MIN_PANEL_WIDTH,
    MAX_PANEL_WIDTH,
    'grow-right',
  )

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const startEditing = (id: string, currentName: string) => {
    setEditingId(id)
    setEditingValue(currentName)
  }
  const commitEditing = () => {
    if (editingId !== null) renameLayer(editingId, editingValue)
    setEditingId(null)
  }
  const cancelEditing = () => setEditingId(null)

  return (
    <aside className="LayersPanel" style={{ width }}>
      <h3 className="LayersPanel-heading">Layers</h3>
      {layers.length === 0 ? (
        <div className="LayersPanel-empty">No shapes yet</div>
      ) : (
        <ul className="LayersPanel-list">
          {layers.map((layer) => {
            const isSelected = selectedPathIds.includes(layer.id)
            const isEditing = editingId === layer.id
            return (
              <li key={layer.id}>
                {isEditing ? (
                  <input
                    type="text"
                    className="LayersPanel-rowInput"
                    value={editingValue}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={commitEditing}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEditing()
                      else if (e.key === 'Escape') cancelEditing()
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="LayersPanel-row"
                    aria-pressed={isSelected}
                    title="Click to select, double-click to rename"
                    onClick={(e) => {
                      if (e.shiftKey) {
                        setSelection(
                          isSelected
                            ? selectedPathIds.filter((id) => id !== layer.id)
                            : [...selectedPathIds, layer.id],
                        )
                      } else {
                        setSelection([layer.id])
                      }
                    }}
                    onDoubleClick={() => startEditing(layer.id, layer.name)}
                  >
                    {layer.name}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <div className="LayersPanel-resizeHandle" onPointerDown={handleResizeStart} title="Drag to resize" />
    </aside>
  )
}

export default LayersPanel
