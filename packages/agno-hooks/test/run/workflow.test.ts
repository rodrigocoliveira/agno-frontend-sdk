import { describe, expect, test } from 'bun:test'
import type { AnyEvent } from '../../src/types'
import { applyWorkflowEvent, createWorkflowRun, fromWorkflowRow } from '../../src/run/workflow'
import { applyEvent, createRun, fromRow, rowsToRuns } from '../../src/run'

const wf = (event: string, extra: Record<string, unknown> = {}): AnyEvent => ({ event, run_id: 'w1', session_id: 's1', workflow_id: 'wf', ...extra })
const step = { step_id: 'st1', step_name: 'echo', step_index: 0 }
const exec = (event: string, extra: Record<string, unknown> = {}): AnyEvent => ({ event, run_id: 'x1', agent_id: 'agent', workflow_run_id: 'w1', ...step, ...extra })
const result = { step_id: 'st1', step_name: 'echo', content: 'Echo: hi ', step_run_id: 'x1', success: true }

const stream: AnyEvent[] = [
  wf('WorkflowStarted'),
  wf('StepStarted', step),
  exec('RunStarted'),
  exec('RunContent', { content: 'Echo: ', content_type: 'str' }),
  exec('ToolCallStarted', { tool: { tool_call_id: 'c1', tool_name: 'add_one', tool_args: {} } }),
  exec('RunContent', { content: 'hi ', content_type: 'str' }),
  exec('RunCompleted', { content: 'Echo: hi ' }),
  wf('StepCompleted', { ...step, content: 'Echo: hi ', step_response: result }),
  wf('WorkflowCompleted', { content: 'Echo: hi ', step_results: [result], metrics: { steps: {} } }),
]

describe('applyWorkflowEvent', () => {
  test('steps are built from StepStarted and fed by executor events', () => {
    const run = stream.reduce(applyWorkflowEvent, createWorkflowRun('wf', { id: 'local-1', local: true }))
    expect(run.id).toBe('w1')
    expect(run.status).toBe('completed')
    expect(run.content).toBe('Echo: hi ')
    expect(run.steps).toHaveLength(1)
    expect(run.steps[0]).toMatchObject({ id: 'st1', name: 'echo', index: 0, status: 'completed', content: 'Echo: hi ', executorRunId: 'x1' })
    expect(run.steps[0]!.tools[0]!.tool_name).toBe('add_one')
    expect(run.steps[0]!.raw).toEqual(result)
  })
  test('executor event before StepStarted creates the step', () => {
    const run = applyWorkflowEvent(createWorkflowRun('wf', { id: 'w1' }), exec('RunContent', { content: 'x', content_type: 'str' }))
    expect(run.steps[0]).toMatchObject({ id: 'st1', name: 'echo', index: 0, content: 'x', status: 'running' })
  })
  test('WorkflowPaused exposes step requirements and pause kind', () => {
    const sr = { step_id: 'st1', step_name: 'echo', requires_confirmation: true }
    let run = applyWorkflowEvent(createWorkflowRun('wf', { id: 'w1' }), wf('StepStarted', step))
    run = applyWorkflowEvent(run, wf('StepPaused', step))
    run = applyWorkflowEvent(run, wf('WorkflowPaused', { pause_kind: 'step', step_requirements: [sr], paused_step_index: 0 }))
    expect(run.status).toBe('paused')
    expect(run.pauseKind).toBe('step')
    expect(run.stepRequirements).toEqual([sr])
    expect(run.steps[0]!.status).toBe('paused')
    run = applyWorkflowEvent(run, wf('StepContinued', step))
    expect(run.status).toBe('running')
    expect(run.steps[0]!.status).toBe('running')
    run = applyWorkflowEvent(run, wf('WorkflowCompleted', { content: 'ok', step_results: [result] }))
    expect(run.stepRequirements).toBeNull()
    expect(run.pauseKind).toBeNull()
  })
  test('error / cancel', () => {
    expect(applyWorkflowEvent(createWorkflowRun('wf'), wf('WorkflowError', { error: 'x' }))).toMatchObject({ status: 'error', error: 'x' })
    expect(applyWorkflowEvent(createWorkflowRun('wf'), wf('WorkflowCancelled', { reason: 'r' }))).toMatchObject({ status: 'cancelled' })
  })
})

describe('fromWorkflowRow', () => {
  test('steps from step_results; paused fields', () => {
    const row = { run_id: 'w1', workflow_id: 'wf', status: 'PAUSED', run_input: 'hi', content: null, step_results: [result], step_requirements: [{ step_id: 'st1', requires_confirmation: true }], pause_kind: 'step', created_at: '2026-09-06T00:00:00Z' }
    const run = fromWorkflowRow(row)
    expect(run).toMatchObject({ kind: 'workflow', workflowId: 'wf', status: 'paused', pauseKind: 'step', input: { message: 'hi' } })
    expect(run.steps[0]).toMatchObject({ id: 'st1', name: 'echo', content: 'Echo: hi ', executorRunId: 'x1', status: 'completed' })
    expect(run.stepRequirements![0]!.step_id).toBe('st1')
  })
  test('row and stream agree', () => {
    const fromStream = stream.reduce(applyWorkflowEvent, createWorkflowRun('wf', { id: 'local', local: true, input: { message: 'hi', files: [], media: null } }))
    const fromR = fromWorkflowRow({ run_id: 'w1', workflow_id: 'wf', session_id: 's1', status: 'COMPLETED', run_input: 'hi', content: 'Echo: hi ', step_results: [result] })
    for (const k of ['id', 'status', 'content', 'input'] as const) expect(fromR[k]).toEqual(fromStream[k])
    expect(fromR.steps.map((s) => [s.id, s.content, s.status])).toEqual(fromStream.steps.map((s) => [s.id, s.content, s.status]))
  })
})

describe('dispatcher', () => {
  test('createRun / applyEvent / fromRow / rowsToRuns by kind', () => {
    expect(createRun('agent', 'a').kind).toBe('agent')
    expect(createRun('team', 't').kind).toBe('team')
    expect(createRun('workflow', 'w').kind).toBe('workflow')
    expect(applyEvent(createRun('workflow', 'w'), wf('WorkflowStarted')).id).toBe('w1')
    expect(fromRow('team', { run_id: 't1', team_id: 't', status: 'COMPLETED' }).kind).toBe('team')
    const rows = [{ run_id: 'b', agent_id: 'a', status: 'COMPLETED', created_at: 2 }, { run_id: 'a', agent_id: 'a', status: 'COMPLETED', created_at: 1 }]
    expect(rowsToRuns('agent', rows).map((r) => r.id)).toEqual(['a', 'b'])
    expect(rowsToRuns('team', [{ run_id: 'm', agent_id: 'a', parent_run_id: 't1', status: 'COMPLETED' }, { run_id: 't1', team_id: 't', status: 'COMPLETED' }])[0]!.members).toHaveLength(1)
  })
})
