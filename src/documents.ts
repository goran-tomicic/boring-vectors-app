export interface DocumentMeta {
  id: string
  name: string
  updatedAt: number
}

export interface DocumentPayload {
  svg: string
  canvasWidth: number
  canvasHeight: number
  backgroundColor?: string
  backgroundOpacity?: number
}

export const DEFAULT_BACKGROUND_COLOR = '#1f2028'
export const DEFAULT_BACKGROUND_OPACITY = 1

const INDEX_KEY = 'boring-vectors:documents'
const CURRENT_KEY = 'boring-vectors:currentDocument'
const DOCUMENT_KEY_PREFIX = 'boring-vectors:document:'

function documentKey(id: string) {
  return `${DOCUMENT_KEY_PREFIX}${id}`
}

function createDocumentId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function listDocuments(): DocumentMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    return (JSON.parse(raw) as DocumentMeta[]).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function saveIndex(list: DocumentMeta[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list))
  } catch {
    // Storage full or unavailable — best-effort.
  }
}

export function loadDocument(id: string): DocumentPayload | null {
  try {
    const raw = localStorage.getItem(documentKey(id))
    if (!raw) return null
    return JSON.parse(raw) as DocumentPayload
  } catch {
    return null
  }
}

/** Saves the document's content and bumps its updatedAt in the index (creating the entry if missing). */
export function saveDocument(id: string, name: string, payload: DocumentPayload) {
  try {
    localStorage.setItem(documentKey(id), JSON.stringify(payload))
  } catch {
    return
  }
  const list = listDocuments()
  const existing = list.find((doc) => doc.id === id)
  if (existing) {
    existing.updatedAt = Date.now()
  } else {
    list.push({ id, name, updatedAt: Date.now() })
  }
  saveIndex(list)
}

export function renameDocument(id: string, name: string) {
  const list = listDocuments()
  const doc = list.find((d) => d.id === id)
  if (!doc) return
  doc.name = name
  saveIndex(list)
}

export function deleteDocument(id: string) {
  const list = listDocuments().filter((doc) => doc.id !== id)
  saveIndex(list)
  try {
    localStorage.removeItem(documentKey(id))
  } catch {
    // Ignore.
  }
}

function getCurrentDocumentId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

export function setCurrentDocumentId(id: string) {
  try {
    localStorage.setItem(CURRENT_KEY, id)
  } catch {
    // Ignore.
  }
}

/** Ensures a current document exists, creating a blank "Untitled" one if this is a fresh install. */
export function ensureCurrentDocument(): { id: string; name: string; payload: DocumentPayload } {
  const currentId = getCurrentDocumentId()
  if (currentId) {
    const payload = loadDocument(currentId)
    if (payload) {
      const meta = listDocuments().find((doc) => doc.id === currentId)
      return { id: currentId, name: meta?.name ?? 'Untitled', payload }
    }
  }
  const id = createDocumentId()
  const payload: DocumentPayload = { svg: '', canvasWidth: 800, canvasHeight: 600 }
  saveDocument(id, 'Untitled', payload)
  setCurrentDocumentId(id)
  return { id, name: 'Untitled', payload }
}

export { createDocumentId }
