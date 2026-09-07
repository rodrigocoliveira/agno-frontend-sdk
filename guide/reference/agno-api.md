# agno-api reference

`@rodrigocoliveira/agno-api` is the typed, stateless client for [AgentOS v3](https://docs.agno.com):
one function per route, generated from the OpenAPI spec and hand-checked against the wire contract,
plus the streaming and auth machinery every route shares. It has no state, no cache, no message
store and no React dependency — that layer is `@rodrigocoliveira/agno-hooks`, documented in
[agno-hooks.md](agno-hooks.md). This page is a reference to every part of the client's public
surface; for a narrative introduction see [getting-started.md](../getting-started.md).

## `createAgnoApi(config)`

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
  params: { db_id: 'main' }, // applied to every route that accepts the key, in the query or the body
})
```

`config` (`AgnoApiConfig`, `packages/agno-api/src/client.ts`) extends the transport config
(`packages/agno-api/src/transport.ts`):

```ts
export interface TransportConfig {
  baseUrl: string
  token?: TokenSource
  onTokenExpired?: () => void | string | Promise<void | string>
  headers?: Record<string, string>
  fetch?: typeof fetch
}

export interface AgnoApiConfig extends TransportConfig {
  /** Applied to every route that accepts the key, in the query or in the request body (e.g. db_id, user_id). A value passed in the call wins. */
  params?: Record<string, Primitive>
}
```

- **`baseUrl`** — the AgentOS server origin (`http://localhost:7777` in the examples).
- **`token`** can be a plain string or a function (sync or async); it is read on **every** request,
  never cached by the library.
- **`onTokenExpired`** is called once per 401, even when several requests fail at the same time —
  the refresh is deduplicated and each of those requests is retried exactly once with the new
  token. If the refresh leaves the bearer token unchanged (`token()` still reports the value that
  got the 401), the original 401 is thrown without a retry; with no `token` configured (cookie or
  header auth) the retry always happens. If it returns a string, the returned token is used for the
  retry only; keep your `token` source up to date, because every later request reads `token` again.
  If `onTokenExpired` itself throws, the original 401 is thrown as an `AgnoApiError` with the
  refresh failure as its `cause`.
- **`headers`** are sent on every request; per-call `headers` may override `content-type` — only
  `authorization` and `idempotency-key` stay under the library's control.
- **`fetch`** overrides the runtime's global `fetch` (Node, tests, a proxying wrapper).
- **`params`** are global defaults merged into **any field of that name the route accepts** — query
  string *and* request body alike; a value passed in a specific call wins over the global one, and
  passing `undefined` in a call does not erase the global. A global `user_id`, for example, reaches
  `sessions.list` (query) as well as run creation, `sessions.create`, `memories.*` and
  `learnings.create` (body); a global `db_id`/`knowledge_id` reaches `knowledge.search`'s body. Keys
  the route declares nowhere are never sent.

## Signature rule

Every operation has the same shape:

```
api.<group>[.<subresource>].<op>(...pathParams, input?, options?)
```

- **Path params** come first, positional, in the order they appear in the URL.
- **`input`** is one plain object mixing query and body fields (the library splits them at
  runtime). Routes with neither query nor body skip this argument entirely.
- **`options`** is always last: `{ signal?, headers?, idempotencyKey? }`.

```ts
api.agents.list()
api.agents.get('agent_1')                          // no query, no body → no input argument
api.sessions.list({ type: 'agent', limit: 2 })
api.sessions.list(undefined, { signal })            // input is all-optional → pass undefined to reach options
api.agents.runs.cancel('agent_1', 'run_1', { session_id: 's' })
```

## Route families

`runs` is a sub-resource on `agents`, `teams` and `workflows`; agents and teams also expose
`checkpoints` / `checkpoint`, workflows do not. `createAgnoApi` returns one object per group
(`packages/agno-api/src/client.ts`), each built from `packages/agno-api/src/routes/*.ts`:

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

For anything not in the tree (a custom route on your own deployment), `api.request` and
`api.stream` reuse the same transport, auth, refresh and error handling:

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

## Forms and files

`agents.runs.create`, `teams.runs.create` and `knowledge.content.upload` send
`multipart/form-data`; `continue`, `resume` and `knowledge.remoteContent.create` send
`application/x-www-form-urlencoded`. You pass plain objects either way and the client serializes
them:

- `File` / `Blob` values are sent as-is.
- An array of `File` / `Blob` becomes a repeated field (`files=<a>&files=<b>`).
- Any other array or object (`tools`, `requirements`, `step_requirements`, `factory_input`,
  `files_metadata`, `metadata`) is sent as a JSON string, which is what the server expects.
- `null` and `undefined` are omitted; booleans become `"true"` / `"false"`.

```ts
await api.knowledge.content.upload({ file, name: 'handbook.pdf', metadata: { team: 'ops' } })

for await (const ev of api.agents.runs.create(agentId, { message: 'Summarize these', files: [pdf, csv] })) { /* ... */ }
```

## Streaming

`runs.create`, `runs.continue` and `runs.resume` on `agents`, `teams` and `workflows` stream
Server-Sent Events by default, returning an async iterable of events:

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

Pass `stream: false` on `create`/`continue` to get a plain `Promise` of the final run instead of an
async generator (`runs.resume` has no `stream` field and always streams):

```ts
const run = await api.agents.runs.create('agent_1', { message: 'hi', stream: false })
console.log(run.status) // 'COMPLETED'
```

A pre-stream error (non-2xx before the first byte) throws `AgnoApiError` on the first `await` —
refresh-on-401 applies the same way it does for regular requests. A mid-stream error is delivered
as an event (`RunError`, `TeamRunError`, `WorkflowError`, or `{ event: 'error', error }` from
`resume`); the generator ends without throwing. A dropped connection throws
`AgnoApiError { status: 0 }` from inside the generator. Aborting via `options.signal` cancels the
fetch and lets the native `AbortError` propagate — that is how to cancel a stream.

`runs.resume(id, { session_id, last_event_index })` reconnects to a run that is still going on the
server (background run, page reload) and replays events from `last_event_index` onward, or from the
start when it is omitted.

### Human-in-the-loop (HITL)

When a run pauses waiting for tool confirmation, the `runs.continue` route on each group takes a
different field name for the pending decisions:

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

`AgnoApiError` fields (`packages/agno-api/src/errors.ts`): `status`, `detail`, `errorId`,
`errorType`, `validation`, `method`, `path`, `headers`, `body`, plus the standard `message`.
`validation` is populated on a `422` as `ValidationErrorDetail[]`:

```ts
export interface ValidationErrorDetail {
  loc: (string | number)[]
  msg: string
  type: string
}
```

Aborting a request (`options.signal`) never becomes an `AgnoApiError` — the native `AbortError`
propagates so callers can tell cancellation apart from failure.

| `status` | Meaning |
|---|---|
| `401` | Token expired. Without `onTokenExpired` this throws immediately; with it, the request is retried once after refresh (skipped when the refresh left a bearer token unchanged). |
| `403` | The authenticated `user_id` does not own the session/resource. |
| `404` | Resource not found. |
| `409` | Conflict — component guard, idempotency clash, or a run already in progress. |
| `422` | Validation error. `e.validation` is populated (`ValidationErrorDetail[]`) and `e.message` is `"<loc>: <msg>"` of the first item. |
| `429` | Queue full. Check `e.headers.get('retry-after')`. |
| `503` | Service disabled (routes conditional on the configured DB). |
| `0` | Network/CORS failure (no HTTP response at all). |

## Types

`packages/agno-api/src/index.ts` exports three families of types alongside the client:

```ts
export type { Method, RequestOptions, TokenSource } from './transport'
export type { ContentType, RouteMeta } from './generated/routes.gen'
export type { paths, components, operations } from './generated/openapi'
export type * from './types'
```

- **`paths`, `components`, `operations`** (`src/generated/openapi.d.ts`) are generated directly from
  the AgentOS OpenAPI spec — `components['schemas']['AgentResponse']`, for example, is how
  `examples/demo-react` types the targets it lists (`TargetsContext.tsx`).
- **`src/types/`** is hand-written, covering what the generated schema does not model precisely
  enough for HITL and run handling: `ToolExecution`, `RunRequirement`, `StepRequirement` and the
  `ask_user` shapes (`src/types/hitl.ts`); `AgentRunInput`, `TeamRunInput`, `WorkflowRunInput`,
  `AgentContinueInput`, `TeamContinueInput`, `WorkflowContinueInput`, `ResumeInput`,
  `KnowledgeUploadInput` (`src/types/inputs.ts`); `RunStatus`, `RunMessage`, `RunOutput`,
  `TeamRunOutput`, `WorkflowRunOutput` (`src/types/run.ts`); and the per-group stream event unions —
  `AgentStreamEvent`, `TeamStreamEvent`, `WorkflowStreamEvent` (`src/types/events.ts`).
- **`AgnoApi`** (the return type of `createAgnoApi`), **`AgnoApiConfig`** and **`CustomRequest`**
  come from `src/client.ts`.

## Regenerating types

The types in `src/generated/` are derived from the AgentOS OpenAPI spec, versioned at
`packages/agno-api/openapi/agentos-v3.json`. To update against a new Agno release:

1. Replace `openapi/agentos-v3.json` with the new spec.
2. Run `bun run generate` from `packages/agno-api` (regenerates `src/generated/openapi.d.ts` and
   `src/generated/routes.gen.ts`).
3. Fix whatever `bun run typecheck` flags.
