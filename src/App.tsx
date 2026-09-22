import { useEditorStore } from './store/editorStore'
import TopBar from './components/TopBar'
import CanvasWrap from './components/CanvasWrap'
import PropsPanel from './components/PropsPanel'
import InfoBar from './components/InfoBar'
import Modals from './components/Modals'
import './App.css'

function App() {
  const propsPanelVisible = useEditorStore((s) => s.propsPanelVisible)

  return (
    <div className="App">
      <TopBar />
      <div className="App-main">
        <CanvasWrap />
        {propsPanelVisible && <PropsPanel />}
      </div>
      <InfoBar />
      <Modals />
    </div>
  )
}

export default App
