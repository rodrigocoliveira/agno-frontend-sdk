import { describe, expect, test } from 'bun:test'
import type { AnyEvent } from '../../src/types'
import { applyTeamEvent, createTeamRun, fromTeamRow, groupTeamRows } from '../../src/run/team'

const team = (event: string, extra: Record<string, unknown> = {}): AnyEvent => ({ event, run_id: 't1', session_id: 's1', team_id: 'team', ...extra })
const member = (event: string, extra: Record<string, unknown> = {}): AnyEvent => ({ event, run_id: 'm1', parent_run_id: 't1', agent_id: 'agent', session_id: 's1', ...extra })
const delegate = { tool_call_id: 'd1', tool_name: 'delegate_task_to_member', tool_args: { member_id: 'agent', task: 'hi' } }

const stream: AnyEvent[] = [
  team('TeamRunStarted'),
  team('TeamToolCallStarted', { tool: delegate }),
  member('RunStarted'),
  member('RunContent', { content: 'Echo: ', content_type: 'str' }),
  member('RunContent', { content: 'hi ', content_type: 'str' }),
  member('RunCompleted', { content: 'Echo: hi ' }),
  team('TeamToolCallCompleted', { tool: { ...delegate, result: 'Echo: hi ' } }),
  team('TeamRunContent', { content: 'Done ', content_type: 'str' }),
  team('TeamRunCompleted', { content: 'Done ', member_responses: [{ run_id: 'm1' }] }),
]

describe('applyTeamEvent', () => {
  test('team events drive the run, member events drive members', () => {
    const run = stream.reduce(applyTeamEvent, createTeamRun('team', { id: 'local-1', local: true }))
    expect(run.id).toBe('t1')
    expect(run.status).toBe('completed')
    expect(run.content).toBe('Done ')
    expect(run.tools).toEqual([{ ...delegate, result: 'Echo: hi ' }])
    expect(run.members).toHaveLength(1)
    expect(run.members[0]).toMatchObject({ kind: 'agent', id: 'm1', agentId: 'agent', status: 'completed', content: 'Echo: hi ', local: false })
  })
  test('member pause propagates through TeamRunPaused.requirements, not tools', () => {
    const t = { tool_call_id: 'c1', tool_name: 'add_one', tool_args: { x: 1 }, requires_confirmation: true }
    let run = createTeamRun('team', { id: 't1' })
    run = applyTeamEvent(run, member('RunStarted'))
    run = applyTeamEvent(run, member('ToolCallStarted', { tool: t }))
    run = applyTeamEvent(run, member('RunPaused', { tools: [t] }))
    run = applyTeamEvent(run, team('TeamRunPaused', { tools: [], requirements: [{ id: 'req1', tool_execution: t, member_agent_id: 'agent', member_run_id: 'm1' }] }))
    expect(run.status).toBe('paused')
    expect(run.tools).toEqual([])
    expect(run.requirements![0]!.member_run_id).toBe('m1')
    expect(run.members[0]!.status).toBe('paused')
  })
  test('unrelated run ids are ignored', () => {
    const run = createTeamRun('team', { id: 't1' })
    expect(applyTeamEvent(run, { event: 'RunContent', run_id: 'zzz', content: 'x' })).toBe(run)
  })
})

describe('groupTeamRows / fromTeamRow', () => {
  test('member rows attach to their parent by parent_run_id, ordered by created_at', () => {
    const rows = [
      { run_id: 'm2', agent_id: 'agent', parent_run_id: 't1', status: 'COMPLETED', created_at: 20 },
      { run_id: 't1', team_id: 'team', status: 'COMPLETED', run_input: 'hi', content: 'Done', created_at: 5 },
      { run_id: 'm1', agent_id: 'agent', parent_run_id: 't1', status: 'COMPLETED', created_at: 10 },
      { run_id: 'orphan', agent_id: 'agent', parent_run_id: 'nope', status: 'COMPLETED', created_at: 1 },
    ]
    const runs = groupTeamRows(rows)
    expect(runs.map((r) => r.id)).toEqual(['t1'])
    expect(runs[0]!.members.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(runs[0]!.teamId).toBe('team')
  })
  test('fromTeamRow keeps members empty', () => {
    expect(fromTeamRow({ run_id: 't9', team_id: 'team', status: 'RUNNING' })).toMatchObject({ kind: 'team', id: 't9', status: 'running', members: [] })
  })
  test('single-run GET shape (no run_input, input nested as RunInput) still yields plain message text', () => {
    // Same real single-run endpoint shape confirmed live for a team: no `run_input`, input nested as
    // agno's `RunInput` dataclass (`{ input_content }`).
    const row = { run_id: 't2', team_id: 'team', status: 'PAUSED', input: { input_content: 'what is around me' }, tools: [], requirements: [] }
    const r = fromTeamRow(row)
    expect(r.input.message).toBe('what is around me')
  })
})
