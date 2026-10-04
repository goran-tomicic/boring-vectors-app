import { useEditorStore } from '../store/editorStore'
import './LayersToggle.css'

function LayersToggle() {
  const layersPanelVisible = useEditorStore((s) => s.layersPanelVisible)
  const toggleLayersPanel = useEditorStore((s) => s.toggleLayersPanel)

  return (
    <div className="LayersToggle">
      <button
        type="button"
        className="LayersToggle-btn"
        title="Toggle layers panel"
        aria-pressed={layersPanelVisible}
        onClick={toggleLayersPanel}
      >
        <svg viewBox="0 0 16 16" fill="none">
          <path
            d="M8 2l6 3.5L8 9 2 5.5 8 2z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path d="M2 8.5L8 12l6-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M2 11.5L8 15l6-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}

export default LayersToggle
