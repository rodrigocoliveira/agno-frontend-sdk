import { describe, expect, test } from 'bun:test'
import { createAgnoApi } from '../src/client'
import { header, json, mockFetch, sse } from './helpers'

const base = 'http://agno.test'

describe('createAgnoApi', () => {
  test('os + agents + sessions build the right URLs', async () => {
    const m = mockFetch(() => json({}))
    const api = createAgnoApi({ baseUrl: base, fetch: m.fetch, params: { db_id: 'main' } })
    await api.os.health()
    await api.agents.get('a1')
    await api.agents.runs.list('a1', { session_id: 's', status: 'PAUSED' })
    await api.agents.runs.cancel('a1', 'r1', { session_id: 's' })
    await api.sessions.list({ type: 'agent', limit: 2 })
    await api.sessions.rename('s1', { session_name: 'n' })
    await api.sessions.runs('s1', { type: 'agent' })
    expect(m.calls.map((c) => `${c.init.method} ${c.url.slice(base.length)}`)).toEqual([
      'GET /health',
      'GET /agents/a1',
      'GET /agents/a1/runs?session_id=s&status=PAUSED',
      'POST /agents/a1/runs/r1/cancel?session_id=s',
      'GET /sessions?db_id=main&type=agent&limit=2',
      'POST /sessions/s1/rename?db_id=main',
      'GET /sessions/s1/runs?db_id=main&type=agent',
    ])
    expect(m.calls[5]!.init.body).toBe('{"session_name":"n"}')
  })

  test('a global param reaches a body field of the same name', async () => {
    const m = mockFetch(() => json({}))
    const api = createAgnoApi({ baseUrl: base, fetch: m.fetch, params: { user_id: 'u' } })
    await api.memories.create({ memory: 'm' })
    expect(m.calls[0]!.url).toBe(`${base}/memories`)
    expect(JSON.parse(m.calls[0]!.init.body as string)).toEqual({ user_id: 'u', memory: 'm' })
  })

  test('agents.runs.create streams multipart, stream:false returns json', async () => {
    const m = mockFetch((_, n) => (n === 1 ? sse(['data: {"event":"RunContent","content":"a"}\n\n']) : json({ run_id: 'r', status: 'COMPLETED' })))
    const api = createAgnoApi({ baseUrl: base, fetch: m.fetch })
    const events: unknown[] = []
    for await (const e of api.agents.runs.create('a1', { message: 'oi', session_id: 's' })) events.push(e)
    expect(events).toEqual([{ event: 'RunContent', content: 'a' }])
    expect(m.calls[0]!.init.body).toBeInstanceOf(FormData)
    expect((m.calls[0]!.init.body as FormData).get('message')).toBe('oi')

    const run = await api.agents.runs.create('a1', { message: 'oi', stream: false })
    expect(run.status).toBe('COMPLETED')
    expect(header(m.calls[1]!.init, 'accept')).toBe('application/json')
  })

  test('agents.runs.continue sends tools as a JSON string in a form body', async () => {
    const m = mockFetch(() => sse(['data: {"event":"RunCompleted"}\n\n']))
    const api = createAgnoApi({ baseUrl: base, fetch: m.fetch })
    for await (const _ of api.agents.runs.continue('a1', 'r1', { tools: [{ tool_call_id: 't', tool_name: 'x', confirmed: true }] })) { /* drain */ }
    const body = m.calls[0]!.init.body as URLSearchParams
    expect(body.get('tools')).toBe('[{"tool_call_id":"t","tool_name":"x","confirmed":true}]')
  })

  test('teams.runs.resume and workflows.runs.continue', async () => {
    const m = mockFetch(() => sse(['data: {"event":"subscribed","run_id":"r","status":"running","current_event_count":3}\n\n']))
    const api = createAgnoApi({ baseUrl: base, fetch: m.fetch })
    for await (const _ of api.teams.runs.resume('t1', 'r1', { last_event_index: 2 })) { /* drain */ }
    for await (const _ of api.workflows.runs.continue('w1', 'r1', { step_requirements: [] })) { /* drain */ }
    expect(m.calls[0]!.url).toBe(`${base}/teams/t1/runs/r1/resume`)
    expect((m.calls[0]!.init.body as URLSearchParams).get('last_event_index')).toBe('2')
    expect(m.calls[1]!.url).toBe(`${base}/workflows/w1/runs/r1/continue`)
  })

  test('sessions.media returns a Blob', async () => {
    const m = mockFetch(() => new Response(new Uint8Array([7]), { headers: { 'content-type': 'application/octet-stream' } }))
    const api = createAgnoApi({ baseUrl: base, fetch: m.fetch })
    const blob = await api.sessions.media('s', 'key')
    expect(blob).toBeInstanceOf(Blob)
  })

  test('escape hatch request() and stream()', async () => {
    const m = mockFetch((_, n) => (n === 1 ? json({ custom: 1 }) : sse(['data: {"x":1}\n\n'])))
    const api = createAgnoApi({ baseUrl: base, fetch: m.fetch, token: 't' })
    expect(await api.request<{ custom: number }>({ method: 'post', path: '/my/route', body: { a: 1 }, contentType: 'application/json', query: { q: 1 } })).toEqual({ custom: 1 })
    expect(m.calls[0]!.url).toBe(`${base}/my/route?q=1`)
    expect(header(m.calls[0]!.init, 'authorization')).toBe('Bearer t')
    const out = []
    for await (const e of api.stream<{ x: number }>({ method: 'post', path: '/my/stream' })) out.push(e)
    expect(out).toEqual([{ x: 1 }])
  })

  test('remaining groups build the right URLs', async () => {
    const m = mockFetch(() => json({}))
    const api = createAgnoApi({ baseUrl: base, fetch: m.fetch })
    await api.memories.list({ user_id: 'u' })
    await api.memories.topics()
    await api.memories.optimize({ user_id: 'u', apply: true })
    await api.learnings.deleteUser('u', { learning_type: 'x' })
    await api.knowledge.content.status('c1')
    await api.knowledge.remoteContent.create({ path: 's3://b', reader_id: 'r' } as any)
    await api.knowledge.sourceFiles('k', 's', { prefix: 'p' })
    await api.components.configs.setCurrent('c', 3, {})
    await api.schedules.trigger('sc')
    await api.approvals.resolve('ap', { decision: 'approve' } as any)
    await api.queue.get()
    await api.serviceAccounts.delete('sa')
    await api.registry.get({ resource_type: 'agent' })
    await api.evals.deleteMany({ eval_run_ids: ['e'] })
    await api.metrics.refreshStatus()
    await api.traces.search({ filter: {}, limit: 10 } as any)
    await api.databases.migrate('db', { target_version: '2' })
    expect(m.calls.map((c) => `${c.init.method} ${c.url.slice(base.length)}`)).toEqual([
      'GET /memories?user_id=u',
      'GET /memory_topics',
      'POST /optimize-memories',
      'DELETE /learnings/users/u?learning_type=x',
      'GET /knowledge/content/c1/status',
      'POST /knowledge/remote-content',
      'GET /knowledge/k/sources/s/files?prefix=p',
      'POST /components/c/configs/3/set-current',
      'POST /schedules/sc/trigger',
      'POST /approvals/ap/resolve',
      'GET /queue',
      'DELETE /service-accounts/sa',
      'GET /registry?resource_type=agent',
      'DELETE /eval-runs',
      'GET /metrics/refresh/status',
      'POST /traces/search',
      'POST /databases/db/migrate?target_version=2',
    ])
    expect(m.calls[5]!.init.body).toBeInstanceOf(URLSearchParams)
  })
})
