# Reconnection

Runs default to surviving disconnects — a closed tab, a dropped network, a full page reload mid
run. This page covers what `background: true` actually buys you, what a reload does to a hook's
snapshot, how the store reconnects a dropped live stream on its own, and how `cancel` behaves
against all of that.

## `background: true`

Every `send` defaults to `background: true`:

```ts
// packages/agno-hooks/src/store/store.ts
export interface StoreOptions<K extends Kind> {
  api: AgnoApi
  target: Target & { kind: K }
  sessionId?: string | null
  /** Default true: runs survive disconnects and can be resumed. */
  background?: boolean
  frontendTools?: Record<string, FrontendTool>
  // ...
}
```

A background run keeps executing on the server even if nothing is watching it — closing the tab
doesn't cancel it, and neither does a reload. `background` is read once, when the store is created:
changing the prop after mount has no effect until the store itself is recreated (a new target or a
new `sessionId`).

## Reload during a run

On mount with a `sessionId`, hydration fetches `GET /sessions/{id}/runs`; any row still `RUNNING` on
the server is reattached with `resume`, transparently — no `frontendTools` involved, nothing the
app has to trigger:

```ts
// packages/agno-hooks/src/store/store.ts
for (const r of runs) {
  if (r.status !== 'running') continue
  void startStream(r.id, {
    first: (signal) => routes.resume(r.id, { session_id: sessionId ?? undefined }, { signal }),
    resumable: true,
    replaysFromStart: true,
    onFail: failRun,
  })
}
```

This particular `resume` call has no `last_event_index` — this client never streamed this run
itself, so it has no `eventIndex` to resume from — and a resume with no recorded index replays the
run from its very first event. The store clears the run's streamed state first and lets the replay
rebuild `content`, `tools`, `steps` and the rest from scratch, so nothing is double-applied.

A row reattached this way counts as `isBusy` and is reachable by a no-arg `cancel()`, exactly like a
run started or resumed in this session — reloading mid-run doesn't cost you the ability to stop it,
and the composer shows Stop instead of a disabled Send for the whole time it's streaming back in.

## Reconnect on drop

A live stream that drops mid-run (not a clean server-side close — those always mean the run
completed or paused normally) is retried automatically: up to 3 attempts, waiting 500 ms, then
1000 ms, then 2000 ms, each one reopening with `last_event_index` set so the server only replays
what was missed. `AgnoApiError` with `status === 0` marks exactly this kind of network failure. Once
those attempts are exhausted, the run settles into `status: 'error'` with `error: 'Connection
lost'`, and `chat.resume(run.id)` is the way to try again from where it left off. `RunCard`'s footer
already wires this up — the same "resume" button shows for any run in error, dropped connection or
not:

```tsx
// examples/demo-react/src/run/RunCard.tsx
{run.error && <span className="text-red-600">{run.error}</span>}
{run.error && onRetry && <Button variant="secondary" onClick={() => onRetry(run.id)}>resume</Button>}
```

`RunShell` passes `onRetry={(id) => void hook.resume(id)}` into `RunList`, which is what
ultimately calls this button's `onRetry`.

## Cancel

`chat.cancel(runId?)` asks the server to cancel a run — omit `runId` to cancel whichever run this
client is actively driving. It never rejects: a failed cancel request is recorded as `run.error`,
not thrown at the caller. A run that only exists locally (no `RunStarted` yet, so the server has
nothing to cancel by id) is aborted and marked `cancelled` immediately instead:

```ts
// packages/agno-hooks/src/store/store.ts
if (isLocalId(run.id)) {
  // No RunStarted yet: the server has nothing to cancel by id, but the request is still ours to
  // drop. Abort the stream and settle the run locally.
  streams.get(run.id)?.abort()
  replace(run.id, { ...run, status: 'cancelled', error: null }); commit()
  return
}
```

## Try it

The `tools` agent's `slow_task` and the `nightly` workflow are the demo's two purpose-built ways to
see this: `slow_task` runs for a requested number of seconds server-side, and `nightly` chains three
15-second steps, both long enough to reload the tab mid-run and watch the hook pick the run back up.

**See it in the demo:** `/agents/tools`, `/workflows/nightly`
