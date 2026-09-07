import { isToolPending, type AgentRun, type TeamRun } from '@rodrigocoliveira/agno-hooks'
import type { ToolExecution } from '@rodrigocoliveira/agno-api'

function ToolChip({ t }: { t: ToolExecution }) {
  const cls = t.tool_call_error ? 'chip error' : isToolPending(t) ? 'chip pending' : 'chip'
  const answered = t.user_feedback_schema?.map((q) => `${q.header ?? q.question}: ${(q.selected_options ?? []).join(', ')}`).join(' · ')
  return <span className={cls} title={JSON.stringify(t.tool_args)}>{t.tool_name}{answered ? ` → ${answered}` : t.result != null ? ' ✓' : isToolPending(t) ? ' …' : ''}</span>
}

export function RunView({ run, onRetry }: { run: AgentRun | TeamRun; onRetry?: (id: string) => void }) {
  return (
    <>
      {run.input.message && <div className="bubble user">{run.input.message}</div>}
      {run.tools.length > 0 && <div>{run.tools.map((t) => <ToolChip key={t.tool_call_id} t={t} />)}</div>}
      {run.kind === 'team' && run.members.length > 0 && (
        <div className="members">{run.members.map((m) => <RunView key={m.id} run={m} />)}</div>
      )}
      {run.content && <div className="bubble assistant">{run.content}</div>}
      {run.status === 'running' && !run.content && <div className="bubble assistant">…</div>}
      {run.error && <div className="error">{run.error} {onRetry && <button onClick={() => onRetry(run.id)}>retry</button>}</div>}
    </>
  )
}
