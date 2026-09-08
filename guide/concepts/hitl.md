# Human in the loop

Agno pauses a run when it needs something from a human before it can continue: confirming a
side-effecting tool call, answering a question, or waiting for an admin to approve a sensitive
action. `@rodrigocoliveira/agno-hooks` surfaces every one of these as the same `pending` field on
the hook's snapshot, but the vocabulary underneath comes straight from Agno and is worth learning
once.

## Agno's vocabulary

- **`ToolExecution`** — one tool call: its id, name, args, and (once decided) its result. Whether
  it needs a decision at all is `isToolPending(t)`: `requires_confirmation` unconfirmed,
  `requires_user_input` unanswered, or `external_execution_required` with no `result` yet.
- **`RunRequirement`** — wraps a `ToolExecution` in a team pause. It carries `member_run_id` /
  `member_agent_id` / `member_agent_name` so the store (and your UI) knows which member run the
  pending tool belongs to.
- **`StepRequirement`** — a workflow pause. `requires_confirmation`, `requires_user_input` and
  `requires_route_selection` are the workflow gating the step itself; `requires_executor_input`
  means the step's own agent/team paused, and the pending tool calls live nested in
  `executor_requirements[].tool_execution`. A `WorkflowRun`'s `pauseKind` field tells you which
  case you're in: `'step'` or `'executor'`.

## The five ways a run pauses

| Tool carries | You send back | Helper |
|---|---|---|
| `requires_confirmation: true` | `confirmed: true/false` | `confirm(tool)` / `reject(tool, note?)` |
| `requires_user_input: true`, `user_input_schema` | filled-in field values | `provideUserInput(tool, values)` |
| `user_feedback_schema` (the native `ask_user` tool) | selected option labels per question | `provideUserFeedback(tool, index, selected)` |
| `external_execution_required: true` | a `result` | `resolveTool(id, result)` or an auto-run `frontendTools` entry, then `runTools()` |
| `approval_type: 'required'` | nothing from this client | an admin resolves it out of band, then `continue([])` |

The first four are decided by whoever is looking at the pause; the fifth is decided by an admin
elsewhere (see [approvals.md](../approvals.md)) — this client just calls `continue([])` once the
approval clears to move the run forward again.

## Where decisions go on the wire

Where a decision is attached depends on the run's kind: an agent run posts decided
`ToolExecution`s back as `tools`, a team run wraps each one in a `RunRequirement` and posts
`requirements`, and a workflow run posts the whole (possibly nested) `step_requirements` list back.
Only the **last** entry of a run's requirements/`step_requirements` is ever active — earlier
entries are history from a previous pause on the same run. `hook.continue(decisions)` hides all of
this: it figures out the run's kind and builds the right wire shape for you.

## Render pauses outside the chat

A pause isn't a normal message in the run, so the demo renders it separately, in a panel that
switches on which of the five shapes the pending tool actually is:

```tsx
// examples/demo-react/src/pending/PendingPanel.tsx
function ToolForm({ tool, decided, onDecide, onResolve, onRunTools, onRetryApproval }: ToolFormProps) {
  if (tool.approval_type === 'required') return <ApprovalNotice tool={tool} onRetry={onRetryApproval} />
  if (tool.user_feedback_schema) return <FeedbackForm tool={tool} decided={decided} onDecide={onDecide} />
  if (tool.user_input_schema) return <UserInputForm tool={tool} decided={decided} onDecide={onDecide} />
  if (tool.requires_confirmation) return <ConfirmForm tool={tool} decided={decided} onDecide={onDecide} />
  if (tool.external_execution_required) return <ExternalToolCard tool={tool} onRunTools={onRunTools} onResolve={onResolve} />
  return null
}
```

Each branch's form calls `onDecide` with the helper for its shape (`confirm`/`reject`,
`provideUserInput`, `provideUserFeedback`), and the panel batches every decided tool into one
`hook.continue(decisions)` call once all of them are ready.

**See it in the demo:** `/agents/confirm`, `/agents/interview`, `/agents/approval`, `/workflows/publish`
