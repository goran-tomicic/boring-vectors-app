import './InfoBar.css'

function InfoBar() {
  return (
    <footer className="InfoBar">
      <span className="InfoBar-status">Ready</span>
      <span className="InfoBar-shortcuts">
        V Select · N Node · + Add Point · R Ruler · P Pen · M Rect · L Ellipse · G Grid · 0 Fit
      </span>
    </footer>
  )
}

export default InfoBar
