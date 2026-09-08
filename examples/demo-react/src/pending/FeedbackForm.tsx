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
