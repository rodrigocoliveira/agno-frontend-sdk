# agno-hooks reference

`@rodrigocoliveira/agno-hooks` is the session layer built on top of `@rodrigocoliveira/agno-api`: a
framework-agnostic store (`createAgnoStore`) plus three React hooks (`useAgnoAgent`, `useAgnoTeam`,
`useAgnoWorkflow`) that wrap it. It owns history, streaming, pauses (human in the loop), tools
executed in the browser and reconnection — everything that is not a single stateless API call. This
page documents every symbol exported from `packages/agno-hooks/src/index.ts`, each with its exact
current signature; for a narrative introduction, start with [getting-started.md](../getting-started.md)
and [concepts/runs.md](../concepts/runs.md).

## Provider

### `AgnoProvider` / `AgnoProviderProps`

```tsx
export interface AgnoProviderProps extends Partial<AgnoApiConfig> {
  /**
   * A ready instance; wins over the config props. It must be stable across renders — create it once
   * (module scope, `useMemo` or `useState`), because an inline `createAgnoApi(...)` is a new instance
   * on every render and every store is recreated with it.
   */
  api?: AgnoApi
  children?: ReactNode
}

export function AgnoProvider({ api: given, children, ...config }: AgnoProviderProps)
```

One connection, provided via React context to every `useAgnoAgent`/`useAgnoTeam`/`useAgnoWorkflow`
call underneath. Pass either config props (`baseUrl`, `token`, `onTokenExpired`, `params`, `headers`,
`fetch` — the same fields as `AgnoApiConfig`, see [agno-api.md](agno-api.md)) or a ready `api`
instance built with `createAgnoApi`; `api` wins when both are given. The `AgnoApi` instance is
created once from the config props (`token`/`onTokenExpired` are read through refs, so passing new
inline closures on every render does not recreate it) and only recreated when `baseUrl`, `params`,
`headers` or `fetch` change. Each `AgnoApi` instance owns its own registry of stores, so remounting
`AgnoProvider` with a different `key` (as `examples/demo-react`'s `main.tsx` does, keyed on
`endpoint + activeLabel`) discards every store built under the old connection.

### `useAgnoApi`

```ts
export const useAgnoApi = (): AgnoApi => useAgnoContext().api
```

Returns the `AgnoApi` instance the nearest `AgnoProvider` is using — for code that needs the
stateless client directly (a sessions list, an approvals page) without going through one of the
three run hooks. Throws if called outside an `AgnoProvider`.

## Hooks

### `useAgnoAgent` / `useAgnoTeam` / `useAgnoWorkflow`

```ts
export const useAgnoAgent = (o: AgentHookOptions) => useAgnoStore('agent', o.agentId, o)
export const useAgnoTeam = (o: TeamHookOptions) => useAgnoStore('team', o.teamId, o)
export const useAgnoWorkflow = (o: WorkflowHookOptions) => useAgnoStore('workflow', o.workflowId, o)
```

Each hook owns one conversation against one target (an agent, a team or a workflow), returning an
`AgnoHook<K>`. Internally they key a shared registry by `` `${kind}:${targetId}:${sessionId ?? '@new'}` ``
(`react/hooks.ts`), so two components that pass the same `agentId`/`sessionId` under the same
`AgnoProvider` share one store and one set of runs — reconnecting a second `useAgnoAgent` mid-run
does not open a second stream. A store is destroyed only after every hook using its key has
unmounted (deferred two ticks, so React StrictMode's mount → unmount → mount does not tear it down).

### `AgentHookOptions` / `TeamHookOptions` / `WorkflowHookOptions`

```ts
interface CommonOptions { sessionId?: string | null; background?: boolean; frontendTools?: Record<string, FrontendTool> }
export interface AgentHookOptions extends CommonOptions { agentId: string }
export interface TeamHookOptions extends CommonOptions { teamId: string }
export interface WorkflowHookOptions extends Omit<CommonOptions, 'frontendTools'> { workflowId: string }
```

`agentId`/`teamId`/`workflowId` is the only required field. `sessionId` (`null`/omitted starts a new
session), `background` (default `true`: see [reconnection.md](../reconnection.md)) and
`frontendTools` (agent and team only — a workflow's steps run on agents/teams that are addressed
directly if they need tools) are all optional. `CommonOptions` itself is not exported; it exists only
to keep the three option types in sync.

### `AgnoHook<K>`

```ts
export interface AgnoHook<K extends Kind> extends Snapshot<K> {
  send: AgnoStore<K>['send']
  continue: AgnoStore<K>['continue']
  resolveTool: AgnoStore<K>['resolveTool']
  runTools: AgnoStore<K>['runTools']
  resume: AgnoStore<K>['resume']
  cancel: AgnoStore<K>['cancel']
  store: AgnoStore<K>
}
```

What every `useAgnoAgent`/`useAgnoTeam`/`useAgnoWorkflow` call returns: the current `Snapshot<K>`
(`status`, `sessionId`, `runs`, `pending`, `isBusy`, `error`) spread with the store's action methods,
plus `store` itself (the underlying `AgnoStore<K>`, for code that needs `setFrontendTools` or
`destroy` directly). The methods' contracts, from the `AgnoStore<K>` interface they are typed from
(`store/store.ts`):

- **`send(input: string | SendInput<K>): Promise<void>`** — starts a new run. A plain string is
  shorthand for `{ message: input }`. Throws if the store is destroyed, still `loading`, or already
  `isBusy` (a run is active).
- **`continue(decisions: Decision<K>[], extra?: ContinueExtra<K>): Promise<void>`** — answers the
  current pause with a decision per pending tool (agent/team) or per step requirement (workflow).
  Throws if there is no paused run, or if a required decision is missing.
- **`resolveTool(toolCallId: string, result: unknown): void`** — records the result of one
  `external_execution_required` tool without sending anything to the server yet (the browser-executed
  tool case; see [frontend-tools.md](../frontend-tools.md)). Synchronous, not a promise.
- **`runTools(runId?: string): Promise<void>`** — runs every registered `frontendTools` function
  against the pending tools of `runId` (or the current pending run when omitted) and, once every
  non-optional one is resolved, calls `continue` automatically. This is what the hook calls itself
  whenever a run pauses; call it directly only to retry after a tool failed.
- **`resume(runId: string): Promise<void>`** — reconnects to a run that is still `running` on the
  server (after a reload, or a dropped connection) using its last known `eventIndex`. A no-op if a
  stream for that run is already open.
- **`cancel(runId?: string): Promise<void>`** — cancels the given run, or the most recent
  client-driven (`local`) non-terminal run when omitted. A run with no server id yet is aborted
  locally; otherwise `cancel` calls the server and falls back to marking the run `cancelled` after 5
  seconds if the server does not answer.
- **`store: AgnoStore<K>`** — the framework-agnostic store the hook is built on (see
  [`createAgnoStore`](#createagnostore--agnostore--storeoptions) below).

## Snapshot and run shapes

### `Snapshot<K>`

```ts
export interface Snapshot<K extends Kind> {
  status: 'loading' | 'ready' | 'error'
  sessionId: string | null
  runs: RunOf<K>[]
  pending: Pending<K> | null
  isBusy: boolean
  error: Error | null
}
```

The whole state of one conversation. `status: 'loading'` while a given `sessionId` is being
hydrated from `GET /sessions/{id}/runs`; `'ready'` once `runs` reflects the server (or immediately,
for a brand-new session); `'error'` when hydration itself failed. `pending` is non-null while the
most recent paused run in `runs` is awaiting a decision. `isBusy` is true while any `local` run is
`running`, or while any run is `paused` — `send` rejects during that window.

### `Run`, `AgentRun`, `TeamRun`, `WorkflowRun`, `RunBase`

```ts
export interface RunBase {
  id: string
  sessionId: string | null
  status: RunState
  local: boolean
  input: RunInput
  content: string
  reasoning: string
  tools: ToolExecution[]
  requirements: RunRequirement[] | null
  media: RunMedia
  citations: unknown | null
  metrics: unknown | null
  error: string | null
  createdAt: number | null
  eventIndex: number | null
  raw: unknown | null
}

export interface AgentRun extends RunBase { kind: 'agent'; agentId: string }
export interface TeamRun extends RunBase { kind: 'team'; teamId: string; members: AgentRun[] }

export interface WorkflowRun extends RunBase {
  kind: 'workflow'
  workflowId: string
  steps: StepRun[]
  stepRequirements: StepRequirement[] | null
  pauseKind: 'step' | 'executor' | null
}

export type Run = AgentRun | TeamRun | WorkflowRun
export type RunOf<K extends Kind> = K extends 'agent' ? AgentRun : K extends 'team' ? TeamRun : WorkflowRun
```

`RunBase` is the shared shape every run normalizes into, regardless of target kind — camelCased and
stable across reconnects, unlike the server's raw run row. `AgentRun` adds `agentId`; `TeamRun` adds
`teamId` and `members` (one `AgentRun` per team member that ran); `WorkflowRun` adds `workflowId`,
`steps`, `stepRequirements` and `pauseKind` (`'step'` when a step itself paused,
`'executor'` when the step's own agent/team paused — see [workflow.md](../workflow.md)). `Run` is the
union of all three; `RunOf<K>` picks the concrete member type for a given `Kind`, which is how
`Snapshot<K>['runs']` and `AgnoHook<K>` stay precisely typed per hook.

### `StepRun`

```ts
export interface StepRun {
  id: string
  name: string
  index: number
  status: 'running' | 'completed' | 'paused' | 'error'
  content: string
  tools: ToolExecution[]
  executorRunId: string | null
  raw: unknown | null
}
```

One entry of a `WorkflowRun`'s `steps` array — a single step's own status, content and tool calls,
independent of the workflow run's overall `status`.

### `RunState`

```ts
export type RunState = 'running' | 'paused' | 'completed' | 'error' | 'cancelled'
```

The normalized status every `Run.status` uses, produced from the server's `RunStatus` strings by
[`fromServerStatus`](#fromserverstatus-isterminal).

### `RunInput` / `RunMedia`

```ts
export interface RunInput {
  message: string
  files: File[]
  media: unknown | null
}

export interface RunMedia {
  images: unknown[]
  videos: unknown[]
  audio: unknown[]
  files: unknown[]
}
```

`RunInput` is what the caller sent to start the run — `files` holds the actual `File` objects passed
to `send`, kept client-side for as long as the run object lives (see [files.md](../files.md)).
`RunMedia` is what the run *produced*, normalized from the server's `images`/`videos`/`audio`/`files`
fields.

### `Kind` / `Target`

```ts
export type Kind = 'agent' | 'team' | 'workflow'
export type Target = { kind: Kind; id: string }
```

`Kind` is the discriminant every generic in this package (`RunOf<K>`, `Snapshot<K>`, `AgnoHook<K>`,
`AgnoStore<K>`, `StoreOptions<K>`, ...) is parameterized over. `Target` is what a store is bound to —
`StoreOptions.target` — a `Kind` plus the agent/team/workflow's id.

## Sending, continuing, pausing

### `SendInput<K>`

```ts
type StoreOwned = 'stream' | 'background' | 'session_id'
export type SendInput<K extends Kind> = K extends 'agent'
  ? Omit<AgentRunInput, StoreOwned>
  : K extends 'team' ? Omit<TeamRunInput, StoreOwned> : Omit<WorkflowRunInput, StoreOwned>
```

What `send`'s second argument type accepts: the run-creation input for the target's kind
(`AgentRunInput`/`TeamRunInput`/`WorkflowRunInput` from `@rodrigocoliveira/agno-api`), minus the
fields the store itself controls (`stream` is always `true`, `background` comes from the hook's
options, `session_id` from the store's own `sessionId`).

### `ContinueExtra<K>`

```ts
export type ContinueExtra<K extends Kind> = K extends 'agent'
  ? Omit<AgentContinueInput, 'tools' | StoreOwned>
  : K extends 'team' ? Omit<TeamContinueInput, 'requirements' | StoreOwned> : Omit<WorkflowContinueInput, 'step_requirements' | StoreOwned>
```

`continue`'s optional second argument: whatever extra fields the continue input for that kind allows
besides the decisions themselves (which `continue`'s first argument already supplies) and the
store-owned fields.

### `Decision<K>`

```ts
/** Agent/team: a decided ToolExecution. Workflow: a decided StepRequirement (step pause) or a decided
 *  ToolExecution from the active requirement's `executor_requirements` (executor pause). */
export type Decision<K extends Kind> = K extends 'workflow' ? StepRequirement | ToolExecution : ToolExecution
```

The element type of `continue`'s `decisions` array. For an agent or a team it is always a decided
`ToolExecution` (built with [`confirm`](#confirm-reject), [`reject`](#confirm-reject),
[`provideUserInput`](#provideuserinput), [`provideUserFeedback`](#provideuserfeedback) or
[`setExternalResult`](#setexternalresult)). For a workflow it is a decided `StepRequirement` when a
step itself paused, or a decided `ToolExecution` pulled from that requirement's
`executor_requirements` when the step's own agent/team paused.

### `Pending<K>`

```ts
export type Pending<K extends Kind> = K extends 'workflow'
  /** `tools`: the pending ToolExecutions of the ACTIVE (last) requirement when the step's agent/team
   *  paused (`pause_kind: 'executor'`); empty for a step pause. */
  ? { runId: string; stepRequirements: StepRequirement[]; tools: ToolExecution[] }
  : { runId: string; tools: ToolExecution[] }
```

`Snapshot<K>['pending']`'s non-null shape: which run is paused (`runId`) and what is waiting on a
decision. For an agent/team, `tools` is every still-pending `ToolExecution`. For a workflow,
`stepRequirements` is the full accumulated list and `tools` is only populated (non-empty) when the
active requirement's step is itself paused on its executor's tool calls.

## Frontend tools

### `FrontendTool`

```ts
export type FrontendTool = (
  args: Record<string, unknown>,
  ctx: { run: Run; tool: ToolExecution; signal: AbortSignal },
) => unknown | Promise<unknown>
```

A function the browser runs on behalf of a server-declared tool with `external_execution=True`. It
receives the tool's arguments and a context (`run`, the `tool` execution being resolved, and an
`AbortSignal` that fires if the run is cancelled or destroyed while the tool is running) and returns
the tool's result (or a promise of it). Registered via `useAgnoAgent`/`useAgnoTeam`'s `frontendTools`
option, or `StoreOptions.frontendTools`. See [frontend-tools.md](../frontend-tools.md).

## Human-in-the-loop helpers

All from `packages/agno-hooks/src/run/hitl.ts`; see [concepts/hitl.md](../concepts/hitl.md) for
Agno's vocabulary.

### `isToolPending`

```ts
/** Same rule the server uses (`RunRequirement.needs_*` in agno 3.0.6). */
export function isToolPending(t: ToolExecution): boolean {
  if (t.requires_confirmation === true && t.confirmed == null) return true
  if (t.requires_user_input === true && t.answered !== true) return true
  if (t.external_execution_required === true && t.result == null) return true
  return false
}
```

Whether a `ToolExecution` is still awaiting a decision — confirmation, user input, or an external
(browser-side) result — matching the same rule AgentOS itself uses server-side.

### `pendingTools`

```ts
/** tools ∪ requirements[].tool_execution (requirements win: a team member's pause only lives there), filtered by isToolPending. */
export function pendingTools(run: { tools: ToolExecution[]; requirements: RunRequirement[] | null }): ToolExecution[]
```

Every `ToolExecution` on a run (agent or team) that is still pending, deduplicated by
`tool_call_id` — the union of `run.tools` and `run.requirements[].tool_execution`, since a team
member's pause is only visible through `requirements`.

### `executorTools`

```ts
/** The pending ToolExecutions nested in a workflow requirement whose step executor (agent/team) paused. */
export function executorTools(sr: StepRequirement): ToolExecution[]
```

For a workflow `StepRequirement` whose step's executor (its agent or team) itself paused, the still-
pending tool executions nested in `sr.executor_requirements`.

### `resolveExecutorTools`

```ts
/** A copy of `sr` whose `executor_requirements[].tool_execution` are replaced by the decided ones (by tool_call_id). */
export function resolveExecutorTools(sr: StepRequirement, decided: ToolExecution[]): StepRequirement
```

Returns a new `StepRequirement` with `executor_requirements[].tool_execution` replaced by the
matching entries of `decided` (matched by `tool_call_id`) — how a decided executor tool gets folded
back into the step requirement before it is sent as part of `continue`'s `step_requirements`.

### `confirm`, `reject`

```ts
export const confirm = (t: ToolExecution, note?: string): ToolExecution =>
  ({ ...t, confirmed: true, confirmation_note: note ?? t.confirmation_note ?? null })

export const reject = (t: ToolExecution, note?: string): ToolExecution =>
  ({ ...t, confirmed: false, confirmation_note: note ?? t.confirmation_note ?? null })
```

Build a decided `ToolExecution` for a `requires_confirmation` pause: `confirm` sets `confirmed:
true`, `reject` sets `confirmed: false`; both accept an optional `note` stored as
`confirmation_note`.

### `provideUserInput`

```ts
export function provideUserInput(t: ToolExecution, values: Record<string, unknown>): ToolExecution {
  const schema = (t.user_input_schema ?? []).map((f) => (f.name in values ? { ...f, value: values[f.name] } : f))
  return { ...t, answered: true, user_input_schema: schema }
}
```

Builds a decided `ToolExecution` for a `requires_user_input` pause: fills each field of
`user_input_schema` whose `name` appears in `values`, and marks the execution `answered: true`.

### `provideUserFeedback`

```ts
export function provideUserFeedback(t: ToolExecution, index: number, selected: string[]): ToolExecution {
  const schema = (t.user_feedback_schema ?? []).map((q, i) => (i === index ? { ...q, selected_options: selected } : q))
  return { ...t, answered: true, user_feedback_schema: schema }
}
```

Builds a decided `ToolExecution` for a native `ask_user` pause: sets `selected_options` on the
question at `index` (its position in `user_feedback_schema`) and marks the execution
`answered: true`. Addressed by position, not by the question's `question` text — the LLM authors
that text freely, so two questions in the same call can end up with the same (even blank) text,
and a text-keyed lookup would then answer both at once.

### `setExternalResult`

```ts
export function setExternalResult(t: ToolExecution, result: unknown): ToolExecution {
  return { ...t, result: typeof result === 'string' ? result : JSON.stringify(result ?? null) }
}
```

Builds a decided `ToolExecution` for an `external_execution_required` tool: `result` becomes the
execution's `result`, JSON-stringified unless it is already a string. This is what a `FrontendTool`'s
return value is wrapped in before it is stored.

## Store (no React)

### `createAgnoStore` / `AgnoStore` / `StoreOptions`

```ts
export interface StoreOptions<K extends Kind> {
  api: AgnoApi
  target: Target & { kind: K }
  sessionId?: string | null
  /** Default true: runs survive disconnects and can be resumed. */
  background?: boolean
  frontendTools?: Record<string, FrontendTool>
  /** Test hooks. */
  retryDelays?: number[]
  cancelTimeoutMs?: number
}

export interface AgnoStore<K extends Kind> {
  readonly kind: K
  getSnapshot(): Snapshot<K>
  subscribe(listener: () => void): () => void
  send(input: string | SendInput<K>): Promise<void>
  continue(decisions: Decision<K>[], extra?: ContinueExtra<K>): Promise<void>
  resolveTool(toolCallId: string, result: unknown): void
  runTools(runId?: string): Promise<void>
  resume(runId: string): Promise<void>
  cancel(runId?: string): Promise<void>
  setFrontendTools(tools: Record<string, FrontendTool> | undefined): void
  destroy(): void
}

export function createAgnoStore<K extends Kind>(options: StoreOptions<K>): AgnoStore<K>
```

`createAgnoStore` is the store the hooks are built on; use it directly outside React
(framework-agnostic state, tests, a non-React app):

```ts
import { createAgnoStore } from '@rodrigocoliveira/agno-hooks'
import { createAgnoApi } from '@rodrigocoliveira/agno-api'

const api = createAgnoApi({ baseUrl: 'https://agentos.example.com' })
const store = createAgnoStore({ api, target: { kind: 'agent', id: 'agent_1' } })

const unsubscribe = store.subscribe(() => console.log(store.getSnapshot()))
await store.send('hi')
```

`store.getSnapshot()` returns `{ status, sessionId, runs, pending, isBusy, error }` (a new reference
only when something changes); `store.subscribe(listener)` follows the `getSnapshot`/`subscribe`
contract `useSyncExternalStore` expects. `setFrontendTools` replaces the tools passed at
construction time (what the hooks call whenever the `frontendTools` option changes identity).
`store.destroy()` aborts open streams and stops notifying listeners — it does **not** cancel runs on
the server. `retryDelays` and `cancelTimeoutMs` exist mainly for tests; `cancelTimeoutMs` (default
`5000`) is also the real fallback delay `cancel()` waits before marking a run `cancelled` locally if
the server does not confirm it.

## Status helpers

### `fromServerStatus`, `isTerminal`

```ts
export function fromServerStatus(status: string | null | undefined): RunState {
  switch (status) {
    case 'PAUSED': return 'paused'
    case 'COMPLETED':
    case 'REGENERATED': return 'completed'
    case 'CANCELLED': return 'cancelled'
    case 'ERROR': return 'error'
    default: return 'running' // PENDING, RUNNING, unknown
  }
}

export function isTerminal(status: RunState | undefined): boolean {
  return status === 'completed' || status === 'error' || status === 'cancelled'
}
```

`fromServerStatus` normalizes AgentOS's `RunStatus` strings (`PENDING`, `RUNNING`, `PAUSED`,
`COMPLETED`, `CANCELLED`, `ERROR`, `REGENERATED`) into the five-value `RunState` every `Run.status`
uses. `isTerminal` reports whether a `RunState` will not change on its own anymore — `'completed'`,
`'error'` or `'cancelled'`; `'running'` and `'paused'` are not terminal.

## Advanced/internal types

Two more types are exported via `export type * from './types'` and are mostly useful for code that
inspects raw server data directly rather than going through a run's normalized shape:

```ts
/** Any SSE event or /resume meta event, loosely typed. Reducers narrow by `event`. */
export type AnyEvent = { event: string; run_id?: string; [key: string]: unknown }

/** A row of GET /sessions/{id}/runs or a GET .../runs/{run_id} body. Only the fields the reducers read. */
export interface RunRowLike {
  run_id: string
  status?: string | null
  session_id?: string | null
  parent_run_id?: string | null
  agent_id?: string | null
  team_id?: string | null
  workflow_id?: string | null
  run_input?: string | null
  input?: unknown
  input_media?: unknown
  content?: unknown
  reasoning_content?: string | null
  tools?: ToolExecution[] | null
  requirements?: RunRequirement[] | null
  images?: unknown[] | null
  videos?: unknown[] | null
  audio?: unknown[] | null
  files?: unknown[] | null
  citations?: unknown
  metrics?: unknown
  created_at?: string | number | null
  step_results?: unknown[] | null
  step_executor_runs?: unknown[] | null
  step_requirements?: StepRequirement[] | null
  pause_kind?: string | null
}
```

`AnyEvent` is the loosely-typed shape every SSE event or `/resume` meta event is narrowed from
internally, keyed by its `event` field. `RunRowLike` is the subset of a session/run row's fields the
store's reducers actually read when hydrating from `GET /sessions/{id}/runs` or
`GET .../runs/{run_id}`.
