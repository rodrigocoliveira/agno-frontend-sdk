import type { AnyEvent, Kind, Run, RunOf, RunRowLike } from '../types'
import { applyAgentEvent, createAgentRun, fromAgentRow } from './agent'
import { applyTeamEvent, createTeamRun, fromTeamRow, groupTeamRows } from './team'
import { applyWorkflowEvent, createWorkflowRun, fromWorkflowRow } from './workflow'

export function createRun<K extends Kind>(kind: K, targetId: string, over: Partial<RunOf<K>> = {}): RunOf<K> {
  switch (kind) {
    case 'agent': return createAgentRun(targetId, over as never) as RunOf<K>
    case 'team': return createTeamRun(targetId, over as never) as RunOf<K>
    default: return createWorkflowRun(targetId, over as never) as RunOf<K>
  }
}

export function applyEvent<R extends Run>(run: R, ev: AnyEvent): R {
  switch (run.kind) {
    case 'agent': return applyAgentEvent(run, ev) as R
    case 'team': return applyTeamEvent(run, ev) as R
    default: return applyWorkflowEvent(run, ev) as R
  }
}

export function fromRow<K extends Kind>(kind: K, row: RunRowLike): RunOf<K> {
  switch (kind) {
    case 'agent': return fromAgentRow(row) as RunOf<K>
    case 'team': return fromTeamRow(row) as RunOf<K>
    default: return fromWorkflowRow(row) as RunOf<K>
  }
}

/**
 * Session rows → runs, oldest first. Team rows are grouped (members nested); for every other kind a row
 * with a `parent_run_id` is someone else's child — a workflow step's executor agent run, say — and never a
 * top-level run of this session.
 */
export function rowsToRuns<K extends Kind>(kind: K, rows: RunRowLike[]): RunOf<K>[] {
  if (kind === 'team') return groupTeamRows(rows) as RunOf<K>[]
  return rows.filter((r) => !r.parent_run_id).map((r) => fromRow(kind, r)).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
}

export * from './agent'
export * from './team'
export * from './workflow'
export * from './hitl'
