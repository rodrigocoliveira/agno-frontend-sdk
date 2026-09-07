# Runs

`@rodrigocoliveira/agno-hooks` models a conversation as a list of **runs**, not a list of chat
messages. This matters because it is also how the server models it — understanding a `Run` object
is understanding the wire protocol, not just a client-side convenience type.

## Why runs and not messages

AgentOS itself stores runs, not messages: a session is a sequence of run rows, and
`GET /sessions/{id}/runs` is the one endpoint that returns history for an agent, a team, or a
workflow alike. There is no separate "chat log" resource — a workflow run in particular has no
messages at all, only a list of step results, so a message-shaped model would have nowhere to put
it. A run is the natural unit because it is also the unit of streaming: a `POST .../runs` response
is a stream of events for exactly one run, and `POST .../runs/{id}/continue` resumes exactly one
paused run. Building the store around runs means one code path handles agents, teams and
workflows, and hydrating history is the same request as watching a live run.

## The `Run` shape

Every run — agent, team or workflow — extends `RunBase`:

```ts
// packages/agno-hooks/src/types.ts
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
```

- `id` — the run id; a client-generated `local-N` id until the server assigns a real one.
- `sessionId` — the session this run belongs to, or `null` before the server has assigned one.
- `status` — one of `RunState`: `'running' | 'paused' | 'completed' | 'error' | 'cancelled'`.
- `local` — `true` while this client is actively driving the run (sent, resumed or continued here).
- `input` — what the caller sent: `{ message, files, media }`.
- `content` — the streamed text output so far.
- `reasoning` — the streamed reasoning/thinking text, if the model produced any.
- `tools` — the `ToolExecution`s this run has made (pending or resolved).
- `requirements` — team-pause wrappers around a `ToolExecution` (`null` outside a team pause).
- `media` — images, videos, audio and files the run produced.
- `citations` / `metrics` — passed through from the server, shape not interpreted by the store.
- `error` — the failure message once `status` is `'error'`.
- `createdAt` — Unix seconds from the server, or `Date.now() / 1000` for a run just created here.
- `eventIndex` — the last applied SSE `event_index`, used to resume without replaying events.
- `raw` — the last event or session row that produced this state, for debugging.

Agents and teams add their own identity and, for a team, its member runs:

```ts
// packages/agno-hooks/src/types.ts
export interface AgentRun extends RunBase { kind: 'agent'; agentId: string }
export interface TeamRun extends RunBase { kind: 'team'; teamId: string; members: AgentRun[] }
```

A workflow run replaces the flat `content` story with a list of steps, each an independent
sub-run:

```ts
// packages/agno-hooks/src/types.ts
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

export interface WorkflowRun extends RunBase {
  kind: 'workflow'
  workflowId: string
  steps: StepRun[]
  stepRequirements: StepRequirement[] | null
  pauseKind: 'step' | 'executor' | null
}
```

- `id` / `name` / `index` — the step's id, display name and position in the workflow.
- `status` — the step's own status, independent of the run's overall `status`.
- `content` — the step's streamed output.
- `tools` — tool calls made by the step's own agent/team.
- `executorRunId` — the id of the agent/team run that executed this step, if any.
- `raw` — the last step event or `step_results` row, for debugging.
- `workflowId` — the workflow this run belongs to.
- `steps` — one `StepRun` per workflow step, in execution order.
- `stepRequirements` — the workflow-pause requirements; only the last entry is active.
- `pauseKind` — `'step'` when the workflow itself gated the step, `'executor'` when the step's own
  agent/team paused (see [concepts/hitl.md](hitl.md)).

## `local`, `eventIndex`, `raw`

Three fields exist purely for the store's own bookkeeping and rarely need to be read directly:

- **`local`** distinguishes a run this client is actively driving from one loaded from history —
  `isBusy` and `cancel()` both look at it, since a run hydrated from another tab's session should
  not block sending here.
- **`eventIndex`** is the last SSE `event_index` this client applied. Reconnecting after a dropped
  connection sends it back as `last_event_index` so the server replays only what was missed instead
  of the whole run.
- **`raw`** is the last raw event or session row behind the current state — not interpreted by the
  store, but useful for a debug drawer.

## Rendering a run

`examples/demo-react`'s `RunCard` renders any `Run` — agent, team or workflow — by branching on
`run.kind` and `run.status`:

```tsx
// examples/demo-react/src/run/RunCard.tsx
export function RunCard({ run, onRetry, nested = false }: { run: Run; onRetry?: (id: string) => void; nested?: boolean }) {
  const agentName = run.kind === 'agent' ? run.agentId : null
  return (
    <article className={cn('space-y-3', nested && 'border-l-2 border-neutral-200 pl-3')}>
      {nested && agentName && <div className="text-xs font-medium text-neutral-500">{agentName}</div>}
      {(run.input.message || run.input.files.length > 0) && (
        <div className="ml-auto max-w-[75%] rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white">
          {run.input.message}
          {run.input.files.map((f) => <div key={f.name} className="mt-1 flex items-center gap-1 text-xs opacity-80"><Paperclip size={12} />{f.name}</div>)}
        </div>
      )}
      {run.kind === 'workflow' ? (
        <StepList steps={run.steps} />
      ) : (
        <>
          {run.tools.length > 0 && <ToolCallList tools={run.tools} />}
          {run.kind === 'team' && run.members.length > 0 && <MemberRuns members={run.members} />}
        </>
      )}
      {run.content && <div className="prose prose-sm max-w-none"><Markdown>{run.content}</Markdown></div>}
      {run.status === 'running' && !run.content && run.kind !== 'workflow' && <p className="text-sm text-neutral-400">thinking…</p>}
      <footer className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
        <Badge tone={tone[run.status]}>{run.status}</Badge>
        {run.createdAt && <span>{formatTime(run.createdAt)}</span>}
        {metricsSummary(run.metrics) && <span>{metricsSummary(run.metrics)}</span>}
        {run.error && <span className="text-red-600">{run.error}</span>}
        {run.error && onRetry && <Button variant="secondary" onClick={() => onRetry(run.id)}>resume</Button>}
        <RawDrawer run={run} />
      </footer>
    </article>
  )
}
```

The pattern to note: `run.kind === 'workflow'` renders `StepList` instead of `content` and
`tools`, `run.kind === 'team'` additionally renders `MemberRuns`, and everything else (the input
bubble, the status badge, the error/retry affordance) is shared across all three kinds because it
lives on `RunBase`.

**See it in the demo:** `/agents/chat`
