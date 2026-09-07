import type { components } from '@rodrigocoliveira/agno-api'
import { useAgnoApi, type Kind } from '@rodrigocoliveira/agno-hooks'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { cn } from '../lib/cn'
import { formatTime, short } from '../lib/format'

type SessionRow = components['schemas']['SessionSchema']

/** Sessions of one target for the active user. Refetched when the active session changes (a new one appears after the first run). */
export function SessionList({ kind, targetId, activeId }: { kind: Kind; targetId: string; activeId: string | null }) {
  const api = useAgnoApi()
  const [rows, setRows] = useState<SessionRow[]>([])
  useEffect(() => {
    let alive = true
    api.sessions.list({ type: kind, component_id: targetId, limit: 50, sort_by: 'updated_at', sort_order: 'desc' })
      .then((res) => { if (alive) setRows(res.data ?? []) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [api, kind, targetId, activeId])

  return (
    <aside className="flex h-full flex-col overflow-y-auto border-r border-neutral-200 bg-white">
      <Link to="." className={cn('m-2 flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm hover:bg-neutral-100', activeId === null && 'bg-neutral-200')}>
        <Plus size={14} /> New session
      </Link>
      <ul className="text-sm">
        {rows.map((s) => (
          <li key={s.session_id}>
            <Link to={`?session=${s.session_id}`} className={cn('block px-3 py-2 hover:bg-neutral-100', s.session_id === activeId && 'bg-neutral-200')}>
              <div className="truncate">{s.session_name || short(s.session_id, 12)}</div>
              <div className="text-xs text-neutral-400">{formatTime(s.updated_at ?? s.created_at)}</div>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
