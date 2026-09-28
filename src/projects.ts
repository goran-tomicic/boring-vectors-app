import type { AnimationClip } from './animation'

export interface ProjectMeta {
  id: string
  name: string
  updatedAt: number
}

export interface ProjectPayload {
  svg: string
  canvasWidth: number
  canvasHeight: number
  backgroundColor?: string
  backgroundOpacity?: number
  /** Keyframe timeline data (docs/ROADMAP.md step 3) — absent on projects saved before animation existed. */
  animation?: AnimationClip
}

export const DEFAULT_BACKGROUND_COLOR = '#1f2028'
export const DEFAULT_BACKGROUND_OPACITY = 1

// Storage keys keep their original "document" wording for backward compat with data
// already saved under them — renaming the keys would orphan existing users' projects.
const INDEX_KEY = 'boring-vectors:documents'
const CURRENT_KEY = 'boring-vectors:currentDocument'
const DOCUMENT_KEY_PREFIX = 'boring-vectors:document:'

function projectKey(id: string) {
  return `${DOCUMENT_KEY_PREFIX}${id}`
}

function createProjectId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function listProjects(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    return (JSON.parse(raw) as ProjectMeta[]).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function saveIndex(list: ProjectMeta[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list))
  } catch {
    // Storage full or unavailable — best-effort.
  }
}

export function loadProject(id: string): ProjectPayload | null {
  try {
    const raw = localStorage.getItem(projectKey(id))
    if (!raw) return null
    return JSON.parse(raw) as ProjectPayload
  } catch {
    return null
  }
}

/** Saves the project's content and bumps its updatedAt in the index (creating the entry if missing). */
export function saveProject(id: string, name: string, payload: ProjectPayload) {
  try {
    localStorage.setItem(projectKey(id), JSON.stringify(payload))
  } catch {
    return
  }
  const list = listProjects()
  const existing = list.find((doc) => doc.id === id)
  if (existing) {
    existing.updatedAt = Date.now()
  } else {
    list.push({ id, name, updatedAt: Date.now() })
  }
  saveIndex(list)
}

export function renameProject(id: string, name: string) {
  const list = listProjects()
  const doc = list.find((d) => d.id === id)
  if (!doc) return
  doc.name = name
  saveIndex(list)
}

export function deleteProject(id: string) {
  const list = listProjects().filter((doc) => doc.id !== id)
  saveIndex(list)
  try {
    localStorage.removeItem(projectKey(id))
  } catch {
    // Ignore.
  }
}

function getCurrentProjectId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

export function setCurrentProjectId(id: string) {
  try {
    localStorage.setItem(CURRENT_KEY, id)
  } catch {
    // Ignore.
  }
}

/** Ensures a current project exists, creating a blank "Untitled" one if this is a fresh install. */
export function ensureCurrentProject(): { id: string; name: string; payload: ProjectPayload } {
  const currentId = getCurrentProjectId()
  if (currentId) {
    const payload = loadProject(currentId)
    if (payload) {
      const meta = listProjects().find((doc) => doc.id === currentId)
      return { id: currentId, name: meta?.name ?? 'Untitled', payload }
    }
  }
  const id = createProjectId()
  const payload: ProjectPayload = { svg: '', canvasWidth: 800, canvasHeight: 600 }
  saveProject(id, 'Untitled', payload)
  setCurrentProjectId(id)
  return { id, name: 'Untitled', payload }
}

export { createProjectId }
