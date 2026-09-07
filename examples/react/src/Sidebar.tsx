import { useAgnoApi } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useState } from 'react'
import type { Tab } from './App'

interface Row { session_id?: string | null; session_name?: string | null; created_at?: string | null }

export function Sidebar(p: { tab: Tab; targetId: string; sessionId?: string; onPick: (id: string) => void; onNew: () => void; onTab: (t: Tab) => void }) {
  const api = useAgnoApi()
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    let alive = true
    api.sessions.list({ type: p.tab, component_id: p.targetId, limit: 50 })
      .then((res) => { if (alive) setRows(((res as { data?: Row[] }).data ?? []) as Row[]) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [api, p.tab, p.targetId, p.sessionId])
  return (
    <aside className="sidebar">
      <nav className="tabs">
        {(['agent', 'team', 'workflow'] as Tab[]).map((t) => <button key={t} className={t === p.tab ? 'active' : ''} onClick={() => p.onTab(t)}>{t}</button>)}
      </nav>
      <button className="new" onClick={p.onNew}>+ new session</button>
      <ul>
        {rows.map((r) => (
          <li key={r.session_id!} className={r.session_id === p.sessionId ? 'active' : ''}>
            <button onClick={() => p.onPick(r.session_id!)}>{r.session_name || r.session_id}</button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
