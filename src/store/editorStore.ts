import { create } from 'zustand'
import type { ProjectPayload as ProjectFilePayload } from '../projects'

export type Tool = 'select' | 'node' | 'addPoint' | 'ruler' | 'pen' | 'rectangle' | 'ellipse'
export type Theme = 'dark' | 'light'

/** Read-only snapshot of the selected path's Paper.js properties, refreshed by PaperCanvas on every selection/geometry change. */
export interface SelectedPathProps {
  x: number
  y: number
  width: number
  height: number
  node: { x: number; y: number } | null
  handleIn: { x: number; y: number } | null
  handleOut: { x: number; y: number } | null
  strokeColor: string
  strokeOpacity: number
  strokeWidth: number
  fillColor: string | null
  fillOpacity: number
  nodeCount: number
  closed: boolean
}

export type PropsEdit =
  | { kind: 'position'; x: number; y: number }
  | { kind: 'node'; x: number; y: number }
  | { kind: 'handleIn'; x: number; y: number }
  | { kind: 'handleOut'; x: number; y: number }
  | { kind: 'stroke'; color?: string; opacity?: number; width?: number }
  | { kind: 'fill'; color: string | null; opacity?: number }

export type ExportKind =
  | { kind: 'copySvg' }
  | { kind: 'downloadSvg' }
  | { kind: 'downloadRaster'; format: 'png' | 'jpg'; scale: number; transparent: boolean }
  | { kind: 'downloadProjectFile' }

interface CanvasState {
  width: number
  height: number
  gridVisible: boolean
  zoom: number
  backgroundColor: string
  backgroundOpacity: number
}

interface SettingsState {
  scrollZoomOnly: boolean
  theme: Theme
}

/** Live view transform, pushed by PaperCanvas on every pan/zoom/resize so the Rulers component can track it without touching Paper.js. */
export interface ViewTransform {
  zoom: number
  centerX: number
  centerY: number
  viewWidth: number
  viewHeight: number
}

export interface EditorState {
  tool: Tool
  /** Multiple paths can be selected (Select tool: shift-click / marquee); Node tool always treats it as one active path. */
  selectedPathIds: string[]
  selectedSegmentIndex: number | null
  canvas: CanvasState
  settings: SettingsState
  status: string
  setTool: (tool: Tool) => void
  setCanvasSize: (width: number, height: number) => void
  toggleGrid: () => void
  setBackgroundColor: (color: string) => void
  setBackgroundOpacity: (opacity: number) => void
  setStatus: (status: string) => void
  /** Replaces the whole selection. */
  setSelection: (pathIds: string[], segmentIndex?: number | null) => void
  clearSelection: () => void
  /** Incremented to signal a delete-selection request from outside PaperCanvas (e.g. the toolbar). */
  deleteRequest: number
  requestDelete: () => void
  /** Nonce-based signal carrying the chosen export kind for PaperCanvas to perform — mirrors the deleteRequest pattern. */
  exportRequest: { kind: ExportKind; nonce: number } | null
  requestExport: (kind: ExportKind) => void
  exportModalOpen: boolean
  openExportModal: () => void
  closeExportModal: () => void
  importModalOpen: boolean
  openImportModal: () => void
  closeImportModal: () => void
  /** Nonce-based signal carrying raw SVG text for PaperCanvas to import — mirrors the deleteRequest pattern. */
  importRequest: { svg: string; nonce: number }
  requestImport: (svg: string) => void
  /** Nonce-based signal carrying an imported project file's payload for PaperCanvas to load as a new project. */
  importProjectFileRequest: { name: string; payload: ProjectFilePayload; nonce: number } | null
  requestImportProjectFile: (name: string, payload: ProjectFilePayload) => void
  /** Read-only; written by PaperCanvas only. */
  selectedPathProps: SelectedPathProps | null
  setSelectedPathProps: (props: SelectedPathProps | null) => void
  /** Nonce-based signal carrying a PropsPanel edit for PaperCanvas to apply — mirrors deleteRequest/importRequest. */
  propsEditRequest: { edit: PropsEdit; nonce: number } | null
  requestPropsEdit: (edit: PropsEdit) => void
  settingsModalOpen: boolean
  openSettingsModal: () => void
  closeSettingsModal: () => void
  setScrollZoomOnly: (value: boolean) => void
  setTheme: (theme: Theme) => void
  /** Read-only; written by PaperCanvas only. */
  viewTransform: ViewTransform
  setViewTransform: (transform: ViewTransform) => void
  /** Reflects the currently open project; written by PaperCanvas on load/switch, or by ProjectsModal when renaming the open project. */
  currentProjectId: string
  currentProjectName: string
  setCurrentProject: (id: string, name: string) => void
  projectsModalOpen: boolean
  openProjectsModal: () => void
  closeProjectsModal: () => void
  /** Nonce-based signal for PaperCanvas to switch the live canvas to a different saved project. */
  switchProjectRequest: { id: string; nonce: number } | null
  requestSwitchProject: (id: string) => void
  /** Nonce-based signal for PaperCanvas to save current content, then reset the canvas to a new blank project. */
  newProjectRequest: { name: string; nonce: number } | null
  requestNewProject: (name: string) => void
  propsPanelVisible: boolean
  togglePropsPanel: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'select',
  selectedPathIds: [],
  selectedSegmentIndex: null,
  canvas: { width: 800, height: 600, gridVisible: true, zoom: 1, backgroundColor: '#1f2028', backgroundOpacity: 1 },
  settings: { scrollZoomOnly: false, theme: 'dark' },
  status: 'Ready',
  setTool: (tool) => set({ tool }),
  setCanvasSize: (width, height) =>
    set((state) => ({ canvas: { ...state.canvas, width, height } })),
  toggleGrid: () =>
    set((state) => ({
      canvas: { ...state.canvas, gridVisible: !state.canvas.gridVisible },
    })),
  setBackgroundColor: (color) =>
    set((state) => ({ canvas: { ...state.canvas, backgroundColor: color } })),
  setBackgroundOpacity: (opacity) =>
    set((state) => ({
      canvas: { ...state.canvas, backgroundOpacity: Math.min(1, Math.max(0, opacity)) },
    })),
  setStatus: (status) => set({ status }),
  setSelection: (pathIds, segmentIndex = null) =>
    set({ selectedPathIds: pathIds, selectedSegmentIndex: segmentIndex }),
  clearSelection: () => set({ selectedPathIds: [], selectedSegmentIndex: null }),
  deleteRequest: 0,
  requestDelete: () => set((state) => ({ deleteRequest: state.deleteRequest + 1 })),
  exportRequest: null,
  requestExport: (kind) =>
    set((state) => ({ exportRequest: { kind, nonce: (state.exportRequest?.nonce ?? 0) + 1 } })),
  exportModalOpen: false,
  openExportModal: () => set({ exportModalOpen: true }),
  closeExportModal: () => set({ exportModalOpen: false }),
  importModalOpen: false,
  openImportModal: () => set({ importModalOpen: true }),
  closeImportModal: () => set({ importModalOpen: false }),
  importRequest: { svg: '', nonce: 0 },
  requestImport: (svg) =>
    set((state) => ({ importRequest: { svg, nonce: state.importRequest.nonce + 1 } })),
  importProjectFileRequest: null,
  requestImportProjectFile: (name, payload) =>
    set((state) => ({
      importProjectFileRequest: { name, payload, nonce: (state.importProjectFileRequest?.nonce ?? 0) + 1 },
    })),
  selectedPathProps: null,
  setSelectedPathProps: (props) => set({ selectedPathProps: props }),
  propsEditRequest: null,
  requestPropsEdit: (edit) =>
    set((state) => ({
      propsEditRequest: { edit, nonce: (state.propsEditRequest?.nonce ?? 0) + 1 },
    })),
  settingsModalOpen: false,
  openSettingsModal: () => set({ settingsModalOpen: true }),
  closeSettingsModal: () => set({ settingsModalOpen: false }),
  setScrollZoomOnly: (value) =>
    set((state) => ({ settings: { ...state.settings, scrollZoomOnly: value } })),
  setTheme: (theme) => set((state) => ({ settings: { ...state.settings, theme } })),
  viewTransform: { zoom: 1, centerX: 0, centerY: 0, viewWidth: 0, viewHeight: 0 },
  setViewTransform: (transform) => set({ viewTransform: transform }),
  currentProjectId: '',
  currentProjectName: '',
  setCurrentProject: (id, name) => set({ currentProjectId: id, currentProjectName: name }),
  projectsModalOpen: false,
  openProjectsModal: () => set({ projectsModalOpen: true }),
  closeProjectsModal: () => set({ projectsModalOpen: false }),
  switchProjectRequest: null,
  requestSwitchProject: (id) =>
    set((state) => ({
      switchProjectRequest: { id, nonce: (state.switchProjectRequest?.nonce ?? 0) + 1 },
    })),
  newProjectRequest: null,
  requestNewProject: (name) =>
    set((state) => ({
      newProjectRequest: { name, nonce: (state.newProjectRequest?.nonce ?? 0) + 1 },
    })),
  propsPanelVisible: true,
  togglePropsPanel: () => set((state) => ({ propsPanelVisible: !state.propsPanelVisible })),
}))
