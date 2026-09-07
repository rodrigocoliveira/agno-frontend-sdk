# @rodrigocoliveira/agno-hooks

Session store and React hooks for [AgentOS v3](https://docs.agno.com): open a session against an agent, team or workflow, load its history, send messages with streaming, survive a reload mid-run, and handle human-in-the-loop (HITL) and browser-side tool execution. The unit of state is the **run**, not the message — the server keeps runs, the stream is "events of a run", HITL pauses a run. Built on [`@rodrigocoliveira/agno-api`](../agno-api).

## Install

```bash
bun add @rodrigocoliveira/agno-hooks @rodrigocoliveira/agno-api react
```

## Provider

```tsx
import { AgnoProvider } from '@rodrigocoliveira/agno-hooks'

<AgnoProvider baseUrl="https://agentos.example.com" token={() => session.token} onTokenExpired={() => refresh()}>
  <App />
</AgnoProvider>
```

`AgnoProviderProps` are exactly `AgnoApiConfig` from `agno-api` (`baseUrl`, `token`, `onTokenExpired`, `params`, `headers`, `fetch`), plus an optional `api` for an instance you already built (a mocked `fetch` in tests, or an app that also uses `agno-api` outside React) — pass either `baseUrl` or `api`. The provider builds `AgnoApi` once; `token` is read on every request, so rotating it never recreates the client. One `<AgnoProvider>` is one connection; hooks with different targets share it, and multiple providers can coexist. `useAgnoApi()` returns the underlying `AgnoApi` for direct calls (sidebar, approvals, knowledge...). The `api` and `fetch` props must be stable references — an inline `createAgnoApi(...)` or an inline `fetch` wrapper is a new value on every render, which rebuilds the client and recreates every store under it.

## Chat with an agent

```tsx
import { useAgnoAgent } from '@rodrigocoliveira/agno-hooks'

function Chat({ agentId }: { agentId: string }) {
  const chat = useAgnoAgent({ agentId })

  if (chat.status === 'loading') return <p>Loading…</p>

  return (
    <div>
      {chat.runs.map((run) => <RunView key={run.id} run={run} />)}
      <button disabled={chat.isBusy} onClick={() => chat.send('hi')}>Send</button>
    </div>
  )
}

function RunView({ run }: { run: ReturnType<typeof useAgnoAgent>['runs'][number] }) {
  return (
    <div>
      <p>{run.input.message}</p>
      {run.tools.map((t) => <span key={t.tool_call_id}>{t.tool_name}</span>)}
      <p>{run.content}</p>
    </div>
  )
}
```

`chat.send(input)` takes either a plain string (sugar for `{ message: input }`) or the full create input minus what the store owns (`session_id`, `background`, `stream`). It rejects with `Error('A run is already active')` while `chat.isBusy` (a local run is `'running'`, or any run is `'paused'`) and with `Error('Session is still loading')` while `chat.status === 'loading'` — both are usage errors from the caller, not server failures, so `await` throws synchronously before any request is made.

## Sessions

`sessionId` is optional. Without one, the hook starts `{ status: 'ready', runs: [] }` and the server creates a session on the first `send`; once it responds, `chat.sessionId` exposes the new id. Pass a `sessionId` to hydrate an existing session's history. Changing the `sessionId` prop to a different id tears down the current store and opens another one from scratch.

There is no `useAgnoSessions` hook in 1.0 ([#4](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/4)) — build a sidebar with `useAgnoApi()` directly:

```tsx
const api = useAgnoApi()
const sessions = await api.sessions.list({ type: 'agent', component_id: agentId })
```

## Background runs and reload

Runs default to `background: true`: they survive a browser reload. On mount with a `sessionId`, the hook hydrates history from `GET /sessions/{id}/runs`; any run still `running` on the server is reattached with `resume`, transparently, no `frontendTools` involved. If the live connection drops mid-run, the store retries `resume` itself up to 3 times before giving up — you only need to react to the terminal state:

```tsx
if (run.status === 'error' && run.error === 'Connection lost') {
  chat.resume(run.id)
}
```

`background` is read once, when the store is created: changing the prop after mount has no effect until the store is recreated (a new target or `sessionId`).

`chat.resume(runId)` picks a dropped stream back up from where it left off; a resume with no recorded event index replays the run from its first event, so the store clears the run's streamed state first and lets the replay rebuild it. `chat.cancel(runId?)` asks the server to cancel (omit `runId` to cancel the active local run); it never rejects — a failed cancel request is recorded as `run.error`, not thrown.

## Human in the loop

A run pauses (`status === 'paused'`) whenever a `ToolExecution` in `run.tools` needs something from the user. `chat.pending` holds the currently paused run's pending tools (or step requirements, for a workflow), so a HITL panel can render outside the normal chat flow, independent of which run is scrolled into view.

| flag on the `ToolExecution` | what you send back | server behaviour |
|---|---|---|
| `requires_confirmation` | `confirmed: true \| false`, `confirmation_note?` | runs the tool, or records the rejection with the note |
| `requires_user_input` + `user_input_schema[]` | `user_input_schema[].value` filled in | copies the values into the tool's args and runs it |
| `requires_user_input` + `user_feedback_schema[]` (`ask_user`) | `user_feedback_schema[].selected_options: string[]` | records "User feedback received", does not run a tool |
| `external_execution_required` | `result` (a string as-is, anything else JSON-stringified) | uses `result` as the tool's output; `result == null` is an error |
| `approval_type: 'required'` (stacked on any of the above) | nothing locally — an admin resolves it via `POST /approvals/{id}/resolve` | `/continue` returns **403** while pending |

```ts
import { isToolPending, confirm, reject, provideUserInput, provideUserFeedback, setExternalResult } from '@rodrigocoliveira/agno-hooks'

// somewhere rendering chat.pending.tools
const tool = chat.pending!.tools[0]!
if (isToolPending(tool)) {
  await chat.continue([confirm(tool, 'looks safe')])
  // or: reject(tool, 'not now'); provideUserInput(tool, { city: 'SP' });
  // provideUserFeedback(tool, { 'Where to?': ['Trail'] }); setExternalResult(tool, { lat: 1 })
}
```

`chat.continue(decisions, extra?)` sends the decided tools (agent), `RunRequirement`s (team) or `StepRequirement`s (workflow) back to the server, merged with anything already recorded via `resolveTool` or `frontendTools`. It rejects locally — without a request — if a pending item has no decision and no recorded resolution (`Error('Tool <id> still pending')` / `Error('Step <id> still pending')`); a tool with `approval_type: 'required'` is the exception, since the admin resolves it out of band.

A continue the server refuses with a 409 "Retry without background" (a paused run with no durable queue ticket) is re-sent immediately in the foreground, and that stream does not reconnect — if it drops, the run ends `status: 'error'` with `error: 'Connection lost'` and needs `chat.resume(run.id)`.

Admin approvals: a tool with `approval_type: 'required'` keeps `approval_id` for a separate approvals UI ([#5](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/5) — out of scope for 1.0). Calling `chat.continue([])` while it is still pending gets a 403 back from the server; the run stays `paused` with `run.error` describing it. Once the admin resolves the approval, call `chat.continue([])` again and the run proceeds.

## Frontend tools

```tsx
useAgnoAgent({
  agentId,
  frontendTools: {
    get_location: async (args, { signal }) => ({ lat: 1, lng: 2 }),
  },
})
```

When a run pauses from a **live stream event** (not from hydrating history), every pending tool with `external_execution_required` whose `tool_name` is in `frontendTools` runs automatically, in parallel; a thrown error becomes `{ tool_call_error: true, result: <message> }` for that tool instead of failing the run. If every pending tool ends up resolved this way, the store calls `continue([])` on its own; otherwise the remaining ones stay in `chat.pending` for the app to complete with `resolveTool` or `continue(decisions)`.

Components that resolve to the same store (same target and `sessionId`) share one `frontendTools` map: the last one rendered wins, so give the map to a single component rather than passing a different one from each sharer.

Hydrated `PAUSED` runs — the ones found on load, possibly minutes or hours old — do **not** auto-run `frontendTools`: a hidden side effect from an old pause on a page refresh would be surprising. Call `chat.runTools(runId?)` (omitting `runId` runs the current `chat.pending` run) to run the mapped tools on it explicitly. `chat.resolveTool(toolCallId, result)` only records a resolution in the store without calling `continue`.

## Teams and workflows

```tsx
const team = useAgnoTeam({ teamId })
team.runs[0]?.members // AgentRun[] — each team member's own run, nested under the team run
team.pending // { runId, tools } — a member's pause surfaces here just like an agent's own tool

const workflow = useAgnoWorkflow({ workflowId })
workflow.runs[0]?.steps // StepRun[] — one per workflow step
workflow.pending // { runId, stepRequirements } for a paused workflow

await workflow.continue([{ ...workflow.pending!.stepRequirements[0]!, confirmed: true }])
```

`useAgnoWorkflow` has no `frontendTools` option — workflow pauses are `StepRequirement`s handled through `continue`, not `ToolExecution`s.

## Without React

`createAgnoStore` is the store the hooks are built on; use it directly outside React (framework-agnostic state, tests, a non-React app):

```ts
import { createAgnoStore } from '@rodrigocoliveira/agno-hooks'
import { createAgnoApi } from '@rodrigocoliveira/agno-api'

const api = createAgnoApi({ baseUrl: 'https://agentos.example.com' })
const store = createAgnoStore({ api, target: { kind: 'agent', id: 'agent_1' } })

const unsubscribe = store.subscribe(() => console.log(store.getSnapshot()))
await store.send('hi')
```

`store.getSnapshot()` returns `{ status, sessionId, runs, pending, isBusy, error }` (a new reference only when something changes); `store.subscribe(listener)` follows the `getSnapshot`/`subscribe` contract `useSyncExternalStore` expects. `store.destroy()` aborts open streams and stops notifying listeners — it does **not** cancel runs on the server.

## Errors

Errors never crash the store — they land where they happened:

| where | effect | where the app sees it |
|---|---|---|
| hydrate failed | `status: 'error'`, `runs: []` | `chat.error` |
| `send` failed before the stream opened | optimistic run becomes `status: 'error'` | `run.error` |
| stream dropped, background run | 3 `resume` attempts, then `status: 'error'`, `error: 'Connection lost'` | `run.error` + `chat.resume(run.id)` |
| stream dropped, `background: false` | `status: 'error'` immediately | `run.error` |
| `RunError` / `WorkflowError` from the server | `status: 'error'`, server's message | `run.error` |
| `continue` with a decision missing | rejects before any request | `await` throws; store unchanged |
| `continue` got a 403 (approval pending) | `run.error` set; run stays `paused` | `run.error`; clears on the next successful `continue` |
| `send` while a run is active | rejects `Error('A run is already active')` | `await` throws |
| `cancel` | `status: 'cancelled'` on `RunCancelled` (or forced locally if the server doesn't answer within 5s) | `run.status` |
| a `frontendTools` function threw | that tool gets an error result; the run continues | tool with `tool_call_error: true` |

## What is not here

Out of scope for 1.0, tracked as issues:

- Session list / sidebar hook (`useAgnoSessions`) — [#4](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/4). Use `useAgnoApi()` + `api.sessions.list(...)` for now.
- Admin approvals hook — [#5](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/5). The store only exposes `approval_id`, surfaces the 403, and accepts `continue([])` once resolved.
- A `send` queue — [#6](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/6). One active run per store in 1.0.
- Sugar for fork / regenerate — [#7](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/7). Pass `fork` / `regenerate` / `continue_from` through `continue`'s `extra` argument today.

## License

MIT
