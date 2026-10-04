import { useEditorStore } from '../store/editorStore'
import './LayersPanel.css'

function LayersPanel() {
  const layers = useEditorStore((s) => s.layers)
  const selectedPathIds = useEditorStore((s) => s.selectedPathIds)
  const setSelection = useEditorStore((s) => s.setSelection)

  return (
    <aside className="LayersPanel">
      <h3 className="LayersPanel-heading">Layers</h3>
      {layers.length === 0 ? (
        <div className="LayersPanel-empty">No shapes yet</div>
      ) : (
        <ul className="LayersPanel-list">
          {layers.map((layer) => {
            const isSelected = selectedPathIds.includes(layer.id)
            return (
              <li key={layer.id}>
                <button
                  type="button"
                  className="LayersPanel-row"
                  aria-pressed={isSelected}
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
                >
                  {layer.name}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

export default LayersPanel
