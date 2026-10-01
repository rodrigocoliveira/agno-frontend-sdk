import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { useAgnoApi } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

const POLL_MS = 3000

export function ApprovalNotice({ tool, onRetry }: { tool: ToolExecution; onRetry: () => void }) {
  const api = useAgnoApi()
  // Read through a ref so a new onRetry identity on re-render doesn't restart the polling.
  const retry = useRef(onRetry)
  retry.current = onRetry

  // Resolving an approval only updates the approval row: the run stays paused until its owner
  // continues it (AgentOS won't let an admin continue someone else's run). So while this notice is
  // up, poll the approval and continue as soon as it leaves `pending`.
  useEffect(() => {
    const id = tool.approval_id
    if (!id) return
    let stopped = false
    const tick = async () => {
      try {
        const { status } = await api.approvals.status(id)
        if (status !== 'pending') { stopped = true; retry.current(); return }
      } catch { /* transient: try again on the next tick */ }
      if (!stopped) timer = setTimeout(tick, POLL_MS)
    }
    let timer = setTimeout(tick, POLL_MS)
    return () => { stopped = true; clearTimeout(timer) }
  }, [api, tool.approval_id])

  return (
    <Card className="flex items-center gap-3 text-sm">
      <div className="flex-1">
        <code className="font-mono">{tool.tool_name}</code> is waiting for an admin. Approval <code className="font-mono text-xs">{tool.approval_id}</code>.
        <div className="text-xs text-neutral-500">In another tab, switch to the <code>admin</code> token and resolve it in <Link className="underline" to="/approvals">Approvals</Link>. This page continues the run on its own once it's resolved; Continue does the same by hand.</div>
      </div>
      <Button variant="secondary" onClick={onRetry}>Continue</Button>
    </Card>
  )
}
