import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../store/editorStore'
import './TopBar.css'

function TopBar() {
  const currentDocumentName = useEditorStore((s) => s.currentDocumentName)
  const openImportModal = useEditorStore((s) => s.openImportModal)
  const requestExport = useEditorStore((s) => s.requestExport)
  const openSettingsModal = useEditorStore((s) => s.openSettingsModal)
  const openDocumentsModal = useEditorStore((s) => s.openDocumentsModal)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const withMenuClose = (action: () => void) => () => {
    action()
    setMenuOpen(false)
  }

  return (
    <header className="TopBar">
      <div className="TopBar-documentName">{currentDocumentName || 'Untitled'}</div>

      <div className="TopBar-menuWrap" ref={menuRef}>
        <button
          type="button"
          className="TopBar-menuButton"
          title="Menu"
          aria-pressed={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <circle cx="3" cy="8" r="1.4" />
            <circle cx="8" cy="8" r="1.4" />
            <circle cx="13" cy="8" r="1.4" />
          </svg>
        </button>

        {menuOpen && (
          <div className="TopBar-dropdown">
            <button type="button" className="TopBar-dropdownItem" onClick={withMenuClose(openImportModal)}>
              Import
            </button>
            <button type="button" className="TopBar-dropdownItem" onClick={withMenuClose(requestExport)}>
              Export
            </button>
            <button type="button" className="TopBar-dropdownItem" onClick={withMenuClose(openDocumentsModal)}>
              Documents
            </button>
            <button type="button" className="TopBar-dropdownItem" onClick={withMenuClose(openSettingsModal)}>
              Settings
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

export default TopBar
