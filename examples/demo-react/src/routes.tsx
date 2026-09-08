import { Route, Routes } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { AgentPage } from './pages/AgentPage'
import { ApprovalsPage } from './pages/ApprovalsPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SessionsPage } from './pages/SessionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TeamPage } from './pages/TeamPage'
import { WorkflowPage } from './pages/WorkflowPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="agents/:id" element={<AgentPage />} />
        <Route path="teams/:id" element={<TeamPage />} />
        <Route path="workflows/:id" element={<WorkflowPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
