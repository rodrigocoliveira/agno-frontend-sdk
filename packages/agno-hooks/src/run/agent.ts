import type { AgentRun, AnyEvent, RunRowLike } from '../types'
import { applyBaseEvent, emptyBase, fromBaseRow } from './base'

export function createAgentRun(agentId: string, over: Partial<AgentRun> = {}): AgentRun {
  return { ...emptyBase(), kind: 'agent', agentId, ...over }
}

export function applyAgentEvent(run: AgentRun, ev: AnyEvent): AgentRun {
  return applyBaseEvent(run, ev)
}

export function fromAgentRow(row: RunRowLike): AgentRun {
  return fromBaseRow(createAgentRun(row.agent_id ?? ''), row)
}
