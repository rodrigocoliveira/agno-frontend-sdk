import { AgnoApiError, type components } from '@rodrigocoliveira/agno-api'
import { useAgnoApi } from '@rodrigocoliveira/agno-hooks'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { formatTime, messageOf, short } from '../lib/format'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Empty } from '../ui/Empty'

type Approval = components['schemas']['ApprovalResponse']

/** Admin page: pending approvals across the OS. Non-admin tokens can list their own but get 403 on resolve. */
export function ApprovalsPage() {
  const api = useAgnoApi()
  const [rows, setRows] = useState<Approval[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api.approvals.list({ status: 'pending', limit: 100 })
      .then((res) => { setRows(res.data ?? []); setError(null) })
      .catch((e: unknown) => setError(messageOf(e)))
  }, [api])
  useEffect(load, [load])

  const resolve = async (id: string, status: 'approved' | 'rejected') => {
    try { await api.approvals.resolve(id, { status }); load() } catch (e) {
      setError(e instanceof AgnoApiError && e.status === 403 ? 'Only an admin can resolve approvals. Switch to the admin token in Settings.' : messageOf(e))
    }
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      {error && <Card className="border-red-300 text-sm">{error} <Link className="underline" to="/settings">Settings</Link></Card>}
      {rows.length === 0 && !error && <Empty title="No pending approvals">Trigger one with the <code>approval</code> agent as a user, then come back as admin.</Empty>}
      {rows.map((a) => (
        <Card key={a.id} className="flex items-center gap-4 text-sm">
          <div className="flex-1 space-y-1">
            <div><code className="font-mono">{a.tool_name}</code> <code className="font-mono text-xs text-neutral-500">{JSON.stringify(a.tool_args ?? {})}</code></div>
            <div className="text-xs text-neutral-500">
              by <b>{a.user_id ?? '–'}</b> · {a.agent_id ?? a.team_id ?? a.workflow_id} · run {short(a.run_id, 8)} · {formatTime(a.created_at)}
            </div>
          </div>
          <Button onClick={() => void resolve(a.id, 'approved')}>Approve</Button>
          <Button variant="danger" onClick={() => void resolve(a.id, 'rejected')}>Reject</Button>
        </Card>
      ))}
    </div>
  )
}
