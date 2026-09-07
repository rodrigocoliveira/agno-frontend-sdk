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
it — calling `chat.continue([])` while it's outstanding gets a **403** back from the server; the
store records that as `run.error` and the run stays `paused`. Once the admin resolves the approval,
the exact same `chat.continue([])` call succeeds and the run moves on — `error` clears on the next
successful `continue`.

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

Once the admin approves or rejects it, the app that's still sitting on the paused run just calls
`chat.continue([])` again. `ApprovalNotice` is what the demo shows in place of the pause while it
waits, and its retry button is exactly that call:

```tsx
// examples/demo-react/src/pending/ApprovalNotice.tsx
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { Link } from 'react-router'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

export function ApprovalNotice({ tool, onRetry }: { tool: ToolExecution; onRetry: () => void }) {
  return (
    <Card className="flex items-center gap-3 text-sm">
      <div className="flex-1">
        <code className="font-mono">{tool.tool_name}</code> is waiting for an admin. Approval <code className="font-mono text-xs">{tool.approval_id}</code>.
        <div className="text-xs text-neutral-500">Switch to the <code>admin</code> token, resolve it in <Link className="underline" to="/approvals">Approvals</Link>, come back and continue.</div>
      </div>
      <Button variant="secondary" onClick={onRetry}>Continue</Button>
    </Card>
  )
}
```

`onRetry` here is `PendingPanel`'s `submit([])` — the same empty-decisions `continue` call the 403
came from, just tried again now that the approval has been resolved.

**See it in the demo:** `/agents/approval`, `/approvals`
