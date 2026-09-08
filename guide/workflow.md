# Workflow

`useAgnoWorkflow` trades the flat `content` story agents and teams have for a list of steps, and
its pauses come in two flavors: the workflow itself gating a step (`HumanReview`), or the step's own
agent/team pausing on a tool. This page covers the hook, `WorkflowRun.steps`, and how to tell the
two pause kinds apart.

## The hook

`useAgnoWorkflow({ workflowId, sessionId?, background? })` — note there is no `frontendTools`
option here; a workflow step's own agent or team is where `frontendTools` would apply, and that
distinction is exactly what "executor pause" below is about:

```tsx
// examples/demo-react/src/pages/WorkflowPage.tsx
import { useAgnoWorkflow } from '@rodrigocoliveira/agno-hooks'
import { useParams, useSearchParams } from 'react-router'
import { RunShell } from '../run/RunShell'

export function WorkflowPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const workflow = useAgnoWorkflow({ workflowId: id, sessionId: params.get('session') })
  return <RunShell kind="workflow" targetId={id} hook={workflow} hint="Give the workflow its input. Each step shows up as it runs." />
}
```

## Steps

`WorkflowRun.steps` is a flat `StepRun[]`, ordered by `index` — even when the workflow's own
definition nests steps inside `Parallel` or `Condition`, each child still arrives as its own entry
in that flat list:

```tsx
// examples/demo-react/src/run/StepList.tsx
import type { StepRun } from '@rodrigocoliveira/agno-hooks'
import Markdown from 'react-markdown'
import { Badge, type Tone } from '../ui/Badge'
import { ToolCallList } from './ToolCallList'

const tone: Record<StepRun['status'], Tone> = { running: 'blue', paused: 'amber', completed: 'green', error: 'red' }

/** Flat, in index order: Parallel/Condition children arrive as their own steps. */
export function StepList({ steps }: { steps: StepRun[] }) {
  if (steps.length === 0) return <p className="text-sm text-neutral-400">starting…</p>
  return (
    <ol className="space-y-2">
      {[...steps].sort((a, b) => a.index - b.index).map((s) => (
        <li key={s.id} className="rounded-md border border-neutral-200 bg-white p-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono text-xs text-neutral-400">{s.index + 1}</span>
            <span className="font-medium">{s.name}</span>
            <Badge tone={tone[s.status]}>{s.status}</Badge>
          </div>
          {s.tools.length > 0 && <div className="mt-2"><ToolCallList tools={s.tools} /></div>}
          {s.content && <div className="prose prose-sm mt-2 max-w-none"><Markdown>{s.content}</Markdown></div>}
        </li>
      ))}
    </ol>
  )
}
```

`report` is the demo workflow that exercises this: two steps run inside a `Parallel`, and a third
only shows up when its `Condition` evaluates true — the step list shows every entry that actually
ran, in order, regardless of which combinator produced it. A `Parallel` or `Condition` wrapper is
itself a list entry, though, and it shares its `index` with its first child (`report`'s `gather`
wrapper and its `sales` child both carry index 1) — so seeing the same step number rendered twice in
a row is expected, not a bug.

```python
# examples/demo-agentos/workflows/report.py
"""Parallel steps and a conditional step: the step list shows entries that may not run."""

from agno.agent import Agent
from agno.workflow import Condition, Parallel, Step, Workflow

from db import db
from models import model


def analyst(id: str, focus: str) -> Agent:
    return Agent(id=id, name=id, instructions=[f"Given a company name, invent plausible {focus} for last quarter in 3 bullets."],
                 model=model(), db=db, markdown=True)


sales = analyst("report-sales", "sales figures")
costs = analyst("report-costs", "cost figures; end with the word 'loss' if costs exceeded sales")
alert = Agent(id="report-alert", name="Alert", instructions=["Write a two-line warning about the loss."], model=model(), db=db)
summary = Agent(id="report-summary", name="Summary", instructions=["Summarise everything above in one paragraph."], model=model(), db=db, markdown=True)

workflow = Workflow(
    id="report",
    name="Report",
    description="gather (sales ∥ costs) → check (alert only on 'loss') → summary.",
    db=db,
    steps=[
        Parallel(Step(name="sales", agent=sales), Step(name="costs", agent=costs), name="gather"),
        Condition(name="check", evaluator='previous_step_content.contains("loss")', steps=[Step(name="alert", agent=alert)]),
        Step(name="summary", agent=summary),
    ],
)
```

## Step pause

A step declared with `human_review=HumanReview(requires_confirmation=True, ...)` pauses the
workflow itself before (or after) that step runs, independent of anything the step's own agent
does:

```python
# examples/demo-agentos/workflows/publish.py
Step(
    name="review",
    agent=editor,
    human_review=HumanReview(requires_confirmation=True, confirmation_message="Send the draft to the editor?"),
),
```

This surfaces as `pending.stepRequirements` with `pauseKind: 'step'`, and `pending.tools` empty —
there is no tool to decide, only the step itself. You decide it by sending back the active (last)
`StepRequirement` with your answer merged in:

```ts
await workflow.continue([{ ...workflow.pending!.stepRequirements.at(-1)!, confirmed: true }])
```

`StepReviewForm` renders either shape a `StepRequirement` can ask for — a confirmation or a small
input form — and always calls back with the whole decided requirement:

```tsx
// examples/demo-react/src/pending/StepReviewForm.tsx
import type { StepRequirement } from '@rodrigocoliveira/agno-api'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'

/** A workflow step pause (HumanReview): confirmation or a small input form. Returns the decided StepRequirement. */
export function StepReviewForm({ requirement, onSubmit }: { requirement: StepRequirement; onSubmit: (r: StepRequirement) => void }) {
  if (requirement.requires_user_input) {
    const fields = requirement.user_input_schema ?? []
    return (
      <Card>
        <form className="space-y-2 text-sm" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...requirement, user_input: Object.fromEntries(new FormData(e.currentTarget).entries()) }) }}>
          <div className="font-medium">{requirement.user_input_message ?? `Step "${requirement.step_name}" needs input`}</div>
          {fields.map((f) => <label key={f.name} className="block"><span className="text-xs text-neutral-600">{f.description || f.name}</span><Input name={f.name} required /></label>)}
          <Button type="submit">Send</Button>
        </form>
      </Card>
    )
  }
  return (
    <Card className="flex items-center gap-3 text-sm">
      <div className="flex-1">{requirement.confirmation_message ?? `Run step "${requirement.step_name}"?`}</div>
      <Button onClick={() => onSubmit({ ...requirement, confirmed: true })}>Approve</Button>
      <Button variant="danger" onClick={() => onSubmit({ ...requirement, confirmed: false })}>Reject</Button>
    </Card>
  )
}
```

## Executor pause

`publish`'s `Drafter` step calls `ask_user` before writing, which is a different kind of pause: the
step's own agent paused on a tool, not the workflow gating the step. This is `pauseKind: 'executor'`,
and now `pending.tools` is populated with the executor's pending `ToolExecution`s — decide them
exactly like an agent's own tools:

```ts
// executor pause (pause_kind 'executor'): the step's agent or team paused on a tool.
// pending.tools lists those ToolExecutions; decide them like an agent's
await workflow.continue(workflow.pending!.tools.map((t) => confirm(t)))
```

Under the hood these tools live nested in the active requirement's `executor_requirements[]`;
`executorTools()` and `resolveExecutorTools()` (from `@rodrigocoliveira/agno-hooks`) do that
unwrapping and re-wrapping — the store already calls them for you inside `continue`, so this only
matters if you build the wire payload yourself.

## Only the last requirement is active

A workflow run can pause more than once (a pre-execution gate, then a post-execution review on the
same step), and the server keeps every one of them in `step_requirements`. Only the last entry is
ever live — the store picks it the same way for both pause kinds:

```ts
// packages/agno-hooks/src/store/store.ts
const list = reqs.slice()
const active = list.at(-1)
```

Earlier entries are history from a previous pause on the same run and go back untouched; a
decision you send is matched to the active one by `step_id`.

## Background pauses

A background workflow can close its SSE stream before the pause frame that describes it actually
reaches the client:

```ts
// packages/agno-hooks/src/store/store.ts
/**
 * AgentOS can close a background SSE stream before the pause reaches the client: a background workflow
 * that pauses streams `StepPaused` and then ends, and its `WorkflowPaused` (the frame carrying
 * `pause_kind` and `step_requirements`) is published after the response is already closed. When a stream
 * ends cleanly while the run still looks like it is running, take the state from the run row.
 */
```

When that happens the store notices the stream ended while the run still looks `running`, fetches
the run row directly, and settles the run's `status`, `stepRequirements` and `pauseKind` from it —
nothing the app needs to do differently.

## Foreground fallback

AgentOS refuses a `background: true` continue on a paused run that has no durable queue ticket — a
plain SQLite-backed workflow always is one of these — with a 409 "Retry without background". The
store retries that continue in the foreground automatically, and that foreground stream does not
reconnect on a drop: if it drops, the run ends `status: 'error'` with `error: 'Connection lost'` and
needs `chat.resume(run.id)` like any other dropped connection (see [reconnection.md](reconnection.md)).

**See it in the demo:** `/workflows/publish`, `/workflows/report`, `/workflows/nightly`
