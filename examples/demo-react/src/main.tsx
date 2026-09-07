import { AgnoProvider } from '@rodrigocoliveira/agno-hooks'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { ConnectionProvider, useConnection } from './connection/ConnectionContext'
import { AppRoutes } from './routes'
import './styles.css'

function Root() {
  const { endpoint, activeLabel, activeToken } = useConnection()
  // Keyed by endpoint + token: switching users remounts every hook, so no store keeps another user's runs.
  return (
    <AgnoProvider key={`${endpoint}|${activeLabel ?? ''}`} baseUrl={endpoint} token={activeToken ?? undefined}>
      <AppRoutes />
    </AgnoProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ConnectionProvider>
        <Root />
      </ConnectionProvider>
    </BrowserRouter>
  </StrictMode>,
)
