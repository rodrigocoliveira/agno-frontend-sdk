import type { Run } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useRef } from 'react'
import { Empty } from '../ui/Empty'
import { RunCard } from './RunCard'

export function RunList({ runs, hint, onRetry }: { runs: Run[]; hint: string; onRetry: (id: string) => void }) {
  const end = useRef<HTMLDivElement>(null)
  const last = runs.at(-1)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [runs.length, last?.content, last?.status])
  if (runs.length === 0) return <div className="flex flex-1 flex-col"><Empty title="No runs yet">{hint}</Empty></div>
  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4">
      {runs.map((r) => <RunCard key={r.id} run={r} onRetry={onRetry} />)}
      <div ref={end} />
    </div>
  )
}
