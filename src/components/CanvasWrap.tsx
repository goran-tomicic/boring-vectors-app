import { useEditorStore } from '../store/editorStore'
import PaperCanvas from './PaperCanvas'
import Rulers from './Rulers'
import Toolbar from './Toolbar'
import ZoomPill from './ZoomPill'
import PanelToggle from './PanelToggle'
import Timeline from './Timeline'
import './CanvasWrap.css'

function CanvasWrap() {
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const appMode = useEditorStore((s) => s.appMode)
  const animationEnabled = useEditorStore((s) => s.settings.animationEnabled)

  return (
    <div className={`CanvasWrap${isPlaying ? ' CanvasWrap--playing' : ''}`}>
      <PaperCanvas />
      <Rulers />
      {appMode === 'draw' && <Toolbar />}
      <ZoomPill />
      <PanelToggle />
      {/* Docked as an overlay (not a layout sibling) so toggling it never resizes the
          canvas — a resize would re-fit the view and desync the Rulers from it. */}
      {animationEnabled && appMode === 'animate' && <Timeline />}
    </div>
  )
}

export default CanvasWrap
