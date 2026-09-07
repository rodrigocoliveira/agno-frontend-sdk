# Frontend tools

Some tools can't run on the server at all — the user's geolocation, their local clock, anything
that only exists in the browser. Agno declares these as `external_execution=True` and pauses the
run until something supplies a result; `@rodrigocoliveira/agno-hooks` can run them for you the
moment such a pause arrives, through the `frontendTools` map.

## Declare on the server

The server only declares the tool exists and what it returns — the function body is never called:

```python
# examples/demo-agentos/tools/browser.py
"""Tools the browser executes (external_execution=True): the server only declares them."""

from agno.tools import tool


@tool(external_execution=True)
def get_location() -> str:
    """Return the user's current location as {lat, lng}. Executed by the frontend."""
    return ""


@tool(external_execution=True)
def get_local_time() -> str:
    """Return the user's local time and timezone. Executed by the frontend."""
    return ""
```

## Implement in the app

A `FrontendTool` receives the tool's args and a context with the run, the pending `ToolExecution`
and an `AbortSignal`, and returns (or resolves to) the result:

```ts
// packages/agno-hooks/src/types.ts
export type FrontendTool = (
  args: Record<string, unknown>,
  ctx: { run: Run; tool: ToolExecution; signal: AbortSignal },
) => unknown | Promise<unknown>
```

The demo maps both browser tools by name and passes the map to `useAgnoAgent`/`useAgnoTeam`:

```ts
// examples/demo-react/src/tools/frontendTools.ts
import type { FrontendTool } from '@rodrigocoliveira/agno-hooks'

/** Tools the demo server declares with external_execution=True. The hook runs them when a live run pauses on them. */
export const frontendTools: Record<string, FrontendTool> = {
  get_location: () =>
    new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (e) => reject(new Error(e.message)),
        { timeout: 10_000 },
      ),
    ),
  get_local_time: () => ({ iso: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
}
```

## Auto-run rules

When a run pauses from a **live stream event** (not from hydrating history), every pending tool
with `external_execution_required` whose `tool_name` is in `frontendTools` runs automatically, in
parallel; a thrown error becomes `{ tool_call_error: true, result: <message> }` for that tool
instead of failing the run. If every pending tool ends up resolved this way, the store calls
`continue([])` on its own; otherwise the remaining ones stay in `chat.pending` for the app to
complete with `resolveTool` or `continue(decisions)`.

Components that resolve to the same store (same target and `sessionId`) share one `frontendTools`
map: the last one rendered wins, so give the map to a single component rather than passing a
different one from each sharer.

## Hydrated pauses

A `PAUSED` run found on load — possibly minutes or hours old — does **not** auto-run
`frontendTools`: a hidden side effect from an old pause on a page refresh would be surprising. The
app has to ask for it explicitly, and `ExternalToolCard` is what the demo shows for exactly that
case (or for a tool with no `frontendTools` entry at all):

```tsx
// examples/demo-react/src/pending/ExternalToolCard.tsx
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'

/** A tool the server expects the client to execute. Shown for hydrated pauses (no auto-run) or tools with no frontendTools entry. */
export function ExternalToolCard({ tool, onRunTools, onResolve }: { tool: ToolExecution; onRunTools: () => void; onResolve: (result: string) => void }) {
  const [value, setValue] = useState('')
  const [sent, setSent] = useState(false)
  return (
    <Card className="space-y-2 text-sm">
      <div><code className="font-mono">{tool.tool_name}</code> must be executed by this app.</div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onRunTools}>Run browser tools</Button>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="or type a result" />
        <Button variant="secondary" disabled={!value} onClick={() => { onResolve(value); setSent(true) }}>{sent ? 'Recorded ✓' : 'Use result'}</Button>
      </div>
    </Card>
  )
}
```

Its "Run browser tools" button calls `chat.runTools(runId?)` (omitting `runId` runs the current
`chat.pending` run) — this runs the mapped `frontendTools` on the hydrated pause the same way the
auto-run path would, just on demand instead of automatically.

## Manual results

The text input next to it calls `chat.resolveTool(toolCallId, result)`, which only records a
resolution in the store — it does not call `continue` by itself. This is the escape hatch for a
tool with no `frontendTools` entry, or for supplying a result from something other than the mapped
function (typing it in, in the demo's case). Once every pending tool on the run has a resolution,
`PendingPanel` shows a "Continue with recorded results" button that calls `chat.continue([])` to
send them all at once.

**See it in the demo:** `/agents/browser`, `/teams/field`
