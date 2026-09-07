import { AgnoProvider } from '@rodrigocoliveira/agno-hooks'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AgnoProvider baseUrl="/agno">
      <App />
    </AgnoProvider>
  </StrictMode>,
)
