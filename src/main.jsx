import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import App from './preview/PreviewRoute.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
