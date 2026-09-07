# Lifecycle

A `useAgnoAgent`/`useAgnoTeam`/`useAgnoWorkflow` hook (and the `AgnoStore` underneath it) moves
through a small set of states from the moment it is created to the moment a run finishes. This
page walks through that lifecycle in order: hook status, sending, streaming, pausing, and the
terminal states a run can end in.

## Hook status

`Snapshot.status` is one of `'loading' | 'ready' | 'error'`:

- **`loading`** only happens when the hook is given a `sessionId` — the store has to fetch
  `GET /sessions/{id}/runs` before it can render any history. A hook with no `sessionId` starts
  `'ready'` immediately (a brand-new conversation has no history to load).
- **`ready`** means hydration finished (or was never needed) and `send` can be called.
- **`error`** means hydration itself failed — not a run error, which lives on the run's own
  `status`/`error` fields instead (see [Terminal states](#terminal-states) below).

## Sending

`send` accepts either a plain string or a `SendInput` object (message, files, and whatever else
the target's run-input type allows). It rejects — without ever touching the network — in two
cases, with the exact messages the store throws:

```ts
// packages/agno-hooks/src/store/store.ts
if (status === 'loading') throw new Error('Session is still loading')
if (snapshot.isBusy) throw new Error('A run is already active')
```

`isBusy` is true whenever a local run is `'running'` or any run is `'paused'` — the store allows
exactly one active run per session at a time.

## Streaming

Once `send` opens a stream, each SSE event is applied to the run through `applyEvent`, which is
how `content`, `reasoning`, `tools`, `requirements`, `steps` and the rest of the `Run` shape get
built up incrementally. A clean end of the stream (the server closing it normally, whether the run
completed or paused) always resolves — it never triggers a reconnect. Only a **thrown** error
(the connection actually dropping) triggers reconnection, and only if the run isn't already done:
up to 3 attempts, waiting 500 ms, then 1000 ms, then 2000 ms, each time reopening with
`last_event_index` set to the run's `eventIndex` so the server replays only the events this client
missed.

## Paused and continue

A run that needs a decision — a tool confirmation, workflow step review, and so on — settles into
`status: 'paused'`, and the snapshot's `pending` field describes exactly what is waiting (see
[Human in the loop](hitl.md) for the full shape). Answering it is a single call:

```ts
hook.continue(decisions)
```

`continue` submits the decisions, and the run goes back to `'running'` until the server's next
event moves it along again.

## Terminal states

A run ends in one of three states: `'completed'`, `'cancelled'`, or `'error'`. `cancel()` never
rejects — if the cancel request itself fails, the store just records the error on the run and
leaves it as-is rather than throwing at the caller. A run left in `'error'` (for example after
reconnection was exhausted) can be retried with `resume(runId)`, which reopens the stream from the
run's last known `eventIndex`.

```text
send ──▶ running ──▶ completed
            │  ▲          
            │  └── continue ◀── paused ──▶ (admin approval)
            ├──▶ cancelled (cancel)
            └──▶ error (resume to retry)
```

## Background

`background` defaults to `true`: a run started this way survives the browser tab closing or
reloading, because AgentOS keeps running it server-side and the client can reconnect to it later.
This is what makes reload-mid-run and multi-tab scenarios work — see
[reconnection.md](../reconnection.md) for what a reload actually does to a hook's snapshot and how
`resume` picks the run back up.

**See it in the demo:** `/agents/chat`, `/agents/tools`, `/workflows/nightly`
