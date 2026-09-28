import { useEffect } from 'react'
import { useEditorStore } from './store/editorStore'
import TopBar from './components/TopBar'
import CanvasWrap from './components/CanvasWrap'
import PropsPanel from './components/PropsPanel'
import Timeline from './components/Timeline'
import InfoBar from './components/InfoBar'
import Modals from './components/Modals'
import './App.css'

function App() {
  const propsPanelVisible = useEditorStore((s) => s.propsPanelVisible)
  const theme = useEditorStore((s) => s.settings.theme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <div className="App">
      <TopBar />
      <div className="App-main">
        <CanvasWrap />
        {propsPanelVisible && <PropsPanel />}
      </div>
      <Timeline />
      <InfoBar />
      <Modals />
    </div>
  )
}

export default App
