import PaperCanvas from './PaperCanvas'
import Rulers from './Rulers'
import './CanvasWrap.css'

function CanvasWrap() {
  return (
    <div className="CanvasWrap">
      <PaperCanvas />
      <Rulers />
    </div>
  )
}

export default CanvasWrap
