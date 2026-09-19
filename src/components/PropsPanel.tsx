import './PropsPanel.css'

function PropsPanel() {
  return (
    <aside className="PropsPanel">
      <section className="PropsPanel-section">
        <h3 className="PropsPanel-heading">Position</h3>
        <div className="PropsPanel-row">
          <label>W</label>
          <input type="number" disabled />
          <label>H</label>
          <input type="number" disabled />
        </div>
        <div className="PropsPanel-row">
          <label>X</label>
          <input type="number" disabled />
          <label>Y</label>
          <input type="number" disabled />
        </div>
      </section>

      <section className="PropsPanel-section">
        <h3 className="PropsPanel-heading">Node</h3>
        <div className="PropsPanel-row">
          <label>X</label>
          <input type="number" disabled />
          <label>Y</label>
          <input type="number" disabled />
        </div>
      </section>

      <section className="PropsPanel-section">
        <h3 className="PropsPanel-heading">Stroke</h3>
        <div className="PropsPanel-row">
          <input type="color" disabled />
          <input type="text" placeholder="#000000" disabled />
        </div>
        <div className="PropsPanel-row">
          <label>Weight</label>
          <input type="number" disabled />
        </div>
      </section>

      <section className="PropsPanel-section">
        <h3 className="PropsPanel-heading">Fill</h3>
        <div className="PropsPanel-row">
          <input type="color" disabled />
          <input type="text" placeholder="#000000" disabled />
          <label>
            <input type="checkbox" disabled /> No fill
          </label>
        </div>
      </section>

      <section className="PropsPanel-section">
        <h3 className="PropsPanel-heading">Path info</h3>
        <div className="PropsPanel-info">
          <span>Nodes: —</span>
          <span>Closed: —</span>
        </div>
      </section>
    </aside>
  )
}

export default PropsPanel
