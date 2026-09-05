import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode double-mounts effects in dev, which re-inits MapLibre — keep it off for the map app.
createRoot(document.getElementById('root')!).render(<App />)
