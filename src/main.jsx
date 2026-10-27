import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'

const root = createRoot(document.getElementById('root'))
const pathname = window.location.pathname
const previewPath = pathname === '/preview/admin' || pathname.startsWith('/preview/admin/')

function render(App) {
  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  )
}

if (previewPath && import.meta.env.DEV) {
  void import('./preview/admin/AdminPreviewApp.jsx').then(({ default: AdminPreviewApp }) => render(AdminPreviewApp))
} else if (import.meta.env.DEV && /^\/pos\/preview\/?$/.test(pathname)) {
  void import('./preview/PreviewApp.jsx').then(({ default: PreviewApp }) => render(PreviewApp))
} else {
  void import('./app/App.jsx').then(({ default: App }) => render(App))
}
