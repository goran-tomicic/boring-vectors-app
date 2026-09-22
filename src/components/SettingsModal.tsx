import { useEditorStore } from '../store/editorStore'
import { MIN_CANVAS_SIZE, MAX_CANVAS_SIZE, clampCanvasSize } from '../canvasSize'
import './SettingsModal.css'

function SettingsModal() {
  const isOpen = useEditorStore((s) => s.settingsModalOpen)
  const closeSettingsModal = useEditorStore((s) => s.closeSettingsModal)
  const scrollZoomOnly = useEditorStore((s) => s.settings.scrollZoomOnly)
  const setScrollZoomOnly = useEditorStore((s) => s.setScrollZoomOnly)
  const theme = useEditorStore((s) => s.settings.theme)
  const setTheme = useEditorStore((s) => s.setTheme)
  const canvasWidth = useEditorStore((s) => s.canvas.width)
  const canvasHeight = useEditorStore((s) => s.canvas.height)
  const setCanvasSize = useEditorStore((s) => s.setCanvasSize)

  if (!isOpen) return null

  return (
    <div className="SettingsModal-backdrop" onClick={closeSettingsModal}>
      <div className="SettingsModal" onClick={(e) => e.stopPropagation()}>
        <h2 className="SettingsModal-title">Settings</h2>

        <div className="SettingsModal-section">
          <div className="SettingsModal-label">Canvas size</div>
          <div className="SettingsModal-sizeRow">
            <input
              type="number"
              min={MIN_CANVAS_SIZE}
              max={MAX_CANVAS_SIZE}
              value={canvasWidth}
              onChange={(e) => setCanvasSize(clampCanvasSize(Number(e.target.value)), canvasHeight)}
            />
            <span>×</span>
            <input
              type="number"
              min={MIN_CANVAS_SIZE}
              max={MAX_CANVAS_SIZE}
              value={canvasHeight}
              onChange={(e) => setCanvasSize(canvasWidth, clampCanvasSize(Number(e.target.value)))}
            />
          </div>
        </div>

        <div className="SettingsModal-section">
          <div className="SettingsModal-label">Theme</div>
          <div className="SettingsModal-themeRow">
            <button
              type="button"
              className="SettingsModal-themeBtn"
              aria-pressed={theme === 'dark'}
              onClick={() => setTheme('dark')}
            >
              Dark
            </button>
            <button
              type="button"
              className="SettingsModal-themeBtn"
              aria-pressed={theme === 'light'}
              onClick={() => setTheme('light')}
            >
              Light
            </button>
          </div>
        </div>

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
