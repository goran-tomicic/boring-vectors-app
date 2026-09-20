import { useState } from 'react'
import { useEditorStore } from '../store/editorStore'
import { listDocuments, renameDocument, deleteDocument, type DocumentMeta } from '../documents'
import './DocumentsModal.css'

function DocumentsModal() {
  const isOpen = useEditorStore((s) => s.documentsModalOpen)
  const closeDocumentsModal = useEditorStore((s) => s.closeDocumentsModal)
  const currentDocumentId = useEditorStore((s) => s.currentDocumentId)
  const requestSwitchDocument = useEditorStore((s) => s.requestSwitchDocument)
  const requestNewDocument = useEditorStore((s) => s.requestNewDocument)
  const setCurrentDocument = useEditorStore((s) => s.setCurrentDocument)

  // Bumped after a mutation to force a re-read of localStorage below — the
  // list itself is derived during render rather than mirrored into state.
  const [refreshTick, setRefreshTick] = useState(0)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  if (!isOpen) return null

  const documents = listDocuments()
  void refreshTick

  const refresh = () => setRefreshTick((t) => t + 1)

  const handleCreate = () => {
    const name = newName.trim() || 'Untitled'
    requestNewDocument(name)
    setNewName('')
    closeDocumentsModal()
  }

  const handleOpen = (id: string) => {
    requestSwitchDocument(id)
    closeDocumentsModal()
  }

  const startRename = (doc: DocumentMeta) => {
    setEditingId(doc.id)
    setEditingName(doc.name)
  }

  const commitRename = (id: string) => {
    const name = editingName.trim() || 'Untitled'
    renameDocument(id, name)
    if (id === currentDocumentId) setCurrentDocument(id, name)
    setEditingId(null)
    refresh()
  }

  const handleDelete = (id: string) => {
    deleteDocument(id)
    refresh()
  }

  return (
    <div className="DocumentsModal-backdrop" onClick={closeDocumentsModal}>
      <div className="DocumentsModal" onClick={(e) => e.stopPropagation()}>
        <h2 className="DocumentsModal-title">Documents</h2>

        <div className="DocumentsModal-new">
          <input
            type="text"
            placeholder="New document name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button type="button" onClick={handleCreate}>
            New
          </button>
        </div>

        <ul className="DocumentsModal-list">
          {documents.map((doc) => {
            const isCurrent = doc.id === currentDocumentId
            return (
              <li key={doc.id} className="DocumentsModal-row">
                {editingId === doc.id ? (
                  <input
                    type="text"
                    className="DocumentsModal-nameInput"
                    value={editingName}
                    autoFocus
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => commitRename(doc.id)}
                    onKeyDown={(e) => e.key === 'Enter' && commitRename(doc.id)}
                  />
                ) : (
                  <span
                    className="DocumentsModal-name"
                    onDoubleClick={() => startRename(doc)}
                    title="Double-click to rename"
                  >
                    {doc.name}
                    {isCurrent && <span className="DocumentsModal-current"> (current)</span>}
                  </span>
                )}
                <div className="DocumentsModal-actions">
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

        <div className="DocumentsModal-footer">
          <button type="button" onClick={closeDocumentsModal}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default DocumentsModal
