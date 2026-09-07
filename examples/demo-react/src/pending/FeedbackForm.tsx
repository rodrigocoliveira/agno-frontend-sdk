import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { provideUserFeedback } from '@rodrigocoliveira/agno-hooks'
import { cn } from '../lib/cn'
import { Card } from '../ui/Card'

/** Native ask_user: one block per question; multi_select toggles, single select replaces. Answers accumulate on `decided`. */
export function FeedbackForm({ tool, decided, onDecide }: { tool: ToolExecution; decided?: ToolExecution; onDecide: (t: ToolExecution) => void }) {
  const base = decided ?? tool
  const chosen = (question: string) => base.user_feedback_schema?.find((q) => q.question === question)?.selected_options ?? []
  const pick = (question: string, label: string, multi: boolean) => {
    const current = chosen(question)
    const next = multi ? (current.includes(label) ? current.filter((l) => l !== label) : [...current, label]) : [label]
    onDecide(provideUserFeedback(base, { [question]: next }))
  }
  return (
    <Card className="space-y-3 text-sm">
      {(tool.user_feedback_schema ?? []).map((q) => (
        <div key={q.question}>
          <div className="font-medium">{q.header && <span className="text-neutral-500">{q.header} · </span>}{q.question}</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {(q.options ?? []).map((o) => (
              <button
                key={o.label}
                type="button"
                title={o.description ?? ''}
                onClick={() => pick(q.question, o.label, !!q.multi_select)}
                className={cn('rounded-full border px-3 py-1 text-xs', chosen(q.question).includes(o.label) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white hover:bg-neutral-100')}
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
