import { useEditorStore } from '../store/editorStore'
import './PropsPanel.css'

function PropsPanel() {
  const props = useEditorStore((s) => s.selectedPathProps)
  const requestPropsEdit = useEditorStore((s) => s.requestPropsEdit)

  const disabled = !props

  return (
    <aside className="PropsPanel">
      <section className="PropsPanel-section">
        <h3 className="PropsPanel-heading">Position</h3>
        <div className="PropsPanel-row">
          <label>W</label>
          <input type="number" value={props ? Math.round(props.width) : ''} disabled readOnly />
          <label>H</label>
          <input type="number" value={props ? Math.round(props.height) : ''} disabled readOnly />
        </div>
        <div className="PropsPanel-row">
          <label>X</label>
          <input
            type="number"
            value={props ? Math.round(props.x) : ''}
            disabled={disabled}
            onChange={(e) => {
              if (!props) return
              requestPropsEdit({ kind: 'position', x: Number(e.target.value), y: props.y })
            }}
          />
          <label>Y</label>
          <input
            type="number"
            value={props ? Math.round(props.y) : ''}
            disabled={disabled}
            onChange={(e) => {
              if (!props) return
              requestPropsEdit({ kind: 'position', x: props.x, y: Number(e.target.value) })
            }}
          />
        </div>
      </section>

      <section className="PropsPanel-section">
        <h3 className="PropsPanel-heading">Node</h3>
        <div className="PropsPanel-row">
          <label>X</label>
          <input
            type="number"
            value={props?.node ? Math.round(props.node.x) : ''}
            disabled={!props?.node}
            onChange={(e) => {
              if (!props?.node) return
              requestPropsEdit({ kind: 'node', x: Number(e.target.value), y: props.node.y })
            }}
          />
          <label>Y</label>
          <input
            type="number"
            value={props?.node ? Math.round(props.node.y) : ''}
            disabled={!props?.node}
            onChange={(e) => {
              if (!props?.node) return
              requestPropsEdit({ kind: 'node', x: props.node.x, y: Number(e.target.value) })
            }}
          />
        </div>
      </section>

      <section className="PropsPanel-section">
        <h3 className="PropsPanel-heading">Stroke</h3>
        <div className="PropsPanel-row">
          <input
            type="color"
            value={props?.strokeColor ?? '#000000'}
            disabled={disabled}
            onChange={(e) => requestPropsEdit({ kind: 'stroke', color: e.target.value })}
          />
          <input
            type="text"
            placeholder="#000000"
            value={props?.strokeColor ?? ''}
            disabled={disabled}
            onChange={(e) => requestPropsEdit({ kind: 'stroke', color: e.target.value })}
          />
        </div>
        <div className="PropsPanel-row">
          <label>Weight</label>
          <input
            type="number"
            min={0.5}
            max={50}
            step={0.5}
            value={props ? props.strokeWidth : ''}
            disabled={disabled}
            onChange={(e) =>
              requestPropsEdit({
                kind: 'stroke',
                width: Math.min(50, Math.max(0.5, Number(e.target.value))),
              })
            }
          />
        </div>
      </section>

      <section className="PropsPanel-section">
        <h3 className="PropsPanel-heading">Fill</h3>
        <div className="PropsPanel-row">
          <input
            type="color"
            value={props?.fillColor ?? '#000000'}
            disabled={disabled || !props?.fillColor}
            onChange={(e) => requestPropsEdit({ kind: 'fill', color: e.target.value })}
          />
          <input
            type="text"
            placeholder="#000000"
            value={props?.fillColor ?? ''}
            disabled={disabled || !props?.fillColor}
            onChange={(e) => requestPropsEdit({ kind: 'fill', color: e.target.value })}
          />
          <label>
            <input
              type="checkbox"
              checked={!!props && props.fillColor === null}
              disabled={disabled}
              onChange={(e) =>
                requestPropsEdit({
                  kind: 'fill',
                  color: e.target.checked ? null : (props?.fillColor ?? '#000000'),
                })
              }
            />{' '}
            No fill
          </label>
        </div>
      </section>

      <section className="PropsPanel-section">
        <h3 className="PropsPanel-heading">Path info</h3>
        <div className="PropsPanel-info">
          <span>Nodes: {props ? props.nodeCount : '—'}</span>
          <span>Closed: {props ? (props.closed ? 'Yes' : 'No') : '—'}</span>
        </div>
      </section>
    </aside>
  )
}

export default PropsPanel
