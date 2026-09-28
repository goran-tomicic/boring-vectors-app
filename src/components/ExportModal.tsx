import { useState } from 'react'
import { useEditorStore } from '../store/editorStore'
import './ExportModal.css'

const RASTER_SCALES = [1, 2, 4] as const

function ExportModal() {
  const isOpen = useEditorStore((s) => s.exportModalOpen)
  const closeExportModal = useEditorStore((s) => s.closeExportModal)
  const requestExport = useEditorStore((s) => s.requestExport)

  const [scale, setScale] = useState<(typeof RASTER_SCALES)[number]>(1)
  const [transparent, setTransparent] = useState(true)

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
          </div>
        </div>

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
