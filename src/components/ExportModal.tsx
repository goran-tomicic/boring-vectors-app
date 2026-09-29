import { useState } from 'react'
import { useEditorStore } from '../store/editorStore'
import './ExportModal.css'

const RASTER_SCALES = [1, 2, 4] as const
const ANIMATION_FPS_OPTIONS = [12, 24, 30] as const

function ExportModal() {
  const isOpen = useEditorStore((s) => s.exportModalOpen)
  const closeExportModal = useEditorStore((s) => s.closeExportModal)
  const requestExport = useEditorStore((s) => s.requestExport)
  const animationEnabled = useEditorStore((s) => s.settings.animationEnabled)

  const [scale, setScale] = useState<(typeof RASTER_SCALES)[number]>(1)
  const [transparent, setTransparent] = useState(true)
  const [animationScale, setAnimationScale] = useState<(typeof RASTER_SCALES)[number]>(1)
  const [fps, setFps] = useState<(typeof ANIMATION_FPS_OPTIONS)[number]>(24)

  if (!isOpen) return null

  const runAndClose = (kind: Parameters<typeof requestExport>[0]) => {
    requestExport(kind)
    closeExportModal()
  }

  return (
    <div className="ExportModal-backdrop" onClick={closeExportModal}>
      <div className="ExportModal" onClick={(e) => e.stopPropagation()}>
        <h2 className="ExportModal-title">Export</h2>

        <div className="ExportModal-section">
          <div className="ExportModal-sectionTitle">SVG</div>
          <div className="ExportModal-row">
            <button type="button" onClick={() => runAndClose({ kind: 'copySvg' })}>
              Copy to clipboard
            </button>
            <button type="button" onClick={() => runAndClose({ kind: 'downloadSvg' })}>
              Download .svg
            </button>
            {animationEnabled && (
              <button
                type="button"
                onClick={() => runAndClose({ kind: 'downloadAnimatedSvg' })}
                title="Bakes all animatable properties in as native SVG animation — plays standalone, no app needed"
              >
                Download animated .svg
              </button>
            )}
          </div>
        </div>

        {animationEnabled && (
          <div className="ExportModal-section">
            <div className="ExportModal-sectionTitle">Animation (GIF / video)</div>
            <div className="ExportModal-rasterOptions">
              <label className="ExportModal-scaleLabel">
                Scale
                <select
                  value={animationScale}
                  onChange={(e) => setAnimationScale(Number(e.target.value) as typeof animationScale)}
                >
                  {RASTER_SCALES.map((s) => (
                    <option key={s} value={s}>
                      {s}×
                    </option>
                  ))}
                </select>
              </label>
              <label className="ExportModal-scaleLabel">
                FPS
                <select value={fps} onChange={(e) => setFps(Number(e.target.value) as typeof fps)}>
                  {ANIMATION_FPS_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="ExportModal-row">
              <button
                type="button"
                onClick={() => runAndClose({ kind: 'downloadGif', fps, scale: animationScale })}
                title="Renders every frame and encodes a GIF — may take a few seconds for longer/higher-fps clips"
              >
                Download .gif
              </button>
              <button
                type="button"
                onClick={() => runAndClose({ kind: 'downloadVideo', fps, scale: animationScale })}
                title="Records in real time — takes about as long as the animation's own duration"
              >
                Download .webm
              </button>
            </div>
          </div>
        )}

        <div className="ExportModal-section">
          <div className="ExportModal-sectionTitle">Raster image</div>
          <div className="ExportModal-rasterOptions">
            <label className="ExportModal-scaleLabel">
              Scale
              <select value={scale} onChange={(e) => setScale(Number(e.target.value) as typeof scale)}>
                {RASTER_SCALES.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
            <label className="ExportModal-checkboxLabel">
              <input
                type="checkbox"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
              />
              Transparent background
            </label>
          </div>
          <div className="ExportModal-row">
            <button
              type="button"
              onClick={() => runAndClose({ kind: 'downloadRaster', format: 'png', scale, transparent })}
            >
              Download .png
            </button>
            <button
              type="button"
              onClick={() => runAndClose({ kind: 'downloadRaster', format: 'jpg', scale, transparent: false })}
            >
              Download .jpg
            </button>
          </div>
        </div>

        <div className="ExportModal-section">
          <div className="ExportModal-sectionTitle">Project file</div>
          <div className="ExportModal-row">
            <button type="button" onClick={() => runAndClose({ kind: 'downloadProjectFile' })}>
              Download project file
            </button>
          </div>
        </div>

        <div className="ExportModal-actions">
          <button type="button" className="ExportModal-close" onClick={closeExportModal}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExportModal
