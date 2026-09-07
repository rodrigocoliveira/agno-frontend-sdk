import { AgnoApiError, type components } from '@rodrigocoliveira/agno-api'
import { useAgnoApi, type Kind } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { pathFor } from '../catalog'
import { cn } from '../lib/cn'
import { formatTime, messageOf, short } from '../lib/format'
import { Card } from '../ui/Card'
import { Empty } from '../ui/Empty'

type SessionRow = components['schemas']['SessionSchema']
const KINDS: Kind[] = ['agent', 'team', 'workflow']
const targetOf = (s: SessionRow, kind: Kind) => (kind === 'agent' ? s.agent_id : kind === 'team' ? s.team_id : s.workflow_id) ?? ''

/** Every session the active token can see. Under user isolation a user sees only their own; admin sees all. */
export function SessionsPage() {
  const api = useAgnoApi()
  const [kind, setKind] = useState<Kind>('agent')
  const [rows, setRows] = useState<SessionRow[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setError(null)
    api.sessions.list({ type: kind, limit: 100, sort_by: 'updated_at', sort_order: 'desc' })
      .then((res) => { if (alive) setRows(res.data ?? []) })
      .catch((e: unknown) => { if (alive) { setRows([]); setError(e instanceof AgnoApiError && e.status === 401 ? 'This OS requires a token (Settings).' : messageOf(e)) } })
    return () => { alive = false }
  }, [api, kind])

  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      <div className="flex gap-1">
        {KINDS.map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn('rounded-md px-3 py-1 text-sm', k === kind ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-200')}>{k}s</button>
        ))}
      </div>
      {error && <Card className="border-red-300 text-sm">{error}</Card>}
      {!error && rows.length === 0 && <Empty title={`No ${kind} sessions for this user`} />}
      {rows.length > 0 && (
        <Card className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500"><tr><th className="p-3">target</th><th>session</th><th>user</th><th>updated</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.session_id} className="border-t border-neutral-100">
                  <td className="p-3 font-mono text-xs">{targetOf(s, kind)}</td>
                  <td><Link className="underline" to={`${pathFor(kind, targetOf(s, kind))}?session=${s.session_id}`}>{s.session_name || short(s.session_id, 12)}</Link></td>
                  <td className="font-mono text-xs">{s.user_id ?? '–'}</td>
                  <td className="text-xs text-neutral-500">{formatTime(s.updated_at ?? s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
