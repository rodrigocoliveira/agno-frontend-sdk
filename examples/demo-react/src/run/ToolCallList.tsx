import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { isToolPending } from '@rodrigocoliveira/agno-hooks'
import { Badge, type Tone } from '../ui/Badge'

function state(t: ToolExecution): { label: string; tone: Tone } {
  if (t.tool_call_error) return { label: 'error', tone: 'red' }
  if (isToolPending(t)) return { label: 'pending', tone: 'amber' }
  if (t.confirmed === false) return { label: 'rejected', tone: 'neutral' }
  return { label: 'done', tone: 'green' }
}

function answers(t: ToolExecution): string | null {
  const qs = t.user_feedback_schema?.filter((q) => q.selected_options?.length)
  return qs?.length ? qs.map((q) => `${q.header ?? q.question}: ${q.selected_options!.join(', ')}`).join(' · ') : null
}

export function ToolCallList({ tools }: { tools: ToolExecution[] }) {
  return (
    <ul className="space-y-1">
      {tools.map((t) => {
        const s = state(t)
        return (
          <li key={t.tool_call_id}>
            <details className="rounded border border-neutral-200 bg-white text-xs">
              <summary className="flex cursor-pointer items-center gap-2 px-2 py-1">
                <span className="font-mono">{t.tool_name}</span>
                <Badge tone={s.tone}>{s.label}</Badge>
                {answers(t) && <span className="text-neutral-500">{answers(t)}</span>}
              </summary>
              <div className="space-y-1 border-t border-neutral-100 px-2 py-1">
                <div><span className="text-neutral-500">args </span><code>{JSON.stringify(t.tool_args ?? {})}</code></div>
                {t.result != null && <div><span className="text-neutral-500">result </span><code className="whitespace-pre-wrap">{String(t.result)}</code></div>}
                {t.approval_id && <div><span className="text-neutral-500">approval </span><code>{t.approval_id}</code></div>}
              </div>
            </details>
          </li>
        )
      })}
    </ul>
  )
}
