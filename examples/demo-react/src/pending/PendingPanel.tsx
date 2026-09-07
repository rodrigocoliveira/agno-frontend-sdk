import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { isToolPending, type AgnoHook, type Decision, type Kind } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useState } from 'react'
import { messageOf } from '../lib/format'
import { Button } from '../ui/Button'
import { ApprovalNotice } from './ApprovalNotice'
import { ConfirmForm } from './ConfirmForm'
import { ExternalToolCard } from './ExternalToolCard'
import { FeedbackForm } from './FeedbackForm'
import { Panel } from './Panel'
import { StepReviewForm } from './StepReviewForm'
import { UserInputForm } from './UserInputForm'

/** Tools the user decides here. Approvals are resolved by an admin; external tools are recorded through resolveTool/runTools. */
const needsDecision = (t: ToolExecution) => isToolPending(t) && t.approval_type !== 'required' && !t.external_execution_required
const isDecided = (d?: ToolExecution) => !!d && (d.user_feedback_schema ? d.user_feedback_schema.every((q) => (q.selected_options?.length ?? 0) > 0) : true)

interface ToolFormProps { tool: ToolExecution; decided?: ToolExecution; onDecide: (t: ToolExecution) => void; onResolve: (r: string) => void; onRunTools: () => void; onRetryApproval: () => void }

function ToolForm({ tool, decided, onDecide, onResolve, onRunTools, onRetryApproval }: ToolFormProps) {
  if (tool.approval_type === 'required') return <ApprovalNotice tool={tool} onRetry={onRetryApproval} />
  if (tool.user_feedback_schema) return <FeedbackForm tool={tool} decided={decided} onDecide={onDecide} />
  if (tool.user_input_schema) return <UserInputForm tool={tool} decided={decided} onDecide={onDecide} />
  if (tool.requires_confirmation) return <ConfirmForm tool={tool} decided={decided} onDecide={onDecide} />
  if (tool.external_execution_required) return <ExternalToolCard tool={tool} onRunTools={onRunTools} onResolve={onResolve} />
  return null
}

export function PendingPanel<K extends Kind>({ hook }: { hook: AgnoHook<K> }) {
  const pending = hook.pending
  const [draft, setDraft] = useState<Record<string, ToolExecution>>({})
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setDraft({}); setError(null) }, [pending?.runId])
  if (!pending) return null

  const submit = async (decisions: Decision<K>[]) => {
    setError(null)
    try { await hook.continue(decisions) } catch (e) { setError(messageOf(e)) }
  }

  // Workflow step pause (HumanReview): decide the step itself, not a tool.
  const step = 'stepRequirements' in pending && pending.tools.length === 0 ? pending.stepRequirements.at(-1) : undefined
  if (step) {
    return (
      <Panel title={`Step "${step.step_name ?? step.step_id}" is waiting for you`} error={error}>
        <StepReviewForm requirement={step} onSubmit={(r) => void submit([r as Decision<K>])} />
      </Panel>
    )
  }

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
      {!pending.tools.some(needsDecision) && pending.tools.some((t) => t.external_execution_required) && (
        <Button onClick={() => void submit([])}>Continue with recorded results</Button>
      )}
    </Panel>
  )
}
