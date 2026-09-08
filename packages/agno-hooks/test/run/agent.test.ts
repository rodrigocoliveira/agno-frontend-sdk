import { describe, expect, test } from 'bun:test'
import type { AnyEvent } from '../../src/types'
import { applyAgentEvent, createAgentRun, fromAgentRow } from '../../src/run/agent'

const ev = (event: string, extra: Record<string, unknown> = {}): AnyEvent => ({ event, run_id: 'r1', session_id: 's1', agent_id: 'a', ...extra })
const tool = { tool_call_id: 'c1', tool_name: 'add_one', tool_args: { x: 41 } }

const stream: AnyEvent[] = [
  ev('RunStarted', { event_index: 0 }),
  ev('ModelRequestStarted'),
  ev('RunContent', { content: 'Echo: ', content_type: 'str', reasoning_content: '' }),
  ev('RunContent', { content: 'hi ', content_type: 'str' }),
  ev('ToolCallStarted', { tool }),
  ev('ToolCallCompleted', { tool: { ...tool, result: '42' } }),
  ev('RunContentCompleted'),
  ev('RunCompleted', { content: 'Echo: hi ', content_type: 'str', tools: [{ ...tool, result: '42' }], metrics: { duration: 1 }, images: [{ id: 'i' }], citations: { c: 1 } }),
]

describe('applyAgentEvent', () => {
  test('full happy path', () => {
    const run = stream.reduce(applyAgentEvent, createAgentRun('a', { id: 'local-1', status: 'running', local: true }))
    expect(run.id).toBe('r1')
    expect(run.sessionId).toBe('s1')
    expect(run.status).toBe('completed')
    expect(run.content).toBe('Echo: hi ')
    expect(run.tools).toEqual([{ ...tool, result: '42' }])
    expect(run.media.images).toEqual([{ id: 'i' }])
    expect(run.citations).toEqual({ c: 1 })
    expect(run.metrics).toEqual({ duration: 1 })
    expect(run.local).toBe(true)
    expect(run.raw).toBe(stream.at(-1))
  })
  test('content is appended only for str deltas; final content replaces', () => {
    let run = createAgentRun('a')
    run = applyAgentEvent(run, ev('RunContent', { content: 'a', content_type: 'str' }))
    run = applyAgentEvent(run, ev('RunContent', { content: { json: 1 }, content_type: 'json' }))
    run = applyAgentEvent(run, ev('RunContent', { content: 'b' }))
    expect(run.content).toBe('ab')
    run = applyAgentEvent(run, ev('RunCompleted', { content: { final: true } }))
    expect(run.content).toBe('{"final":true}')
  })
  test('reasoning accumulates from deltas and RunContent', () => {
    let run = createAgentRun('a')
    run = applyAgentEvent(run, ev('ReasoningContentDelta', { reasoning_content: 'think ' }))
    run = applyAgentEvent(run, ev('RunContent', { content: 'x', reasoning_content: 'more' }))
    expect(run.reasoning).toBe('think more')
    run = applyAgentEvent(run, ev('ReasoningCompleted', { reasoning_content: 'final' }))
    expect(run.reasoning).toBe('final')
  })
  test('pause keeps tools and requirements; continue resumes', () => {
    let run = createAgentRun('a')
    const paused = { ...tool, requires_confirmation: true }
    run = applyAgentEvent(run, ev('ToolCallStarted', { tool: paused }))
    run = applyAgentEvent(run, ev('RunPaused', { tools: [paused], requirements: [{ id: 'c1', tool_execution: paused }] }))
    expect(run.status).toBe('paused')
    expect(run.tools).toEqual([paused])
    expect(run.requirements).toEqual([{ id: 'c1', tool_execution: paused }])
    run = applyAgentEvent(run, ev('RunContinued'))
    expect(run.status).toBe('running')
    run = applyAgentEvent(run, ev('RunCompleted', { content: 'done', tools: [{ ...paused, confirmed: true, result: '42' }] }))
    expect(run.requirements).toBeNull()
    expect(run.tools[0]!.confirmed).toBe(true)
  })
  test('error and cancel', () => {
    expect(applyAgentEvent(createAgentRun('a'), ev('RunError', { error: 'boom' }))).toMatchObject({ status: 'error', error: 'boom' })
    expect(applyAgentEvent(createAgentRun('a'), ev('RunError', { content: 'bad' }))).toMatchObject({ status: 'error', error: 'bad' })
    expect(applyAgentEvent(createAgentRun('a'), ev('RunCancelled', { reason: 'user' }))).toMatchObject({ status: 'cancelled', error: 'user' })
  })
  test('unknown event returns the same reference', () => {
    const run = createAgentRun('a')
    expect(applyAgentEvent(run, ev('SomethingNew'))).toBe(run)
  })
})

describe('fromAgentRow', () => {
  test('history row and stream produce the same run', () => {
    const fromStream = stream.reduce(applyAgentEvent, createAgentRun('a', { id: 'local-1', status: 'running', local: true, input: { message: 'hi', files: [], media: null } }))
    const row = {
      run_id: 'r1', agent_id: 'a', session_id: 's1', status: 'COMPLETED', run_input: 'hi', content: 'Echo: hi ',
      tools: [{ ...tool, result: '42' }], metrics: { duration: 1 }, images: [{ id: 'i' }], citations: { c: 1 },
      created_at: '2026-09-06T10:00:00Z', messages: [{ role: 'user', content: 'hi' }],
    }
    const fromRow = fromAgentRow(row)
    for (const k of ['id', 'sessionId', 'status', 'content', 'tools', 'input'] as const) expect(fromRow[k]).toEqual(fromStream[k])
    expect(fromRow.local).toBe(false)
    expect(fromRow.createdAt).toBe(Date.parse('2026-09-06T10:00:00Z') / 1000)
    expect(fromRow.raw).toBe(row)
  })
  test('epoch created_at, paused status and object content', () => {
    const r = fromAgentRow({ run_id: 'r2', status: 'PAUSED', created_at: 1700000000, content: { a: 1 }, tools: [{ ...tool, requires_confirmation: true }], requirements: null })
    expect(r.createdAt).toBe(1700000000)
    expect(r.status).toBe('paused')
    expect(r.content).toBe('{"a":1}')
    expect(r.requirements).toBeNull()
  })
  test('single-run GET shape (no run_input, input nested as RunInput) still yields plain message text', () => {
    // The list endpoint (GET /sessions/{id}/runs) returns a flat `run_input` string. The single-run GET
    // endpoint used to refetch a PAUSED row for its requirements has no `run_input` at all — instead the
    // input is agno's `RunInput` dataclass, nested as `input: { input_content }`.
    const row = { run_id: 'r3', agent_id: 'a', status: 'PAUSED', input: { input_content: 'what is around me' }, tools: [], requirements: [] }
    const r = fromAgentRow(row)
    expect(r.input.message).toBe('what is around me')
  })
})
