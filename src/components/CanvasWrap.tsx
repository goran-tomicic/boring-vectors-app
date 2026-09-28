import { useEditorStore } from '../store/editorStore'
import PaperCanvas from './PaperCanvas'
import Rulers from './Rulers'
import Toolbar from './Toolbar'
import ZoomPill from './ZoomPill'
import PanelToggle from './PanelToggle'
import './CanvasWrap.css'

function CanvasWrap() {
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const appMode = useEditorStore((s) => s.appMode)

  return (
    <div className={`CanvasWrap${isPlaying ? ' CanvasWrap--playing' : ''}`}>
      <PaperCanvas />
      <Rulers />
      {appMode === 'draw' && <Toolbar />}
      <ZoomPill />
      <PanelToggle />
    </div>
  )
}

export default CanvasWrap
