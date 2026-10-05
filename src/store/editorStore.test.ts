import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from './editorStore'

// Zustand stores are module-level singletons, so every test must restore the exact initial
// state first — captured once here, before any test has had a chance to mutate it.
const initialState = useEditorStore.getState()
beforeEach(() => {
  useEditorStore.setState(initialState, true)
})

describe('selection', () => {
  it('replaces the whole selection and defaults segmentIndex to null', () => {
    useEditorStore.getState().setSelection(['a', 'b'], 2)
    useEditorStore.getState().setSelection(['c'])
    const state = useEditorStore.getState()
    expect(state.selectedPathIds).toEqual(['c'])
    expect(state.selectedSegmentIndex).toBeNull()
  })

  it('clears both the path selection and the segment index', () => {
    useEditorStore.getState().setSelection(['a'], 3)
    useEditorStore.getState().clearSelection()
    const state = useEditorStore.getState()
    expect(state.selectedPathIds).toEqual([])
    expect(state.selectedSegmentIndex).toBeNull()
  })
})

describe('nonce-based request signals', () => {
  it('increments on each request, so a repeated identical request still triggers a fresh effect', () => {
    const before = useEditorStore.getState().deleteRequest
    useEditorStore.getState().requestDelete()
    useEditorStore.getState().requestDelete()
    expect(useEditorStore.getState().deleteRequest).toBe(before + 2)
  })

  it('carries a growing nonce alongside the request payload', () => {
    useEditorStore.getState().requestRenameProject('First')
    const first = useEditorStore.getState().renameProjectRequest
    useEditorStore.getState().requestRenameProject('Second')
    const second = useEditorStore.getState().renameProjectRequest
    expect(first?.name).toBe('First')
    expect(second?.name).toBe('Second')
    expect(second!.nonce).toBeGreaterThan(first!.nonce)
  })
})

describe('canvas settings clamping', () => {
  it('clamps background opacity to [0, 1]', () => {
    useEditorStore.getState().setBackgroundOpacity(1.5)
    expect(useEditorStore.getState().canvas.backgroundOpacity).toBe(1)
    useEditorStore.getState().setBackgroundOpacity(-0.5)
    expect(useEditorStore.getState().canvas.backgroundOpacity).toBe(0)
  })

  it('clamps grid opacity to [0, 1]', () => {
    useEditorStore.getState().setGridOpacity(2)
    expect(useEditorStore.getState().canvas.gridOpacity).toBe(1)
    useEditorStore.getState().setGridOpacity(-1)
    expect(useEditorStore.getState().canvas.gridOpacity).toBe(0)
  })

  it('toggles grid visibility', () => {
    const before = useEditorStore.getState().canvas.gridVisible
    useEditorStore.getState().toggleGrid()
    expect(useEditorStore.getState().canvas.gridVisible).toBe(!before)
  })
})

describe('animation playhead', () => {
  it('clamps the playhead to [0, durationMs]', () => {
    useEditorStore.getState().setAnimationDuration(1000)
    useEditorStore.getState().setPlayhead(-500)
    expect(useEditorStore.getState().playheadMs).toBe(0)
    useEditorStore.getState().setPlayhead(5000)
    expect(useEditorStore.getState().playheadMs).toBe(1000)
  })

  it('enforces a 100ms minimum duration', () => {
    useEditorStore.getState().setAnimationDuration(10)
    expect(useEditorStore.getState().animation.durationMs).toBe(100)
  })
})

describe('renameLayer', () => {
  it('sets a trimmed custom name for a layer', () => {
    useEditorStore.getState().renameLayer('path1', '  My Shape  ')
    expect(useEditorStore.getState().layerNameOverrides.path1).toBe('My Shape')
  })

  it('clears the override (reverting to the inferred name) when given a blank name', () => {
    useEditorStore.getState().renameLayer('path1', 'Custom')
    useEditorStore.getState().renameLayer('path1', '   ')
    expect(useEditorStore.getState().layerNameOverrides.path1).toBeUndefined()
  })

  it('does not disturb other paths\' overrides', () => {
    useEditorStore.getState().renameLayer('path1', 'A')
    useEditorStore.getState().renameLayer('path2', 'B')
    useEditorStore.getState().renameLayer('path1', '')
    expect(useEditorStore.getState().layerNameOverrides).toEqual({ path2: 'B' })
  })
})

describe('panel visibility toggles', () => {
  it('toggles the layers panel independently of the properties panel', () => {
    const before = useEditorStore.getState()
    useEditorStore.getState().toggleLayersPanel()
    const after = useEditorStore.getState()
    expect(after.layersPanelVisible).toBe(!before.layersPanelVisible)
    expect(after.propsPanelVisible).toBe(before.propsPanelVisible)
  })
})
