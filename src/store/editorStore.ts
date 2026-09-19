import { create } from 'zustand'

export type Tool = 'select' | 'node' | 'addPoint'

/** Read-only snapshot of the selected path's Paper.js properties, refreshed by PaperCanvas on every selection/geometry change. */
export interface SelectedPathProps {
  x: number
  y: number
  width: number
  height: number
  node: { x: number; y: number } | null
  strokeColor: string
  strokeWidth: number
  fillColor: string | null
  nodeCount: number
  closed: boolean
}

export type PropsEdit =
  | { kind: 'position'; x: number; y: number }
  | { kind: 'node'; x: number; y: number }
  | { kind: 'stroke'; color?: string; width?: number }
  | { kind: 'fill'; color: string | null }

interface CanvasState {
  width: number
  height: number
  gridVisible: boolean
  zoom: number
}

interface SettingsState {
  scrollZoomOnly: boolean
}

interface EditorState {
  tool: Tool
  selectedPathId: string | null
  selectedSegmentIndex: number | null
  canvas: CanvasState
  settings: SettingsState
  status: string
  setTool: (tool: Tool) => void
  setCanvasSize: (width: number, height: number) => void
  toggleGrid: () => void
  setStatus: (status: string) => void
  setSelection: (pathId: string | null, segmentIndex?: number | null) => void
  clearSelection: () => void
  /** Incremented to signal a delete-selection request from outside PaperCanvas (e.g. the toolbar). */
  deleteRequest: number
  requestDelete: () => void
  /** Incremented to signal an export request from outside PaperCanvas (e.g. the toolbar). */
  exportRequest: number
  requestExport: () => void
  importModalOpen: boolean
  openImportModal: () => void
  closeImportModal: () => void
  /** Nonce-based signal carrying raw SVG text for PaperCanvas to import — mirrors the deleteRequest pattern. */
  importRequest: { svg: string; nonce: number }
  requestImport: (svg: string) => void
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
}

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'select',
  selectedPathId: null,
  selectedSegmentIndex: null,
  canvas: { width: 800, height: 600, gridVisible: true, zoom: 1 },
  settings: { scrollZoomOnly: false },
  status: 'Ready',
  setTool: (tool) => set({ tool }),
  setCanvasSize: (width, height) =>
    set((state) => ({ canvas: { ...state.canvas, width, height } })),
  toggleGrid: () =>
    set((state) => ({
      canvas: { ...state.canvas, gridVisible: !state.canvas.gridVisible },
    })),
  setStatus: (status) => set({ status }),
  setSelection: (pathId, segmentIndex = null) =>
    set({ selectedPathId: pathId, selectedSegmentIndex: segmentIndex }),
  clearSelection: () => set({ selectedPathId: null, selectedSegmentIndex: null }),
  deleteRequest: 0,
  requestDelete: () => set((state) => ({ deleteRequest: state.deleteRequest + 1 })),
  exportRequest: 0,
  requestExport: () => set((state) => ({ exportRequest: state.exportRequest + 1 })),
  importModalOpen: false,
  openImportModal: () => set({ importModalOpen: true }),
  closeImportModal: () => set({ importModalOpen: false }),
  importRequest: { svg: '', nonce: 0 },
  requestImport: (svg) =>
    set((state) => ({ importRequest: { svg, nonce: state.importRequest.nonce + 1 } })),
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
}))
