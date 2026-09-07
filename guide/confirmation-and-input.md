# Confirmation and input

Three of the five ways a run pauses (see [concepts/hitl.md](concepts/hitl.md)) are decided by
whoever is looking at the pause, right there in the UI: confirming a side-effecting call, filling
in arguments the model didn't have, or answering a structured question the agent asked. This page
covers all three, plus deciding several of them at once.

## Confirmation

`@tool(requires_confirmation=True)` pauses the run until the user approves or rejects the call —
the tool never runs until they do:

```python
# examples/demo-agentos/tools/billing.py
@tool(requires_confirmation=True)
def send_invoice(customer: str, amount: float) -> str:
    """Send an invoice of `amount` to `customer`. Asks the user to confirm first."""
    return f"invoice of {amount:.2f} sent to {customer}"
```

`ConfirmForm` renders the pending call and its args, and calls back with the decided
`ToolExecution`:

```tsx
// examples/demo-react/src/pending/ConfirmForm.tsx
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { confirm, reject } from '@rodrigocoliveira/agno-hooks'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

export function ConfirmForm({ tool, decided, onDecide }: { tool: ToolExecution; decided?: ToolExecution; onDecide: (t: ToolExecution) => void }) {
  return (
    <Card className="flex items-center gap-3 text-sm">
      <div className="flex-1">
        Run <code className="font-mono">{tool.tool_name}</code> with <code className="font-mono text-xs">{JSON.stringify(tool.tool_args ?? {})}</code>?
      </div>
      <Button variant={decided?.confirmed === true ? 'primary' : 'secondary'} onClick={() => onDecide(confirm(tool))}>Approve</Button>
      <Button variant={decided?.confirmed === false ? 'danger' : 'secondary'} onClick={() => onDecide(reject(tool, 'rejected by the user'))}>Reject</Button>
    </Card>
  )
}
```

`confirm(tool, note?)` and `reject(tool, note?)` are small helpers from `@rodrigocoliveira/agno-hooks`
that set `confirmed` and an optional `confirmation_note`:

```ts
// packages/agno-hooks/src/run/hitl.ts
export const confirm = (t: ToolExecution, note?: string): ToolExecution =>
  ({ ...t, confirmed: true, confirmation_note: note ?? t.confirmation_note ?? null })

export const reject = (t: ToolExecution, note?: string): ToolExecution =>
  ({ ...t, confirmed: false, confirmation_note: note ?? t.confirmation_note ?? null })
```

## User input

`@tool(requires_user_input=True, user_input_fields=[...])` pauses the run so the app can fill in
arguments the model doesn't have:

```python
# examples/demo-agentos/tools/forms.py
"""A tool whose arguments are filled by the user through a form (requires_user_input)."""

from agno.tools import tool


@tool(requires_user_input=True, user_input_fields=["street", "city", "zip"])
def collect_shipping_address(street: str, city: str, zip: str) -> str:
    """Collect the shipping address from the user. Call it when an address is needed."""
    return f"shipping to {street}, {city} {zip}"
```

The pending `ToolExecution` carries one `UserInputField` per declared field:

```ts
// packages/agno-api/src/types/hitl.ts
export interface UserInputField {
  name: string
  field_type?: string
  description?: string | null
  value?: unknown
}
```

`provideUserInput(tool, values)` copies your values into that schema, keyed by field name:

```ts
// packages/agno-hooks/src/run/hitl.ts
export function provideUserInput(t: ToolExecution, values: Record<string, unknown>): ToolExecution {
  const schema = (t.user_input_schema ?? []).map((f) => (f.name in values ? { ...f, value: values[f.name] } : f))
  return { ...t, answered: true, user_input_schema: schema }
}
```

`UserInputForm` renders one input per field and submits them as a plain object:

```tsx
// examples/demo-react/src/pending/UserInputForm.tsx
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { provideUserInput } from '@rodrigocoliveira/agno-hooks'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'

export function UserInputForm({ tool, decided, onDecide }: { tool: ToolExecution; decided?: ToolExecution; onDecide: (t: ToolExecution) => void }) {
  const fields = tool.user_input_schema ?? []
  return (
    <Card>
      <form
        className="space-y-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          onDecide(provideUserInput(tool, Object.fromEntries(new FormData(e.currentTarget).entries())))
        }}
      >
        <div className="font-medium"><code className="font-mono">{tool.tool_name}</code> needs some details</div>
        {fields.map((f) => (
          <label key={f.name} className="block">
            <span className="text-xs text-neutral-600">{f.description || f.name}</span>
            <Input name={f.name} defaultValue={String(f.value ?? '')} required />
          </label>
        ))}
        <Button type="submit" variant={decided ? 'primary' : 'secondary'}>{decided ? 'Saved ✓' : 'Save'}</Button>
      </form>
    </Card>
  )
}
```

## Ask user

Agno's native `ask_user` tool (`UserFeedbackTools()`) is a different shape of the same pause: the
agent asks one or more structured questions instead of filling tool arguments. Each question is a
`UserFeedbackQuestion`:

```ts
// packages/agno-api/src/types/hitl.ts
/** `agno/tools/function.py` UserFeedbackQuestion — produced by the native `ask_user` tool (`UserFeedbackTools`). Answer with `selected_options` (labels). */
export interface UserFeedbackQuestion {
  question: string
  header?: string | null
  options?: UserFeedbackOption[] | null
  multi_select?: boolean
  selected_options?: string[] | null
}
```

You answer with the selected option **labels**, one list per question — `provideUserFeedback`
takes an `index` (the question's position in `user_feedback_schema`) and fills that question's
`selected_options`. It addresses questions by position rather than by `question` text: the LLM
authors that text freely, so two questions in the same call can end up with the same (even blank)
text, and a text-keyed lookup would then answer both at once. The `interview` agent asks two such
questions before moving on:

```python
# examples/demo-agentos/agents/interview.py
"""Native ask_user (multi-select questions) and a requires_user_input form, both outside the chat."""

from agno.agent import Agent
from agno.tools.user_feedback import UserFeedbackTools

from db import db
from models import model
from tools.forms import collect_shipping_address

agent = Agent(
    id="interview",
    name="Interview",
    description="Plans a trip by asking structured questions, then collects a shipping address.",
    instructions=[
        "Start every new conversation by calling ask_user with two questions:",
        "  1. 'Which activities do you want?' with options Hiking, Museums, Beach, Nightlife (multi_select=True).",
        "  2. 'What is your budget?' with options Low, Medium, High (single select).",
        "After the answers, propose a short plan, then call collect_shipping_address to send the printed guide.",
    ],
    model=model(),
    tools=[UserFeedbackTools(), collect_shipping_address],
    db=db,
    markdown=True,
    add_history_to_context=True,
)
```

`FeedbackForm` renders one block per question — toggling for `multi_select`, replacing for a single
select — and answers accumulate on the decided `ToolExecution` as the user picks:

```tsx
// examples/demo-react/src/pending/FeedbackForm.tsx
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { provideUserFeedback } from '@rodrigocoliveira/agno-hooks'
import { cn } from '../lib/cn'
import { Card } from '../ui/Card'

/**
 * Native ask_user: one block per question; multi_select toggles, single select replaces. Answers accumulate
 * on `decided`. Questions are addressed by their position in `user_feedback_schema`, not by `question` text
 * — the LLM authors that text freely and two questions can end up sharing it (even blank).
 */
export function FeedbackForm({ tool, decided, onDecide }: { tool: ToolExecution; decided?: ToolExecution; onDecide: (t: ToolExecution) => void }) {
  const base = decided ?? tool
  const chosen = (index: number) => base.user_feedback_schema?.[index]?.selected_options ?? []
  const pick = (index: number, label: string, multi: boolean) => {
    const current = chosen(index)
    const next = multi ? (current.includes(label) ? current.filter((l) => l !== label) : [...current, label]) : [label]
    onDecide(provideUserFeedback(base, index, next))
  }
  return (
    <Card className="space-y-3 text-sm">
      {(tool.user_feedback_schema ?? []).map((q, index) => (
        <div key={index}>
          <div className="font-medium">{q.header && <span className="text-neutral-500">{q.header} · </span>}{q.question}</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {(q.options ?? []).map((o) => (
              <button
                key={o.label}
                type="button"
                title={o.description ?? ''}
                onClick={() => pick(index, o.label, !!q.multi_select)}
                className={cn('rounded-full border px-3 py-1 text-xs', chosen(index).includes(o.label) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white hover:bg-neutral-100')}
              >
                {o.label}
              </button>
            ))}
          </div>
          {q.multi_select && <div className="mt-1 text-xs text-neutral-400">pick one or more</div>}
        </div>
      ))}
    </Card>
  )
}
```

Answering `ask_user` doesn't run a tool — the server just records "User feedback received" and
moves the run on. The Q&A itself persists in history the same way any other tool call does, so
reloading a session shows what was asked and what was picked.

## Deciding several at once

A single pause can carry more than one pending tool — `interview` can ask two questions in the same
`ask_user` call, and a team pause could in principle surface more than one member's tool at once.
`PendingPanel` keeps a local draft of decisions and only calls `hook.continue` once every tool that
needs one has been decided:

```tsx
// examples/demo-react/src/pending/PendingPanel.tsx
const [draft, setDraft] = useState<Record<string, ToolExecution>>({})
// ...
const ready = pending.tools.every((t) => !needsDecision(t) || isDecided(draft[t.tool_call_id]))
return (
  <Panel title="Waiting for you" error={error}>
    {pending.tools.map((t) => (
      <ToolForm
        key={t.tool_call_id}
        tool={t}
        decided={draft[t.tool_call_id]}
        onDecide={(d) => setDraft((prev) => ({ ...prev, [d.tool_call_id]: d }))}
        onResolve={(r) => hook.resolveTool(t.tool_call_id, r)}
        onRunTools={() => void hook.runTools()}
        onRetryApproval={() => void submit([])}
      />
    ))}
    {pending.tools.some(needsDecision) && (
      <Button disabled={!ready} onClick={() => void submit(Object.values(draft).filter(isDecided) as Decision<K>[])}>Continue</Button>
    )}
  </Panel>
)
```

Every decided tool is batched into one `hook.continue(decisions)` call — there's no need to send
each decision separately.

**See it in the demo:** `/agents/confirm`, `/agents/interview`
