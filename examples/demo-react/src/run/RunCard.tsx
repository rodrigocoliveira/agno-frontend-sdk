import type { Run } from '@rodrigocoliveira/agno-hooks'
import { Paperclip } from 'lucide-react'
import Markdown from 'react-markdown'
import { cn } from '../lib/cn'
import { formatTime } from '../lib/format'
import { Badge, type Tone } from '../ui/Badge'
import { Button } from '../ui/Button'
import { MemberRuns } from './MemberRuns'
import { RawDrawer } from './RawDrawer'
import { StepList } from './StepList'
import { ToolCallList } from './ToolCallList'

const tone: Record<Run['status'], Tone> = { running: 'blue', paused: 'amber', completed: 'green', error: 'red', cancelled: 'neutral' }

function metricsSummary(m: unknown): string | null {
  if (!m || typeof m !== 'object') return null
  const r = m as Record<string, unknown>
  const parts = [
    typeof r.total_tokens === 'number' && `${r.total_tokens} tokens`,
    typeof r.duration === 'number' && `${r.duration.toFixed(1)} s`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

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
