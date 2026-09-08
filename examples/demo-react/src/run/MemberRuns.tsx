import type { AgentRun } from '@rodrigocoliveira/agno-hooks'
import { RunCard } from './RunCard'

export function MemberRuns({ members }: { members: AgentRun[] }) {
  return (
    <div className="space-y-3 rounded-md border border-dashed border-neutral-300 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Members</div>
      {members.map((m) => <RunCard key={m.id} run={m} nested />)}
    </div>
  )
}
