import { describe, expect, test } from 'bun:test'
import { createAgnoApi } from '@rodrigocoliveira/agno-api'
import { confirm, provideUserFeedback } from '../../src/run/hitl'
import { createAgnoStore } from '../../src/store/store'
import { until } from '../store/helpers'

const url = process.env.AGNO_URL
const e2e = url ? describe : describe.skip
const api = createAgnoApi({ baseUrl: url ?? 'http://unused', token: process.env.AGNO_TOKEN })
const ids = { agent: 'test-agent', team: 'test-team', workflow: 'test-workflow', workflowHitl: 'test-workflow-hitl' }
const uid = () => `hooks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const agent = (sessionId?: string, frontendTools?: Record<string, () => Promise<unknown>>) =>
  createAgnoStore({ api, target: { kind: 'agent', id: ids.agent }, sessionId, frontendTools })

e2e('agno-hooks store (live)', () => {
  test('send → completed; a fresh store hydrates the same run', async () => {
    const s = agent()
    await s.send('hello there')
    const a = s.getSnapshot()
    expect(a.runs[0]).toMatchObject({ status: 'completed', content: 'Echo: hello there ', input: { message: 'hello there' } })
    expect(a.sessionId).toBeTruthy()
    const reloaded = agent(a.sessionId!)
    const h = await until(reloaded, (x) => x.status === 'ready')
    expect(h.runs.map((r) => [r.id, r.status, r.content, r.input.message])).toEqual(a.runs.map((r) => [r.id, r.status, r.content, r.input.message]))
    s.destroy(); reloaded.destroy()
  })

  test('confirmation: pause → continue(confirm) → completed, answer persisted', async () => {
    const s = agent(uid())
    await until(s, (x) => x.status === 'ready')
    await s.send('Use the tool that needs confirmation.')
    const p = s.getSnapshot().pending!
    expect(p.tools[0]).toMatchObject({ tool_name: 'add_one', requires_confirmation: true })
    await s.continue([confirm(p.tools[0]!)])
    expect(s.getSnapshot().runs[0]!.status).toBe('completed')
    const reloaded = agent(s.getSnapshot().sessionId!)
    const h = await until(reloaded, (x) => x.status === 'ready')
    expect(h.runs[0]!.tools.find((t) => t.tool_name === 'add_one')).toMatchObject({ confirmed: true, result: '42' })
    s.destroy(); reloaded.destroy()
  })

  test('ask_user: user_feedback_schema → provideUserFeedback → selected_options persisted', async () => {
    const s = agent(uid())
    await until(s, (x) => x.status === 'ready')
    await s.send('please ask me')
    const t = s.getSnapshot().pending!.tools[0]!
    expect(t.tool_name).toBe('ask_user')
    expect(t.user_feedback_schema![0]!.options!.map((o) => o.label)).toEqual(['Trail', 'Road'])
    await s.continue([provideUserFeedback(t, { 'Where do you run?': ['Trail'] })])
    const done = s.getSnapshot().runs[0]!
    expect(done.status).toBe('completed')
    expect(done.tools[0]!.user_feedback_schema![0]!.selected_options).toEqual(['Trail'])
    const reloaded = agent(done.sessionId!)
    const h = await until(reloaded, (x) => x.status === 'ready')
    expect(h.runs[0]!.tools[0]!.user_feedback_schema![0]!.selected_options).toEqual(['Trail'])
    s.destroy(); reloaded.destroy()
  })

  test('frontend tool: executed by the map, continued automatically', async () => {
    const s = agent(uid(), { get_location: async () => ({ lat: -23.5, lng: -46.6 }) })
    await until(s, (x) => x.status === 'ready')
    await s.send('locate me')
    await until(s, (x) => x.runs[0]!.status === 'completed')
    expect(s.getSnapshot().pending).toBeNull()
    expect(s.getSnapshot().runs[0]!.tools.find((t) => t.tool_name === 'get_location')!.result).toBe('{"lat":-23.5,"lng":-46.6}')
    s.destroy()
  })

  test('reload while streaming: the new store reattaches and ends with the full content', async () => {
    const s = agent(uid())
    await until(s, (x) => x.status === 'ready')
    const p = s.send('one two three four five six seven eight nine ten')
    await until(s, (x) => x.runs[0]!.id.startsWith('local-') === false)
    s.destroy()
    await p
    const fresh = agent(s.getSnapshot().sessionId!)
    const h = await until(fresh, (x) => x.status === 'ready' && x.runs[0]?.status === 'completed', 10000)
    expect(h.runs[0]!.content).toBe('Echo: one two three four five six seven eight nine ten ')
    fresh.destroy()
  })

  test('team: members are streamed; a member pause is continued through requirements', async () => {
    const t = createAgnoStore({ api, target: { kind: 'team', id: ids.team }, sessionId: uid() })
    await until(t, (x) => x.status === 'ready')
    await t.send('hi team')
    const r = t.getSnapshot().runs[0]!
    expect(r.status).toBe('completed')
    expect(r.members[0]).toMatchObject({ status: 'completed', content: 'Echo: hi team ' })

    const h = createAgnoStore({ api, target: { kind: 'team', id: ids.team }, sessionId: uid() })
    await until(h, (x) => x.status === 'ready')
    await h.send('Use the tool that needs confirmation.')
    const pending = h.getSnapshot().pending!
    expect(pending.tools[0]!.tool_name).toBe('add_one')
    await h.continue([confirm(pending.tools[0]!)])
    expect(h.getSnapshot().runs[0]!.status).toBe('completed')
    const reloaded = createAgnoStore({ api, target: { kind: 'team', id: ids.team }, sessionId: h.getSnapshot().sessionId })
    const back = await until(reloaded, (x) => x.status === 'ready')
    expect(back.runs[0]!.members).toHaveLength(1)
    t.destroy(); h.destroy(); reloaded.destroy()
  })

  test('workflow: steps; HITL step confirmed through step_requirements', async () => {
    const w = createAgnoStore({ api, target: { kind: 'workflow', id: ids.workflow }, sessionId: uid() })
    await until(w, (x) => x.status === 'ready')
    await w.send('hi wf')
    expect(w.getSnapshot().runs[0]!.steps[0]).toMatchObject({ name: 'echo', status: 'completed', content: 'Echo: hi wf ' })

    const h = createAgnoStore({ api, target: { kind: 'workflow', id: ids.workflowHitl }, sessionId: uid() })
    await until(h, (x) => x.status === 'ready')
    await h.send('hi hitl')
    const p = h.getSnapshot().pending!
    expect(h.getSnapshot().runs[0]!.pauseKind).toBe('step')
    expect(p.stepRequirements.at(-1)).toMatchObject({ step_name: 'echo', requires_confirmation: true })
    await h.continue([{ ...p.stepRequirements.at(-1)!, confirmed: true }])
    expect(h.getSnapshot().runs[0]!.status).toBe('completed')
    w.destroy(); h.destroy()
  })
})
