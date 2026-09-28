import { useEditorStore } from '../store/editorStore'
import PaperCanvas from './PaperCanvas'
import Rulers from './Rulers'
import Toolbar from './Toolbar'
import ZoomPill from './ZoomPill'
import PanelToggle from './PanelToggle'
import './CanvasWrap.css'

function CanvasWrap() {
  const isPlaying = useEditorStore((s) => s.isPlaying)

  return (
    <div className={`CanvasWrap${isPlaying ? ' CanvasWrap--playing' : ''}`}>
      <PaperCanvas />
      <Rulers />
      <Toolbar />
      <ZoomPill />
      <PanelToggle />
    </div>
  )
}

export default CanvasWrap
