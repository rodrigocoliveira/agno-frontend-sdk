import { describe, expect, mock, test } from 'bun:test'
import { route, streamOnlyRoute, streamRoute, type RouteContext } from '../src/route'
import type { ResolvedRequest, Transport } from '../src/transport'

function ctx(params: Record<string, string> = {}) {
  const calls: { kind: 'request' | 'stream'; req: ResolvedRequest }[] = []
  const transport: Transport = {
    request: mock(async (req: ResolvedRequest) => { calls.push({ kind: 'request', req }); return { ok: true } }) as any,
    stream: mock(async function* (req: ResolvedRequest) { calls.push({ kind: 'stream', req }); yield { event: 'RunStarted' } }) as any,
  }
  return { ctx: { transport, params } as RouteContext, calls }
}

describe('route()', () => {
  test('no input: (pathArgs, options?)', async () => {
    const { ctx: c, calls } = ctx()
    const get = route(c, 'get', '/agents/{agent_id}')
    await get('a1', { signal: AbortSignal.timeout(1000) })
    expect(calls[0]!.req).toMatchObject({ method: 'get', path: '/agents/a1', query: {}, body: undefined, contentType: null, response: 'json' })
    expect(calls[0]!.req.signal).toBeInstanceOf(AbortSignal)
  })

  test('query input + globals + options', async () => {
    const { ctx: c, calls } = ctx({ db_id: 'main', user_id: 'u' })
    const list = route(c, 'get', '/sessions')
    await list({ type: 'agent', limit: 5 }, { headers: { 'x-a': '1' } })
    expect(calls[0]!.req.query).toEqual({ db_id: 'main', user_id: 'u', type: 'agent', limit: 5 })
    expect(calls[0]!.req.headers).toEqual({ 'x-a': '1' })
  })

  test('optional input skipped with undefined', async () => {
    const { ctx: c, calls } = ctx()
    await route(c, 'get', '/sessions')(undefined, { idempotencyKey: 'k' })
    expect(calls[0]!.req.query).toEqual({})
    expect(calls[0]!.req.idempotencyKey).toBe('k')
  })

  test('query + json body split, path args encoded', async () => {
    const { ctx: c, calls } = ctx({ db_id: 'main' })
    await route(c, 'post', '/sessions/{session_id}/rename')('s 1', { session_name: 'x', user_id: 'u' })
    expect(calls[0]!.req).toMatchObject({
      method: 'post', path: '/sessions/s%201/rename',
      query: { db_id: 'main', user_id: 'u' }, body: { session_name: 'x' }, contentType: 'application/json',
    })
  })

  test('blob response option', async () => {
    const { ctx: c, calls } = ctx()
    await route(c, 'get', '/sessions/{session_id}/media/{storage_key}', { response: 'blob' })('s', 'k')
    expect(calls[0]!.req.response).toBe('blob')
  })

  test('exposes route info and rejects unknown routes', () => {
    const { ctx: c } = ctx()
    expect(route(c, 'get', '/health').route).toEqual({ method: 'get', path: '/health' })
    expect(() => route(c, 'get', '/nope' as any)).toThrow(/unknown route/i)
  })
})

describe('streamRoute()', () => {
  test('default streams via transport.stream with form body', async () => {
    const { ctx: c, calls } = ctx()
    const create = streamRoute<{ message: string; stream?: boolean }, { run_id: string }, { event: string }>()(c, '/agents/{agent_id}/runs')
    const events = []
    for await (const e of create('a1', { message: 'oi' })) events.push(e)
    expect(events).toEqual([{ event: 'RunStarted' }])
    expect(calls[0]!.req).toMatchObject({ method: 'post', path: '/agents/a1/runs', body: { message: 'oi' }, contentType: 'multipart/form-data' })
    expect(calls[0]!.kind).toBe('stream')
  })

  test('stream: false goes through transport.request', async () => {
    const { ctx: c, calls } = ctx()
    const create = streamRoute<{ message: string; stream?: boolean }, { ok: boolean }, never>()(c, '/agents/{agent_id}/runs')
    const out = await create('a1', { message: 'oi', stream: false })
    expect(out).toEqual({ ok: true })
    expect(calls[0]!.kind).toBe('request')
    expect(calls[0]!.req.body).toEqual({ message: 'oi', stream: false })
  })

  test('streamOnlyRoute always streams, input optional', async () => {
    const { ctx: c, calls } = ctx()
    const resume = streamOnlyRoute<{ last_event_index?: number }, { event: string }>()(c, '/agents/{agent_id}/runs/{run_id}/resume')
    for await (const _ of resume('a', 'r')) { /* drain */ }
    expect(calls[0]!.kind).toBe('stream')
    expect(calls[0]!.req.path).toBe('/agents/a/runs/r/resume')
  })

  test('stream helpers expose route info', () => {
    const { ctx: c } = ctx()
    expect(streamRoute<{ stream?: boolean }, unknown, unknown>()(c, '/agents/{agent_id}/runs').route).toEqual({ method: 'post', path: '/agents/{agent_id}/runs' })
    expect(streamOnlyRoute<unknown, unknown>()(c, '/agents/{agent_id}/runs/{run_id}/resume').route).toEqual({ method: 'post', path: '/agents/{agent_id}/runs/{run_id}/resume' })
  })
})
