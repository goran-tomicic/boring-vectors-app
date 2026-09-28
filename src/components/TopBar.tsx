import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../store/editorStore'
import './TopBar.css'

function TopBar() {
  const currentProjectName = useEditorStore((s) => s.currentProjectName)
  const requestRenameProject = useEditorStore((s) => s.requestRenameProject)
  const animationEnabled = useEditorStore((s) => s.settings.animationEnabled)
  const appMode = useEditorStore((s) => s.appMode)
  const setAppMode = useEditorStore((s) => s.setAppMode)
  const openImportModal = useEditorStore((s) => s.openImportModal)
  const openExportModal = useEditorStore((s) => s.openExportModal)
  const openSettingsModal = useEditorStore((s) => s.openSettingsModal)
  const openProjectsModal = useEditorStore((s) => s.openProjectsModal)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [editingName, setEditingName] = useState<string | null>(null)

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

  const startEditingName = () => setEditingName(currentProjectName || 'Untitled')

  const commitEditingName = () => {
    if (editingName !== null) requestRenameProject(editingName)
    setEditingName(null)
  }

  const cancelEditingName = () => setEditingName(null)

  return (
    <header className="TopBar">
      {editingName !== null ? (
        <input
          type="text"
          className="TopBar-projectNameInput"
          value={editingName}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setEditingName(e.target.value)}
          onBlur={commitEditingName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEditingName()
            else if (e.key === 'Escape') cancelEditingName()
          }}
        />
      ) : (
        <div
          className="TopBar-projectName"
          onClick={startEditingName}
          title="Click to rename"
        >
          {currentProjectName || 'Untitled'}
        </div>
      )}

      {animationEnabled && (
        <div className="TopBar-modeSwitch" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={appMode === 'draw'}
            onClick={() => setAppMode('draw')}
          >
            Draw
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={appMode === 'animate'}
            onClick={() => setAppMode('animate')}
          >
            Animate
          </button>
        </div>
      )}

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
            <button type="button" className="TopBar-dropdownItem" onClick={withMenuClose(openExportModal)}>
              Export
            </button>
            <button type="button" className="TopBar-dropdownItem" onClick={withMenuClose(openProjectsModal)}>
              Projects
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
