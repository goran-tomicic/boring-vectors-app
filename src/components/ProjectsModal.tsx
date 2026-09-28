import { useRef, useState } from 'react'
import { useEditorStore } from '../store/editorStore'
import { listProjects, renameProject, deleteProject, type ProjectMeta, type ProjectPayload } from '../projects'
import './ProjectsModal.css'

/** Loose validation for a file picked via "Import project file" — just enough to avoid crashing on garbage input. */
function isProjectPayload(value: unknown): value is ProjectPayload {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.svg === 'string' && typeof v.canvasWidth === 'number' && typeof v.canvasHeight === 'number'
}

function ProjectsModal() {
  const isOpen = useEditorStore((s) => s.projectsModalOpen)
  const closeProjectsModal = useEditorStore((s) => s.closeProjectsModal)
  const currentProjectId = useEditorStore((s) => s.currentProjectId)
  const requestSwitchProject = useEditorStore((s) => s.requestSwitchProject)
  const requestNewProject = useEditorStore((s) => s.requestNewProject)
  const requestImportProjectFile = useEditorStore((s) => s.requestImportProjectFile)
  const requestRenameProject = useEditorStore((s) => s.requestRenameProject)

  // Bumped after a mutation to force a re-read of localStorage below — the
  // list itself is derived during render rather than mirrored into state.
  const [refreshTick, setRefreshTick] = useState(0)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [importError, setImportError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const projects = listProjects()
  void refreshTick

  const refresh = () => setRefreshTick((t) => t + 1)

  const handleCreate = () => {
    const name = newName.trim() || 'Untitled'
    requestNewProject(name)
    setNewName('')
    closeProjectsModal()
  }

  const handleOpen = (id: string) => {
    requestSwitchProject(id)
    closeProjectsModal()
  }

  const startRename = (doc: ProjectMeta) => {
    setEditingId(doc.id)
    setEditingName(doc.name)
  }

  const commitRename = (id: string) => {
    const name = editingName.trim() || 'Untitled'
    if (id === currentProjectId) {
      // Goes through PaperCanvas so its in-memory autosave name stays in sync — see requestRenameProject.
      requestRenameProject(name)
    } else {
      renameProject(id, name)
    }
    setEditingId(null)
    refresh()
  }

  const handleDelete = (id: string) => {
    deleteProject(id)
    refresh()
  }

  const handleImportFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const rawName = (parsed as { name?: unknown } | null)?.name
      if (!isProjectPayload(parsed)) throw new Error('Not a valid project file')
      const name = typeof rawName === 'string' ? rawName : file.name.replace(/\.json$/i, '')
      setImportError('')
      requestImportProjectFile(name, parsed)
      closeProjectsModal()
    } catch {
      setImportError('Could not read that file as a project file.')
    }
  }

  return (
    <div className="ProjectsModal-backdrop" onClick={closeProjectsModal}>
      <div className="ProjectsModal" onClick={(e) => e.stopPropagation()}>
        <h2 className="ProjectsModal-title">Projects</h2>

        <div className="ProjectsModal-new">
          <input
            type="text"
            placeholder="New project name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button type="button" onClick={handleCreate}>
            New
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Import file…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="ProjectsModal-fileInput"
            onChange={handleImportFileChosen}
          />
        </div>
        {importError && <div className="ProjectsModal-error">{importError}</div>}

        <ul className="ProjectsModal-list">
          {projects.map((doc) => {
            const isCurrent = doc.id === currentProjectId
            return (
              <li key={doc.id} className="ProjectsModal-row">
                {editingId === doc.id ? (
                  <input
                    type="text"
                    className="ProjectsModal-nameInput"
                    value={editingName}
                    autoFocus
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => commitRename(doc.id)}
                    onKeyDown={(e) => e.key === 'Enter' && commitRename(doc.id)}
                  />
                ) : (
                  <span
                    className="ProjectsModal-name"
                    onDoubleClick={() => startRename(doc)}
                    title="Double-click to rename"
                  >
                    {doc.name}
                    {isCurrent && <span className="ProjectsModal-current"> (current)</span>}
                  </span>
                )}
                <div className="ProjectsModal-actions">
                  <button type="button" disabled={isCurrent} onClick={() => handleOpen(doc.id)}>
                    Open
                  </button>
                  <button type="button" onClick={() => startRename(doc)}>
                    Rename
                  </button>
                  <button type="button" disabled={isCurrent} onClick={() => handleDelete(doc.id)}>
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="ProjectsModal-footer">
          <button type="button" onClick={closeProjectsModal}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProjectsModal
