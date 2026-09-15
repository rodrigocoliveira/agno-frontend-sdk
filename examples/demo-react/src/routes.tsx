import { Route, Routes } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { AgentPage } from './pages/AgentPage'
import { ApprovalsPage } from './pages/ApprovalsPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SessionsPage } from './pages/SessionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ShoppingListPage } from './pages/ShoppingListPage'
import { TeamPage } from './pages/TeamPage'
import { WorkflowPage } from './pages/WorkflowPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        {/* More specific than `agents/:id` below, so it wins the match for this one agent id and
            renders the 3-column shopping-list layout instead of the generic 2-column AgentPage. */}
        <Route path="agents/shopping" element={<ShoppingListPage />} />
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
