# @rodrigocoliveira/agno-api

Typed, stateless client for the [AgentOS v3](https://docs.agno.com) API — every one of its 125 operations, generated from the OpenAPI spec and hand-checked against the wire contract. Runs in the browser and in Node; the only runtime dependencies are `fetch`, `FormData` and `ReadableStream`.

Out of scope on purpose: no state, no cache, no message store, no React hooks, no retry beyond the 401 token refresh, no UI components. Those live in `@rodrigocoliveira/agno-chat`.

## Install

```bash
bun add @rodrigocoliveira/agno-api
# or
npm i @rodrigocoliveira/agno-api
```

## `createAgnoApi`

```ts
import { createAgnoApi } from '@rodrigocoliveira/agno-api'

const api = createAgnoApi({
  baseUrl: 'http://localhost:7777',
  token: () => localStorage.getItem('token') ?? undefined,
  onTokenExpired: async () => {
    const res = await fetch('/auth/refresh', { method: 'POST' })
    const { token } = await res.json()
    localStorage.setItem('token', token)
    return token // or return nothing to have the lib call `token()` again
  },
  params: { db_id: 'main' }, // applied to every route whose query accepts it (db_id, table, user_id, ...)
})
```

- `token` can be a plain string or a function (sync or async); it is read on **every** request, never cached by the library.
- `onTokenExpired` is called once per 401, even when several requests fail at the same time — the refresh is deduplicated and each of those requests is retried exactly once with the new token.
- `params` are global defaults merged into the query of any route that accepts that key; a value passed in a specific call wins over the global one.
- `headers` (not shown above) are sent on every request; `Authorization` and `Content-Type` stay under the library's control.

## Signature rule

Every operation has the same shape:

```
api.<group>[.<subresource>].<op>(...pathParams, input?, options?)
```

- **Path params** come first, positional, in the order they appear in the URL.
- **`input`** is one plain object mixing query and body fields (the library splits them at runtime). Routes with neither query nor body skip this argument entirely.
- **`options`** is always last: `{ signal?, headers?, idempotencyKey? }`.

```ts
api.agents.list()
api.agents.get('agent_1')                          // no query, no body → no input argument
api.sessions.list({ type: 'agent', limit: 2 })
api.sessions.list(undefined, { signal })            // input is all-optional → pass undefined to reach options
api.agents.runs.cancel('agent_1', 'run_1', { session_id: 's' })
```

## Streaming

`runs.create`, `runs.continue` and `runs.resume` on `agents`, `teams` and `workflows` stream Server-Sent Events by default:

```ts
for await (const ev of api.agents.runs.create('agent_1', { message: 'hi', session_id: 's' })) {
  switch (ev.event) {
    case 'RunContent':
      appendToUI(ev.content)
      break
    case 'RunPaused':
      askUser(ev.tools) // agent HITL: pending tool calls
      break
    case 'RunError':
      showError(ev.error)
      break
  }
}
```

Pass `stream: false` on `create`/`continue` to get a plain `Promise` of the final run instead of an async generator (`runs.resume` has no `stream` field and always streams):

```ts
const run = await api.agents.runs.create('agent_1', { message: 'hi', stream: false })
console.log(run.status) // 'COMPLETED'
```

A pre-stream error (non-2xx before the first byte) throws `AgnoApiError` on the first `await` — refresh-on-401 applies the same way it does for regular requests. A mid-stream error is delivered as an event (`RunError`, `TeamRunError`, `WorkflowError`, or `{ event: 'error', error }` from `resume`); the generator ends without throwing. A dropped connection throws `AgnoApiError { status: 0 }` from inside the generator. Aborting via `options.signal` cancels the fetch and lets the native `AbortError` propagate.

## Human-in-the-loop (HITL)

When a run pauses waiting for tool confirmation, the `runs.continue` route on each group takes a different field name for the pending decisions:

```ts
// agent: decisions travel in `tools`, matched by `tool_call_id`
for await (const ev of api.agents.runs.create('agent_1', { message: 'hi' })) {
  if (ev.event === 'RunPaused') {
    for await (const _ of api.agents.runs.continue('agent_1', ev.run_id, {
      tools: ev.tools!.map((t) => ({ ...t, confirmed: true })),
    })) { /* drain */ }
  }
}

// team: decisions travel in `requirements`, matched by `tool_execution.id`
for await (const ev of api.teams.runs.create('team_1', { message: 'hi' })) {
  if (ev.event === 'TeamRunPaused') {
    for await (const _ of api.teams.runs.continue('team_1', ev.run_id, {
      requirements: ev.requirements!,
    })) { /* drain */ }
  }
}

// workflow: decisions travel in `step_requirements`
for await (const _ of api.workflows.runs.continue('workflow_1', 'run_1', { step_requirements: [] })) { /* drain */ }
```

## Errors

Every failure — HTTP or network — is a single `AgnoApiError`:

```ts
import { isAgnoApiError } from '@rodrigocoliveira/agno-api'

try {
  await api.agents.get('missing')
} catch (e) {
  if (isAgnoApiError(e)) {
    console.log(e.status, e.detail, e.errorId, e.errorType)
  }
}
```

| `status` | Meaning |
|---|---|
| `401` | Token expired. Without `onTokenExpired` this throws immediately; with it, the request is retried once after refresh. |
| `403` | The authenticated `user_id` does not own the session/resource. |
| `404` | Resource not found. |
| `409` | Conflict — component guard, idempotency clash, or a run already in progress. |
| `422` | Validation error. `e.validation` is populated (`ValidationErrorDetail[]`) and `e.message` is `"<loc>: <msg>"` of the first item. |
| `429` | Queue full. Check `e.headers.get('retry-after')`. |
| `503` | Service disabled (routes conditional on the configured DB). |
| `0` | Network/CORS failure (no HTTP response at all). |

`AgnoApiError` fields: `status`, `detail`, `errorId`, `errorType`, `validation`, `method`, `path`, `headers`, `body`, plus the standard `message`. Aborting a request (`options.signal`) never becomes an `AgnoApiError` — the native `AbortError` propagates so callers can tell cancellation apart from failure.

## Escape hatch

For any AgentOS route not in the typed tree (custom routes on your own deployment), use the same transport, auth, refresh and error handling directly:

```ts
const custom = await api.request<{ custom: number }>({
  method: 'post',
  path: '/my/route',
  body: { a: 1 },
  contentType: 'application/json',
  query: { q: 1 },
})

for await (const ev of api.stream<{ x: number }>({ method: 'post', path: '/my/stream' })) {
  console.log(ev)
}
```

Global `params` are not applied to `request`/`stream` calls.

## Regenerating types

The types in `src/generated/` are derived from the AgentOS OpenAPI spec, versioned at `packages/agno-api/openapi/agentos-v3.json`. To update against a new Agno release:

1. Replace `openapi/agentos-v3.json` with the new spec.
2. Run `bun run generate` from `packages/agno-api` (regenerates `src/generated/openapi.d.ts` and `src/generated/routes.gen.ts`).
3. Fix whatever `bun run typecheck` flags.

## Groups

`runs` is a sub-resource with the same operation set on `agents`, `teams` and `workflows`.

| Group | Operations |
|---|---|
| `os` | `health`, `info`, `config` |
| `agents` | `list`, `get`, `forkSession(agentId, sessionId, input)`, `runs.create`, `runs.list`, `runs.get`, `runs.cancel`, `runs.continue`, `runs.resume`, `runs.checkpoints(agentId, runId)`, `runs.checkpoint(agentId, runId, messageIndex)` |
| `teams` | same as `agents` (11 operations) |
| `workflows` | `list`, `get`, `runs.create`, `runs.list`, `runs.get`, `runs.cancel`, `runs.continue`, `runs.resume` |
| `sessions` | `list`, `create`, `deleteMany`, `get`, `delete`, `update`, `rename`, `runs(sessionId, input)`, `run(sessionId, runId, input)`, `media(sessionId, storageKey)` |
| `memories` | `list`, `create`, `deleteMany`, `get`, `update`, `delete`, `topics`, `userStats`, `optimize` |
| `learnings` | `list`, `create`, `get`, `update`, `delete`, `users`, `deleteUser(userId)` |
| `knowledge` | `content.upload`, `content.list`, `content.deleteMany`, `content.get`, `content.update`, `content.delete`, `content.refresh`, `content.status`, `remoteContent.create`, `search`, `config`, `sources(knowledgeId)`, `sourceFiles(knowledgeId, sourceId)` |
| `components` | `list`, `create`, `get`, `update`, `delete`, `restore`, `configs.list`, `configs.create`, `configs.get`, `configs.update`, `configs.delete`, `configs.current`, `configs.setCurrent` |
| `schedules` | `list`, `create`, `get`, `update`, `delete`, `enable`, `disable`, `trigger`, `runs.list`, `runs.get` |
| `approvals` | `list`, `count`, `get`, `status`, `delete`, `resolve` |
| `queue` | `get`, `put`, `post`, `patch`, `delete` — typed from a spec captured with the queue backend disabled; not exercised by the test suite |
| `serviceAccounts` | `list`, `create`, `delete` |
| `registry` | `get` |
| `evals` | `list`, `create`, `get`, `update`, `deleteMany` |
| `metrics` | `get`, `refresh`, `refreshStatus` |
| `traces` | `list`, `get`, `search`, `filterSchema`, `sessionStats` |
| `databases` | `migrateAll`, `migrate(dbId)` |

## License

MIT
