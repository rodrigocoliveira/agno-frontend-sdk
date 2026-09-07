import { useCallback, useEffect, useState } from 'react'
import { AgentView } from './AgentView'
import { Sidebar } from './Sidebar'
import { TeamView } from './TeamView'
import { WorkflowView } from './WorkflowView'

export type Tab = 'agent' | 'team' | 'workflow'
const IDS: Record<Tab, string> = { agent: 'test-agent', team: 'test-team', workflow: 'test-workflow-hitl' }

function readHash(): { tab: Tab; sessionId?: string } {
  const [tab, sessionId] = location.hash.slice(1).split('/')
  return { tab: (tab === 'team' || tab === 'workflow' ? tab : 'agent'), sessionId: sessionId || undefined }
}

export function App() {
  const [route, setRoute] = useState(readHash)
  useEffect(() => {
    const onHash = () => setRoute(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (tab: Tab, sessionId?: string) => { location.hash = sessionId ? `${tab}/${sessionId}` : tab }
  // Stable identity: the views call it from an effect keyed on the hook's sessionId.
  const onSession = useCallback((sessionId: string | null) => {
    if (!sessionId) return
    const current = readHash()
    if (sessionId !== current.sessionId) location.hash = `${current.tab}/${sessionId}`
  }, [])

  return (
    <div className="app">
      <Sidebar tab={route.tab} targetId={IDS[route.tab]} sessionId={route.sessionId} onPick={(id) => go(route.tab, id)} onNew={() => go(route.tab)} onTab={(t) => go(t)} />
      <main>
        {route.tab === 'agent' && <AgentView agentId={IDS.agent} sessionId={route.sessionId} onSession={onSession} />}
        {route.tab === 'team' && <TeamView teamId={IDS.team} sessionId={route.sessionId} onSession={onSession} />}
        {route.tab === 'workflow' && <WorkflowView workflowId={IDS.workflow} sessionId={route.sessionId} onSession={onSession} />}
      </main>
    </div>
  )
}
