import { useState } from 'react'
import { useEditorStore } from '../store/editorStore'
import { SAMPLE_SHAPES } from '../sampleShapes'
import './ImportModal.css'

function ImportModal() {
  const isOpen = useEditorStore((s) => s.importModalOpen)
  const closeImportModal = useEditorStore((s) => s.closeImportModal)
  const requestImport = useEditorStore((s) => s.requestImport)
  const [svgText, setSvgText] = useState('')

  if (!isOpen) return null

  const handleImport = () => {
    if (!svgText.trim()) return
    requestImport(svgText)
    setSvgText('')
    closeImportModal()
  }

  const handleClose = () => {
    setSvgText('')
    closeImportModal()
  }

  return (
    <div className="ImportModal-backdrop" onClick={handleClose}>
      <div className="ImportModal" onClick={(e) => e.stopPropagation()}>
        <h2 className="ImportModal-title">Import SVG</h2>

        <textarea
          className="ImportModal-textarea"
          placeholder="Paste raw SVG markup here…"
          value={svgText}
          onChange={(e) => setSvgText(e.target.value)}
        />

        <div className="ImportModal-samples">
          {SAMPLE_SHAPES.map((shape) => (
            <button
              key={shape.name}
              type="button"
              className="ImportModal-sample"
              onClick={() => setSvgText(shape.svg)}
            >
              {shape.name}
            </button>
          ))}
        </div>

        <div className="ImportModal-actions">
          <button type="button" className="ImportModal-cancel" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ImportModal-confirm"
            onClick={handleImport}
            disabled={!svgText.trim()}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  )
}

export default ImportModal
