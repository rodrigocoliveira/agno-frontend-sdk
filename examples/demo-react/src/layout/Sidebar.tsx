import { Bot, CheckSquare, History, Home, Settings, Users, Workflow } from 'lucide-react'
import { NavLink } from 'react-router'
import { pathFor } from '../catalog'
import { useTargets } from '../connection/TargetsContext'
import { cn } from '../lib/cn'

const link = ({ isActive }: { isActive: boolean }) =>
  cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100', isActive && 'bg-neutral-200 font-medium')

// AgentResponse/TeamResponse/WorkflowSummaryResponse all model `id`/`name` as optional-and-nullable
// in the generated OpenAPI types (backend guarantees them for registered targets); narrow here so
// the section only ever renders — and links to — entries that actually have an id.
function Section({ title, icon, items, kind }: { title: string; icon: React.ReactNode; items: { id?: string | null; name?: string | null }[]; kind: 'agent' | 'team' | 'workflow' }) {
  const withId = items.filter((t): t is { id: string; name?: string | null } => Boolean(t.id))
  return (
    <div>
      <div className="mt-4 mb-1 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{icon}{title}</div>
      {withId.length === 0 && <div className="px-2 text-xs text-neutral-400">none</div>}
      {withId.map((t) => <NavLink key={t.id} to={pathFor(kind, t.id)} className={link}>{t.name || t.id}</NavLink>)}
    </div>
  )
}

export function Sidebar() {
  const { agents, teams, workflows } = useTargets()
  return (
    <aside className="flex h-full flex-col overflow-y-auto border-r border-neutral-200 bg-white p-2">
      <NavLink to="/" end className={link}><Home size={14} />Home</NavLink>
      <Section title="Agents" icon={<Bot size={12} />} items={agents} kind="agent" />
      <Section title="Teams" icon={<Users size={12} />} items={teams} kind="team" />
      <Section title="Workflows" icon={<Workflow size={12} />} items={workflows} kind="workflow" />
      <div className="mt-4 border-t border-neutral-200 pt-2">
        <NavLink to="/sessions" className={link}><History size={14} />Sessions</NavLink>
        <NavLink to="/approvals" className={link}><CheckSquare size={14} />Approvals</NavLink>
        <NavLink to="/settings" className={link}><Settings size={14} />Settings</NavLink>
      </div>
    </aside>
  )
}
