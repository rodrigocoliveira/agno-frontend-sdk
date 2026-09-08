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
