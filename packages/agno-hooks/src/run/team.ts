import type { AnyEvent, RunRowLike, TeamRun } from '../types'
import { applyAgentEvent, createAgentRun, fromAgentRow } from './agent'
import { applyBaseEvent, emptyBase, fromBaseRow } from './base'

export function createTeamRun(teamId: string, over: Partial<TeamRun> = {}): TeamRun {
  return { ...emptyBase(), kind: 'team', teamId, members: [], ...over }
}

export function applyTeamEvent(run: TeamRun, ev: AnyEvent): TeamRun {
  // A member's event: a run id other than this team run's, carrying this team run as its parent.
  if (typeof ev.run_id === 'string' && ev.run_id !== run.id && ev.parent_run_id === run.id) {
    const i = run.members.findIndex((m) => m.id === ev.run_id)
    const current = i === -1
      ? createAgentRun(typeof ev.agent_id === 'string' ? ev.agent_id : '', { id: ev.run_id, sessionId: run.sessionId })
      : run.members[i]!
    const next = applyAgentEvent(current, ev)
    if (i !== -1 && next === current) return run
    const members = run.members.slice()
    if (i === -1) members.push(next); else members[i] = next
    return { ...run, members }
  }
  if (ev.event.startsWith('Team')) return applyBaseEvent(run, { ...ev, event: ev.event.slice(4) })
  return run
}

export function fromTeamRow(row: RunRowLike): TeamRun {
  return fromBaseRow(createTeamRun(row.team_id ?? ''), row)
}

/** Rows of a team session: team runs at the top, member rows (parent_run_id) nested in `members`. Orphans are dropped with a warning. */
export function groupTeamRows(rows: RunRowLike[]): TeamRun[] {
  const teams = new Map<string, TeamRun>()
  for (const row of rows) if (!row.parent_run_id) teams.set(row.run_id, fromTeamRow(row))
  for (const row of rows) {
    if (!row.parent_run_id) continue
    const parent = teams.get(row.parent_run_id)
    if (!parent) { console.warn(`[agno-hooks] member run ${row.run_id} has unknown parent ${row.parent_run_id}`); continue }
    parent.members = [...parent.members, fromAgentRow(row)]
  }
  const byTime = (a: { createdAt: number | null }, b: { createdAt: number | null }) => (a.createdAt ?? 0) - (b.createdAt ?? 0)
  const out = [...teams.values()].sort(byTime)
  for (const t of out) t.members = t.members.slice().sort(byTime)
  return out
}
