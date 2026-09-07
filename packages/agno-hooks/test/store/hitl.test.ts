import { describe, expect, test } from 'bun:test'
import { confirm, provideUserFeedback } from '../../src/run/hitl'
import { createAgnoStore, type StoreOptions } from '../../src/store/store'
import type { AnyEvent } from '../../src/types'
import { apiWith, bodyParam, frames, json, mockFetch, until, wait } from './helpers'

const started = (run_id: string, extra: Record<string, unknown> = {}): AnyEvent => ({ event: 'RunStarted', run_id, session_id: 's1', agent_id: 'a', event_index: 0, ...extra })
const confirmTool = { tool_call_id: 'c1', tool_name: 'add_one', tool_args: { x: 1 }, requires_confirmation: true }
const askTool = { tool_call_id: 'c2', tool_name: 'ask_user', tool_args: {}, requires_user_input: true, user_feedback_schema: [{ question: 'Where?', header: 'Use', options: [{ label: 'Trail' }, { label: 'Road' }] }] }
const extTool = { tool_call_id: 'c3', tool_name: 'get_location', tool_args: {}, external_execution_required: true }
const pausedWith = (run_id: string, tools: unknown[], requirements?: unknown[]) =>
  frames([started(run_id), ...tools.map((t, i) => ({ event: 'ToolCallStarted', run_id, tool: t, event_index: i + 1 })), { event: 'RunPaused', run_id, tools, requirements, event_index: 9 }])
const continued = (run_id: string) => frames([{ event: 'RunContinued', run_id, event_index: 10 }, { event: 'RunCompleted', run_id, content: 'done', event_index: 11 }])

// `Parameters<typeof createAgnoStore>[0]` would resolve K to the whole `Kind` union, making every
// `snapshot.pending` here the workflow/agent union; pin K to 'agent' instead.
const agentStore = (fetchFn: typeof fetch, over: Partial<StoreOptions<'agent'>> = {}) =>
  createAgnoStore<'agent'>({ api: apiWith(fetchFn), target: { kind: 'agent', id: 'a' }, retryDelays: [1, 1, 1], ...over })

describe('continue', () => {
  test('agent: decisions go out as tools JSON; pending clears; answered tool stays in run.tools', async () => {
    const m = mockFetch((call) => (call.url.endsWith('/continue') ? continued('r1') : pausedWith('r1', [confirmTool, askTool])))
    const store = agentStore(m.fetch)
    await store.send('hi')
    const s = store.getSnapshot()
    expect(s.runs[0]!.status).toBe('paused')
    expect(s.pending!.tools.map((t) => t.tool_call_id)).toEqual(['c1', 'c2'])
    expect(s.isBusy).toBe(true)
    await expect(store.continue([confirm(confirmTool)])).rejects.toThrow('Tool c2 still pending')
    expect(m.calls).toHaveLength(1)
    await store.continue([confirm(confirmTool), provideUserFeedback(askTool, { 'Where?': ['Trail'] })], { additional_instructions: 'be brief' })
    const call = m.calls[1]!
    expect(call.url).toContain('/agents/a/runs/r1/continue')
    const tools = JSON.parse(bodyParam(call, 'tools')!)
    expect(tools).toHaveLength(2)
    expect(tools[0]).toMatchObject({ tool_call_id: 'c1', confirmed: true })
    expect(tools[1].user_feedback_schema[0].selected_options).toEqual(['Trail'])
    expect(bodyParam(call, 'additional_instructions')).toBe('be brief')
    expect(bodyParam(call, 'background')).toBe('true')
    const done = store.getSnapshot()
    expect(done.pending).toBeNull()
    expect(done.runs[0]!.status).toBe('completed')
    expect(done.isBusy).toBe(false)
  })

  test('team: decisions are wrapped in the original requirement', async () => {
    const memberTool = { ...confirmTool, tool_call_id: 'm1' }
    const req = { id: 'req-1', tool_execution: memberTool, member_agent_id: 'agent', member_run_id: 'mr1' }
    const m = mockFetch((call) => call.url.endsWith('/continue')
      ? frames([{ event: 'TeamRunContinued', run_id: 't1' }, { event: 'TeamRunCompleted', run_id: 't1', content: 'ok' }])
      : frames([{ event: 'TeamRunStarted', run_id: 't1', session_id: 's1' }, { event: 'TeamRunPaused', run_id: 't1', tools: [], requirements: [req] }]))
    const store = createAgnoStore({ api: apiWith(m.fetch), target: { kind: 'team', id: 'team' } })
    await store.send('hi')
    expect(store.getSnapshot().pending!.tools).toEqual([memberTool])
    await store.continue([confirm(memberTool)])
    const reqs = JSON.parse(bodyParam(m.calls[1]!, 'requirements')!)
    expect(reqs[0]).toMatchObject({ id: 'req-1', member_run_id: 'mr1', tool_execution: { tool_call_id: 'm1', confirmed: true } })
    expect(bodyParam(m.calls[1]!, 'tools')).toBeNull()
  })

  test('workflow: step_requirements; only the last one must be decided', async () => {
    const sr = { step_id: 'st1', step_name: 'echo', requires_confirmation: true }
    const m = mockFetch((call) => call.url.endsWith('/continue')
      ? frames([{ event: 'StepContinued', run_id: 'w1', step_id: 'st1' }, { event: 'WorkflowCompleted', run_id: 'w1', content: 'ok' }])
      : frames([{ event: 'WorkflowStarted', run_id: 'w1', session_id: 's1' }, { event: 'WorkflowPaused', run_id: 'w1', pause_kind: 'step', step_requirements: [sr] }]))
    const store = createAgnoStore({ api: apiWith(m.fetch), target: { kind: 'workflow', id: 'wf' } })
    await store.send('go')
    expect(store.getSnapshot().pending).toEqual({ runId: 'w1', stepRequirements: [sr] })
    await expect(store.continue([])).rejects.toThrow('Step st1 still pending')
    await store.continue([{ ...sr, confirmed: true }])
    expect(JSON.parse(bodyParam(m.calls[1]!, 'step_requirements')!)[0]).toMatchObject({ step_id: 'st1', confirmed: true })
    expect(store.getSnapshot().runs[0]!.status).toBe('completed')
  })

  test('approval-gated tool needs no local decision; 403 keeps the run paused with error', async () => {
    const gated = { ...confirmTool, approval_type: 'required', approval_id: 'ap1' }
    let n = 0
    const m = mockFetch((call) => call.url.endsWith('/continue')
      ? (++n === 1 ? json({ detail: 'Approval pending' }, 403) : continued('r1'))
      : pausedWith('r1', [gated]))
    const store = agentStore(m.fetch)
    await store.send('hi')
    await store.continue([])
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'paused', error: expect.stringContaining('Approval pending') })
    expect(store.getSnapshot().pending!.tools[0]!.approval_id).toBe('ap1')
    await store.continue([])
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'completed', error: null })
    expect(JSON.parse(bodyParam(m.calls[2]!, 'tools')!)).toEqual([])
  })
})

describe('frontendTools', () => {
  test('runs mapped external tools and continues by itself; errors become tool errors', async () => {
    const boom = { ...extTool, tool_call_id: 'c4', tool_name: 'explode' }
    const m = mockFetch((call) => (call.url.endsWith('/continue') ? continued('r1') : pausedWith('r1', [extTool, boom])))
    const seen: unknown[] = []
    const store = agentStore(m.fetch, {
      frontendTools: {
        get_location: async (args, ctx) => { seen.push([args, ctx.tool.tool_call_id, ctx.run.id]); return { lat: 1 } },
        explode: async () => { throw new Error('gps off') },
      },
    })
    await store.send('hi')
    await until(store, (s) => s.runs[0]!.status === 'completed')
    expect(seen).toEqual([[{}, 'c3', 'r1']])
    const tools = JSON.parse(bodyParam(m.calls[1]!, 'tools')!)
    expect(tools).toEqual([
      expect.objectContaining({ tool_call_id: 'c3', result: '{"lat":1}' }),
      expect.objectContaining({ tool_call_id: 'c4', tool_call_error: true, result: 'gps off' }),
    ])
  })

  test('partial: unmapped or non-external tools keep the run paused; resolveTool completes it', async () => {
    const m = mockFetch((call) => (call.url.endsWith('/continue') ? continued('r1') : pausedWith('r1', [extTool, confirmTool, { ...extTool, tool_call_id: 'c5', tool_name: 'manual' }])))
    const store = agentStore(m.fetch, { frontendTools: { get_location: async () => 'here' } })
    await store.send('hi')
    await wait(20)
    const s = store.getSnapshot()
    expect(s.runs[0]!.status).toBe('paused')
    expect(s.pending!.tools.find((t) => t.tool_call_id === 'c3')!.result).toBe('here') // resolved, still listed
    store.resolveTool('c5', { ok: true })
    expect(store.getSnapshot().pending!.tools.find((t) => t.tool_call_id === 'c5')!.result).toBe('{"ok":true}')
    await store.continue([confirm(confirmTool)])
    const tools = JSON.parse(bodyParam(m.calls[1]!, 'tools')!)
    expect(tools.map((t: { tool_call_id: string }) => t.tool_call_id).sort()).toEqual(['c1', 'c3', 'c5'])
  })

  test('hydrated PAUSED run does not auto-run; runTools() does', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([{ run_id: 'r1', agent_id: 'a', status: 'PAUSED', tools: [extTool] }])
      if (call.url.endsWith('/continue')) return continued('r1')
      // GET .../runs/r1 carries `?session_id=s1`, so it can only be matched with `includes`.
      if (call.url.includes('/agents/a/runs/r1')) return json({ run_id: 'r1', agent_id: 'a', status: 'PAUSED', tools: [extTool] })
      throw new Error('unexpected ' + call.url)
    })
    let calls = 0
    const store = agentStore(m.fetch, { sessionId: 's1', frontendTools: { get_location: async () => { calls++; return 'x' } } })
    await until(store, (s) => s.status === 'ready')
    await wait(20)
    expect(calls).toBe(0)
    expect(store.getSnapshot().runs[0]!.status).toBe('paused')
    await store.runTools()
    await until(store, (s) => s.runs[0]!.status === 'completed')
    expect(calls).toBe(1)
  })

  test('setFrontendTools swaps the map used at the next pause', async () => {
    const m = mockFetch((call) => (call.url.endsWith('/continue') ? continued('r1') : pausedWith('r1', [extTool])))
    const store = agentStore(m.fetch)
    store.setFrontendTools({ get_location: async () => 'late' })
    await store.send('hi')
    await until(store, (s) => s.runs[0]!.status === 'completed')
    expect(JSON.parse(bodyParam(m.calls[1]!, 'tools')!)[0].result).toBe('late')
  })
})
