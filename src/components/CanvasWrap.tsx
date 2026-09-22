import PaperCanvas from './PaperCanvas'
import Rulers from './Rulers'
import Toolbar from './Toolbar'
import ZoomPill from './ZoomPill'
import PanelToggle from './PanelToggle'
import './CanvasWrap.css'

function CanvasWrap() {
  return (
    <div className="CanvasWrap">
      <PaperCanvas />
      <Rulers />
      <Toolbar />
      <ZoomPill />
      <PanelToggle />
    </div>
  )
}

export default CanvasWrap
