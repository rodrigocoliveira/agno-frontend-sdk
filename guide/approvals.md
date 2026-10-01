# Approvals

The fifth way a run pauses is different from the other four: nothing in the client resolves it.
`@approval` gates a tool behind a separate admin decision, made through AgentOS's own `/approvals`
endpoints rather than anything sent back on `continue`. This page covers the server side, what the
paused run looks like while it waits, and the admin page that resolves it.

## Server

Stack `@approval` on top of `@tool` (or on top of `@tool(requires_confirmation=True)`, if you want
both a user confirmation and an admin approval) to block a call until an admin approves it:

```python
# examples/demo-agentos/tools/billing.py
@approval
@tool
def issue_refund(order_id: str, amount: float) -> str:
    """Refund `amount` for `order_id`. Blocked until an admin approves it."""
    return f"refund of {amount:.2f} issued for order {order_id}"
```

## What the run looks like

The paused tool carries `approval_type: 'required'` and an `approval_id` the admin resolves by:

```ts
// packages/agno-api/src/types/hitl.ts
approval_type?: string | null
approval_id?: string | null
```

`isToolPending` still reports the tool as pending, but there's nothing this client can send for
it — calling `chat.continue([])` while it's outstanding gets a **403** back from the server (on
agent, team and, since agno 3.1, workflow runs alike); the store records that as `run.error` and
the run stays `paused`. Once the admin resolves the approval, the exact same `chat.continue([])`
call succeeds and the run moves on — `error` clears on the next successful `continue`.

## Admin page

`ApprovalsPage` lists every pending approval and lets an admin approve or reject one:

```tsx
// examples/demo-react/src/pages/ApprovalsPage.tsx
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
```

This is plain `useAgnoApi()` — approvals aren't part of a conversation, so there's no hook for
them, just the stateless `agno-api` client. Listing (`GET /approvals`, `approvals:read`) and
resolving (`POST /approvals/{id}/resolve`, `approvals:write`) are gated by different scopes; the
demo's non-admin `USER_SCOPES` has `approvals:read` but not `approvals:write`
([concepts/auth.md](concepts/auth.md)), so a regular user can see a pending approval but only the
`admin` token can resolve it — `agno/os/routers/approvals/router.py` enforces that resolve is
admin-only whenever user isolation is on.

## After resolution

Resolving an approval only updates the approval row: the run stays `paused` until its owner calls
`chat.continue([])`. AgentOS won't let the admin do that for them — the continue route reads the
user from the JWT's `sub`, so an admin continuing someone else's run gets a 404. The app that's
still sitting on the paused run has to notice the resolution and continue it.

`ApprovalNotice` is what the demo shows in place of the pause while it waits. It polls
`GET /approvals/{approval_id}/status` every 3 seconds and continues as soon as the approval
leaves `pending`, approved or rejected; its Continue button is the same call by hand:

```tsx
// examples/demo-react/src/pending/ApprovalNotice.tsx
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
```

`onRetry` here is `PendingPanel`'s `submit([])` — the same empty-decisions `continue` call the 403
came from, tried again now that the approval has been resolved. A rejected approval continues the
same way: the tool doesn't run and the model is told it was declined. Polling only runs while the
page is open; a run whose owner closed the tab stays `paused` until they come back.

**See it in the demo:** `/agents/approval`, `/approvals`
