import TopBar from './components/TopBar'
import CanvasWrap from './components/CanvasWrap'
import PropsPanel from './components/PropsPanel'
import InfoBar from './components/InfoBar'
import Modals from './components/Modals'
import './App.css'

function App() {
  return (
    <div className="App">
      <TopBar />
      <div className="App-main">
        <CanvasWrap />
        <PropsPanel />
      </div>
      <InfoBar />
      <Modals />
    </div>
  )
}

export default App
