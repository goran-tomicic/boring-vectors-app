import { useEditorStore } from '../store/editorStore'
import './SettingsModal.css'

function SettingsModal() {
  const isOpen = useEditorStore((s) => s.settingsModalOpen)
  const closeSettingsModal = useEditorStore((s) => s.closeSettingsModal)
  const scrollZoomOnly = useEditorStore((s) => s.settings.scrollZoomOnly)
  const setScrollZoomOnly = useEditorStore((s) => s.setScrollZoomOnly)

  if (!isOpen) return null

  return (
    <div className="SettingsModal-backdrop" onClick={closeSettingsModal}>
      <div className="SettingsModal" onClick={(e) => e.stopPropagation()}>
        <h2 className="SettingsModal-title">Settings</h2>

        <label className="SettingsModal-row">
          <input
            type="checkbox"
            checked={scrollZoomOnly}
            onChange={(e) => setScrollZoomOnly(e.target.checked)}
          />
          Scroll to zoom (plain scroll zooms instead of panning)
        </label>

        <div className="SettingsModal-actions">
          <button type="button" className="SettingsModal-close" onClick={closeSettingsModal}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
