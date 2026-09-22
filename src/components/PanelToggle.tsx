import { useEditorStore } from '../store/editorStore'
import './PanelToggle.css'

function PanelToggle() {
  const propsPanelVisible = useEditorStore((s) => s.propsPanelVisible)
  const togglePropsPanel = useEditorStore((s) => s.togglePropsPanel)

  return (
    <div className="PanelToggle">
      <button
        type="button"
        className="PanelToggle-btn"
        title="Toggle properties panel"
        aria-pressed={propsPanelVisible}
        onClick={togglePropsPanel}
      >
        <svg viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M10 3v10" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  )
}

export default PanelToggle
