# Errors

Errors never crash the store — they land where they happened: on the hook's own `status`/`error`
for a hydration failure, on a specific run's `error` field for anything that went wrong while
driving it, or as a rejected promise for a handful of usage mistakes the store catches before ever
touching the network. This page is a tour of all three, plus the one `AgnoApiError` shape they're
usually built from.

## `AgnoApiError`

Every request `@rodrigocoliveira/agno-api` makes either succeeds or throws an `AgnoApiError`:

```ts
// packages/agno-api/src/errors.ts
export class AgnoApiError extends Error {
  readonly status: number
  readonly detail: unknown
  readonly errorId?: string
  readonly errorType?: string
  readonly validation?: ValidationErrorDetail[]
  readonly method: string
  readonly path: string
  readonly headers: Headers
  readonly body: unknown
  // ...
}
```

`status` is the HTTP status for a normal failure response, and `body` is the raw response body
(parsed as JSON when the content type says so). A `status` of exactly `0` is special: it means the
request never got a response at all — a dropped connection or a network failure, not a server
error:

```ts
// packages/agno-api/src/errors.ts
export function networkError(method: string, path: string, cause: unknown): AgnoApiError {
  const reason = cause instanceof Error ? cause.message : String(cause)
  return new AgnoApiError({ status: 0, method, path, detail: reason, message: `${method} ${path} failed: ${reason}`, cause })
}
```

This is exactly what the store's reconnection logic checks for to tell "the connection dropped" apart
from "the server refused the request" (see [reconnection.md](reconnection.md)).

## Hook `status: 'error'`

`chat.status === 'error'` means hydrating the session itself failed — not a run error, which lives
on the run's own fields instead. `RunShell`'s `LoadError` is what the demo shows for it, with a
different message when the active token simply isn't allowed to open the session:

```tsx
// examples/demo-react/src/run/RunShell.tsx
function LoadError({ error }: { error: Error | null }) {
  const denied = error instanceof AgnoApiError && (error.status === 401 || error.status === 403)
  return (
    <Empty title={denied ? 'The active token cannot open this session' : 'Could not load the session'}>
      <p>{error?.message}</p>
      <div className="mt-3 flex justify-center gap-2">
        {denied && <Link to="/settings"><Button variant="secondary">Settings</Button></Link>}
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </Empty>
  )
}
```

## Per-run `error`

A run's own `error` field is where everything else lands: a stream that failed to open, a dropped
connection once reconnection is exhausted, a cancel request the server refused, a failed refetch
after a background pause closed its stream early, or a 403 from a pending approval. None of these
throw past the store — the app reads `run.error` on the affected run (`RunCard` already renders it
next to the status badge) rather than catching anything.

One case is worth calling out because the app itself might need to notice it: `status ===
'error'` with `error === 'Connection lost'` is specifically a dropped background stream that
exhausted its 3 reconnection attempts, and the fix is `chat.resume(run.id)` — covered in
[reconnection.md](reconnection.md).

## Usage errors thrown by `send`/`continue`

A handful of caller mistakes are rejected locally, before any request is made, with the exact
message the store throws:

```ts
// packages/agno-hooks/src/store/store.ts
if (status === 'loading') throw new Error('Session is still loading')
if (snapshot.isBusy) throw new Error('A run is already active')
```

`continue` rejects the same way when a decision is missing for something that's still pending — a
tool on an agent/team run, or the active requirement on a workflow run:

```ts
// packages/agno-hooks/src/store/store.ts
else throw new Error(`Tool ${t.tool_call_id} still pending`)
// ...
} else if (active && !decided) throw new Error(`Step ${active.step_id} still pending`)
```

A tool with `approval_type: 'required'` is the one exception — it's skipped rather than treated as
missing, since an admin resolves it out of band (see [approvals.md](approvals.md)).

## Stream ended before the run started

If the very first stream for a brand-new `send` closes before the server ever sent a `RunStarted`
event, the run never got a real id — nothing exists on the server to resume or cancel by, so it
can't be left `running` (that would block every future `send` on this session forever):

```ts
// packages/agno-hooks/src/store/store.ts
const after = current()
if (after && isLocalId(after.id) && after.status === 'running' && streams.get(id) === ac && !destroyed) {
  replace(id, { ...after, status: 'error', error: 'Stream ended before the run started' }); commit()
}
```

**See it in the demo:** `/settings` with a wrong endpoint
