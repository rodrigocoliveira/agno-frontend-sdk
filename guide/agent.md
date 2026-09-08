# Agent

`useAgnoAgent` is the simplest of the three hooks: one agent, one session, one list of runs. This
page walks the whole surface a chat screen needs, in the order `examples/demo-react`'s `/agents/*`
pages actually use it — the provider that owns the connection, the hook itself, rendering the run
list, sending a message, cancelling, and reading what a completed run gives back.

## Provider

Every `useAgnoAgent` call needs an `AgnoProvider` above it. `examples/demo-react` keys it on the
active connection so switching users remounts every hook underneath:

```tsx
// examples/demo-react/src/main.tsx
import { AgnoProvider } from '@rodrigocoliveira/agno-hooks'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { ConnectionProvider, useConnection } from './connection/ConnectionContext'
import { AppRoutes } from './routes'
import './styles.css'

function Root() {
  const { endpoint, activeLabel, activeToken } = useConnection()
  // Keyed by endpoint + token: switching users remounts every hook, so no store keeps another user's runs.
  return (
    <AgnoProvider key={`${endpoint}|${activeLabel ?? ''}`} baseUrl={endpoint} token={activeToken ?? undefined}>
      <AppRoutes />
    </AgnoProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ConnectionProvider>
        <Root />
      </ConnectionProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

`AgnoProvider` takes either config props (`baseUrl`, `token`, `params`, `headers`, `fetch`) or a
ready `api` instance built with `createAgnoApi` — pass `api` when you already have one (shared with
non-hook code, or built once at module scope) and it wins over the config props.

## The hook

`useAgnoAgent({ agentId, sessionId?, background?, frontendTools? })` owns one conversation against
one agent. `agentId` is required; everything else is optional. `AgentPage` reads the agent id from
the route and an optional session from the query string:

```tsx
// examples/demo-react/src/pages/AgentPage.tsx
import { useAgnoAgent } from '@rodrigocoliveira/agno-hooks'
import { useParams, useSearchParams } from 'react-router'
import { RunShell } from '../run/RunShell'
import { frontendTools } from '../tools/frontendTools'

export function AgentPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const agent = useAgnoAgent({ agentId: id, sessionId: params.get('session'), frontendTools })
  return <RunShell kind="agent" targetId={id} hook={agent} hint="Send a message to start a run." />
}
```

The returned `AgnoHook<'agent'>` is the snapshot (`status`, `sessionId`, `runs`, `pending`,
`isBusy`, `error`) plus the actions (`send`, `continue`, `resolveTool`, `runTools`, `resume`,
`cancel`). `background` and `frontendTools` are covered in their own chapters
([reconnection.md](reconnection.md), [frontend-tools.md](frontend-tools.md)).

## Runs list

`hook.runs` is the array a chat screen renders, one `RunCard` per run — [concepts/runs.md](concepts/runs.md)
covers what a `Run` contains. `RunList` also keeps the view scrolled to the newest content:

```tsx
// examples/demo-react/src/run/RunList.tsx
import type { Run } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useRef } from 'react'
import { Empty } from '../ui/Empty'
import { RunCard } from './RunCard'

export function RunList({ runs, hint, onRetry }: { runs: Run[]; hint: string; onRetry: (id: string) => void }) {
  const end = useRef<HTMLDivElement>(null)
  const last = runs.at(-1)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [runs.length, last?.content, last?.status])
  if (runs.length === 0) return <div className="flex flex-1 flex-col"><Empty title="No runs yet">{hint}</Empty></div>
  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4">
      {runs.map((r) => <RunCard key={r.id} run={r} onRetry={onRetry} />)}
      <div ref={end} />
    </div>
  )
}
```

The effect depends on `runs.length`, `last?.content` and `last?.status` — not on the whole `runs`
array — so it re-scrolls on every streamed content chunk and on the terminal status change,
without depending on a new array reference for runs that aren't changing.

## Composer

The composer is a controlled textarea plus a submit handler. `send` rejects while a run is already
active or the session is still loading (see [errors.md](errors.md)), so the composer just needs to
catch that and show it:

```tsx
// examples/demo-react/src/run/Composer.tsx
const submit = async (e?: FormEvent) => {
  e?.preventDefault()
  if (!text.trim() || busy) return
  setError(null)
  try {
    await onSend(text, files)
    setText(''); setFiles([])
  } catch (err) { setError(messageOf(err)) }
}
```

`onSend` is `RunShell`'s wrapper around `hook.send`, which packs files into a `SendInput` object
only when there are any (see [files.md](files.md)):

```tsx
// examples/demo-react/src/run/RunShell.tsx
const send = (message: string, files: File[]) =>
  hook.send(files.length > 0 ? ({ message, files } as SendInput<K>) : message)
```

## Cancel

The same composer swaps its send button for a cancel button while `busy`, and `RunShell` wires it
straight to the hook:

```tsx
// examples/demo-react/src/run/RunShell.tsx
<Composer busy={hook.isBusy} allowFiles={kind !== 'workflow'} placeholder={kind === 'workflow' ? 'Workflow input' : 'Message'} onSend={send} onCancel={() => void hook.cancel()} />
```

`hook.cancel()` with no argument cancels whichever run this client is actively driving; it never
rejects — see [reconnection.md](reconnection.md) for what happens to the run's status.

## Metrics and raw

Once a run completes, `run.metrics` and `run.citations` are passed straight through from the
server (the store doesn't interpret their shape), and `run.raw` is the last event or session row
behind the current state. `RawDrawer` is the demo's debug affordance for all three:

```tsx
// examples/demo-react/src/run/RawDrawer.tsx
import type { Run } from '@rodrigocoliveira/agno-hooks'

export function RawDrawer({ run }: { run: Run }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-neutral-500 hover:text-neutral-800">raw</summary>
      <pre className="mt-1 max-h-80 overflow-auto rounded bg-neutral-50 p-2">
        {JSON.stringify({ id: run.id, status: run.status, metrics: run.metrics, citations: run.citations, raw: run.raw }, null, 2)}
      </pre>
    </details>
  )
}
```

`RunCard`'s footer renders a short summary of `metrics` (total tokens, duration) next to the status
badge, and drops in this drawer for anyone who wants the full payload.

**See it in the demo:** `/agents/chat`, `/agents/tools`
