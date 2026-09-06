import { expect, test } from 'bun:test'
import { api, e2e, ids, uid } from './setup'

e2e('sessions (live)', () => {
  test('run → list → get → rename → runs → delete', async () => {
    const session_id = uid()
    await api.agents.runs.create(ids.agent, { message: 'hi', session_id, stream: false })
    const list = await api.sessions.list({ type: 'agent', component_id: ids.agent })
    expect(JSON.stringify(list)).toContain(session_id)
    expect(await api.sessions.get(session_id, { type: 'agent' })).toBeTruthy()
    await api.sessions.rename(session_id, { session_name: 'renamed', type: 'agent' })
    const runs = await api.sessions.runs(session_id, { type: 'agent' })
    expect(Array.isArray(runs)).toBe(true)
    await api.sessions.delete(session_id)
    const e = await api.sessions.get(session_id, { type: 'agent' }).catch((x) => x)
    expect(e.status).toBe(404)
  })
})
