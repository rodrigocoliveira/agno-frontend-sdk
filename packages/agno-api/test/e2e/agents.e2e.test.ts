import { expect, test } from 'bun:test'
import { AgnoApiError } from '../../src/errors'
import { api, drain, e2e, ids, uid } from './setup'

e2e('agents (live)', () => {
  test('list and get', async () => {
    const list = await api.agents.list()
    expect(Array.isArray(list)).toBe(true)
    const agent = await api.agents.get(ids.agent)
    expect(agent).toBeTruthy()
  })

  test('stream run: RunStarted → RunContent* → RunCompleted', async () => {
    const session_id = uid()
    const events = await drain(api.agents.runs.create(ids.agent, { message: 'Say hi in one word.', session_id }))
    expect(events[0]!.event).toBe('RunStarted')
    expect(events.at(-1)!.event).toBe('RunCompleted')
    expect(events.some((e) => e.event === 'RunContent')).toBe(true)
  })

  test('background run events carry event_index', async () => {
    const session_id = uid()
    const events = await drain(api.agents.runs.create(ids.agent, { message: 'Say hi.', session_id, background: true }))
    expect(events.length > 0).toBe(true)
    expect(events.every((e) => typeof (e as { event_index?: number }).event_index === 'number')).toBe(true)
  })

  test('non-stream run returns a RunOutput', async () => {
    const run = await api.agents.runs.create(ids.agent, { message: 'Say hi.', session_id: uid(), stream: false })
    expect(run.status).toBe('COMPLETED')
    expect(typeof run.run_id).toBe('string')
    const again = await api.agents.runs.get(ids.agent, run.run_id, { session_id: run.session_id! })
    expect(again.run_id).toBe(run.run_id)
  })

  test('HITL: RunPaused → continue with confirmed tool → RunCompleted', async () => {
    const session_id = uid()
    const events = await drain(api.agents.runs.create(ids.agent, { message: 'Use the tool that needs confirmation.', session_id }))
    const paused = events.find((e) => e.event === 'RunPaused')
    expect(paused, 'agent must pause on a requires_confirmation tool').toBeTruthy()
    if (paused?.event !== 'RunPaused') return
    const tools = (paused.tools ?? []).map((t) => ({ ...t, confirmed: true }))
    const done = await drain(api.agents.runs.continue(ids.agent, paused.run_id, { tools, session_id }))
    expect(done.at(-1)!.event).toBe('RunCompleted')
  })

  test('resume replays a finished run', async () => {
    const session_id = uid()
    const run = await api.agents.runs.create(ids.agent, { message: 'Say hi.', session_id, stream: false })
    const events = await drain(api.agents.runs.resume(ids.agent, run.run_id, { session_id }))
    expect(['replay', 'subscribed', 'catch_up']).toContain(events[0]!.event)
  })

  test('cancel a background run', async () => {
    const session_id = uid()
    const it = api.agents.runs.create(ids.agent, { message: 'Write a very long essay.', session_id, background: true }, { idempotencyKey: uid() })
    const first = await it[Symbol.asyncIterator]().next()
    const run_id = (first.value as { run_id: string }).run_id
    const out = await api.agents.runs.cancel(ids.agent, run_id, { session_id })
    expect(out).toBeTruthy()
  })

  test('404 → AgnoApiError with status', async () => {
    const e = await api.agents.get('does-not-exist').catch((x) => x)
    expect(e).toBeInstanceOf(AgnoApiError)
    expect(e.status).toBe(404)
  })
})
