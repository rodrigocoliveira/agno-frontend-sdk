import { describe, expect, test } from 'bun:test'
import { createTransport } from '../src/transport'
import { AgnoApiError } from '../src/errors'
import { empty, header, json, mockFetch } from './helpers'

const base = 'http://agno.test'

describe('request: url, headers, body', () => {
  test('GET with query and bearer token', async () => {
    const m = mockFetch(() => json({ ok: true }))
    const t = createTransport({ baseUrl: base + '/', token: 'tok', fetch: m.fetch, headers: { 'x-app': '1' } })
    const out = await t.request({ method: 'get', path: '/sessions', query: { user_id: 'u', limit: 2 } })
    expect(out).toEqual({ ok: true })
    expect(m.calls[0]!.url).toBe(`${base}/sessions?user_id=u&limit=2`)
    expect(m.calls[0]!.init.method).toBe('GET')
    expect(header(m.calls[0]!.init, 'authorization')).toBe('Bearer tok')
    expect(header(m.calls[0]!.init, 'x-app')).toBe('1')
  })

  test('token function is read on every request', async () => {
    let n = 0
    const m = mockFetch(() => json({}))
    const t = createTransport({ baseUrl: base, token: () => `t${++n}`, fetch: m.fetch })
    await t.request({ method: 'get', path: '/health' })
    await t.request({ method: 'get', path: '/health' })
    expect(header(m.calls[0]!.init, 'authorization')).toBe('Bearer t1')
    expect(header(m.calls[1]!.init, 'authorization')).toBe('Bearer t2')
  })

  test('no token → no authorization header', async () => {
    const m = mockFetch(() => json({}))
    await createTransport({ baseUrl: base, fetch: m.fetch }).request({ method: 'get', path: '/health' })
    expect(header(m.calls[0]!.init, 'authorization')).toBeNull()
  })

  test('json body, per-call headers and idempotency key', async () => {
    const m = mockFetch(() => json({}))
    const t = createTransport({ baseUrl: base, fetch: m.fetch })
    await t.request({
      method: 'post', path: '/sessions', body: { session_name: 'x' }, contentType: 'application/json',
      headers: { 'x-trace': 'abc' }, idempotencyKey: 'k1',
    })
    expect(m.calls[0]!.init.body).toBe('{"session_name":"x"}')
    expect(header(m.calls[0]!.init, 'content-type')).toBe('application/json')
    expect(header(m.calls[0]!.init, 'x-trace')).toBe('abc')
    expect(header(m.calls[0]!.init, 'idempotency-key')).toBe('k1')
  })

  test('body with no contentType defaults to application/json', async () => {
    const m = mockFetch(() => json({}))
    const t = createTransport({ baseUrl: base, fetch: m.fetch })
    await t.request({ method: 'post', path: '/x', body: { a: 1 } })
    expect(m.calls[0]!.init.body).toBe(JSON.stringify({ a: 1 }))
    expect(header(m.calls[0]!.init, 'content-type')).toBe('application/json')
  })

  test('204 → undefined, octet-stream → Blob when response=blob', async () => {
    const m = mockFetch((_, n) => (n === 1 ? empty() : new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'application/octet-stream' } })))
    const t = createTransport({ baseUrl: base, fetch: m.fetch })
    expect(await t.request({ method: 'delete', path: '/sessions/s' })).toBeUndefined()
    const blob = await t.request<Blob>({ method: 'get', path: '/sessions/s/media/k', response: 'blob' })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBe(2)
  })

  test('passes AbortSignal and lets AbortError propagate', async () => {
    const m = mockFetch(({ init }) => new Promise((_, rej) => {
      if (init.signal!.aborted) return rej(init.signal!.reason) // real fetch rejects at once for an aborted signal
      init.signal!.addEventListener('abort', () => rej(init.signal!.reason))
    }))
    const t = createTransport({ baseUrl: base, fetch: m.fetch })
    const ctrl = new AbortController()
    const p = t.request({ method: 'get', path: '/health', signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('transport-owned headers override user-supplied variants', async () => {
    const m = mockFetch(() => json({}))
    const t = createTransport({ baseUrl: base, token: 'real', fetch: m.fetch, headers: { Authorization: 'Bearer user' } })
    await t.request({ method: 'post', path: '/x', body: { a: 1 }, contentType: 'application/json', headers: { 'Content-Type': 'text/plain', 'X-Extra': '1' } })
    expect(header(m.calls[0]!.init, 'authorization')).toBe('Bearer real')
    expect(header(m.calls[0]!.init, 'content-type')).toBe('text/plain')
    expect(header(m.calls[0]!.init, 'x-extra')).toBe('1')
  })
})

describe('request: errors', () => {
  test('non-2xx → AgnoApiError', async () => {
    const m = mockFetch(() => json({ detail: 'nope', error_id: 'x' }, 404))
    const t = createTransport({ baseUrl: base, fetch: m.fetch })
    const e = await t.request({ method: 'get', path: '/agents/a' }).catch((x) => x) as AgnoApiError
    expect(e).toBeInstanceOf(AgnoApiError)
    expect(e.status).toBe(404)
    expect(e.errorId).toBe('x')
    expect(e.path).toBe('/agents/a')
  })

  test('network failure → AgnoApiError status 0', async () => {
    const m = mockFetch(() => { throw new TypeError('fetch failed') })
    const e = await createTransport({ baseUrl: base, fetch: m.fetch }).request({ method: 'get', path: '/health' }).catch((x) => x) as AgnoApiError
    expect(e).toBeInstanceOf(AgnoApiError)
    expect(e.status).toBe(0)
  })
})

describe('request: 401 refresh', () => {
  test('without onTokenExpired → throws immediately', async () => {
    const m = mockFetch(() => json({ detail: 'expired' }, 401))
    const e = await createTransport({ baseUrl: base, token: 't', fetch: m.fetch }).request({ method: 'get', path: '/health' }).catch((x) => x) as AgnoApiError
    expect(e.status).toBe(401)
    expect(m.calls).toHaveLength(1)
  })

  test('onTokenExpired returning void → re-reads token() and retries once', async () => {
    let token = 'old'
    let refreshes = 0
    const m = mockFetch(({ init }) => (header(init, 'authorization') === 'Bearer new' ? json({ ok: 1 }) : json({ detail: 'expired' }, 401)))
    const t = createTransport({
      baseUrl: base, fetch: m.fetch, token: () => token,
      onTokenExpired: async () => { refreshes++; token = 'new' },
    })
    expect(await t.request<{ ok: number }>({ method: 'get', path: '/health' })).toEqual({ ok: 1 })
    expect(refreshes).toBe(1)
    expect(m.calls).toHaveLength(2)
  })

  test('onTokenExpired that yields the same token → original 401, no retry', async () => {
    // token() reports the same value before and after the refresh: the token that just got the 401
    // cannot make a retry succeed, so the original 401 surfaces without a second request.
    let refreshes = 0
    const m = mockFetch(() => json({ detail: 'expired' }, 401))
    const t = createTransport({ baseUrl: base, fetch: m.fetch, token: () => 'same', onTokenExpired: () => { refreshes++ } })
    const e = await t.request({ method: 'get', path: '/health' }).catch((x) => x) as AgnoApiError
    expect(e).toBeInstanceOf(AgnoApiError)
    expect(e.status).toBe(401)
    expect(e.detail).toBe('expired')
    expect(refreshes).toBe(1)
    expect(m.calls).toHaveLength(1)
  })

  test('onTokenExpired returning a string → used for the retry, but token() still wins on later requests', async () => {
    // token() keeps reporting the stale value even after the refresh — it wins over the
    // override on any request after the retry, since a defined `config.token` always wins.
    const m = mockFetch((_, n) => (n === 1 ? json({ detail: 'expired' }, 401) : json({})))
    const t = createTransport({ baseUrl: base, fetch: m.fetch, token: () => 'stale', onTokenExpired: () => 'fresh' })
    await t.request({ method: 'get', path: '/a' })
    await t.request({ method: 'get', path: '/b' })
    expect(m.calls.map((c) => header(c.init, 'authorization'))).toEqual(['Bearer stale', 'Bearer fresh', 'Bearer stale'])
  })

  test('onTokenExpired returning a string with no token() source → used for the retry only', async () => {
    const m = mockFetch((_, n) => (n === 1 ? json({ detail: 'expired' }, 401) : json({})))
    const t = createTransport({ baseUrl: base, fetch: m.fetch, onTokenExpired: () => 'fresh' })
    await t.request({ method: 'get', path: '/a' })
    await t.request({ method: 'get', path: '/b' })
    expect(m.calls.map((c) => header(c.init, 'authorization'))).toEqual([null, 'Bearer fresh', null])
  })

  test('a throwing onTokenExpired surfaces the original 401 as AgnoApiError with the refresh error as cause', async () => {
    const boom = new Error('no refresh token')
    const m = mockFetch(() => json({ detail: 'expired' }, 401))
    const t = createTransport({ baseUrl: base, fetch: m.fetch, token: 't', onTokenExpired: () => { throw boom } })
    const e = await t.request({ method: 'get', path: '/health' }).catch((x) => x) as AgnoApiError
    expect(e).toBeInstanceOf(AgnoApiError)
    expect(e.status).toBe(401)
    expect(e.detail).toBe('expired')
    expect(e.method).toBe('GET')
    expect(e.path).toBe('/health')
    expect(e.cause).toBe(boom)
    expect(m.calls).toHaveLength(1)
  })

  test('second 401 after refresh → throws, no loop', async () => {
    let refreshes = 0
    let token = 'old'
    const m = mockFetch(() => json({ detail: 'expired' }, 401))
    // The refresh really does hand back a different token, so the retry happens — and its 401 ends it.
    const t = createTransport({ baseUrl: base, fetch: m.fetch, token: () => token, onTokenExpired: () => { refreshes++; token = 'new' } })
    const e = await t.request({ method: 'get', path: '/health' }).catch((x) => x) as AgnoApiError
    expect(e.status).toBe(401)
    expect(refreshes).toBe(1)
    expect(m.calls).toHaveLength(2)
  })

  test('concurrent 401s share one refresh', async () => {
    let token = 'old'
    let refreshes = 0
    const m = mockFetch(({ init }) => (header(init, 'authorization') === 'Bearer new' ? json({}) : json({ detail: 'expired' }, 401)))
    const t = createTransport({
      baseUrl: base, fetch: m.fetch, token: () => token,
      onTokenExpired: async () => { refreshes++; await new Promise((r) => setTimeout(r, 10)); token = 'new' },
    })
    await Promise.all([1, 2, 3, 4, 5].map((i) => t.request({ method: 'get', path: `/r${i}` })))
    expect(refreshes).toBe(1)
    expect(m.calls).toHaveLength(10)
  })

  test('401 with a token that already changed → retries without calling onTokenExpired', async () => {
    let token = 'old'
    let refreshes = 0
    const m = mockFetch(({ init }) => {
      if (header(init, 'authorization') === 'Bearer old') { token = 'new'; return json({ detail: 'expired' }, 401) }
      return json({})
    })
    const t = createTransport({ baseUrl: base, fetch: m.fetch, token: () => token, onTokenExpired: () => { refreshes++ } })
    await t.request({ method: 'get', path: '/health' })
    expect(refreshes).toBe(0)
    expect(m.calls).toHaveLength(2)
  })

  test('multipart body is rebuilt for the retry', async () => {
    const m = mockFetch((_, n) => (n === 1 ? json({ detail: 'expired' }, 401) : json({})))
    const t = createTransport({ baseUrl: base, fetch: m.fetch, token: 't', onTokenExpired: () => 'n' })
    await t.request({ method: 'post', path: '/agents/a/runs', body: { message: 'oi' }, contentType: 'multipart/form-data' })
    const [b1, b2] = m.calls.map((c) => c.init.body as FormData)
    expect(b1).not.toBe(b2)
    expect(b2!.get('message')).toBe('oi')
  })

  test('a synchronously throwing onTokenExpired does not poison later refreshes', async () => {
    let attempts = 0
    let token = 'old'
    const m = mockFetch(({ init }) => (header(init, 'authorization') === 'Bearer new' ? json({}) : json({ detail: 'expired' }, 401)))
    const t = createTransport({
      baseUrl: base, fetch: m.fetch, token: () => token,
      onTokenExpired: () => { attempts++; if (attempts === 1) throw new Error('no refresh token'); token = 'new' },
    })
    const e = await t.request({ method: 'get', path: '/a' }).catch((x) => x) as AgnoApiError
    expect(e.status).toBe(401)
    expect((e.cause as Error).message).toBe('no refresh token')
    expect(await t.request<Record<string, never>>({ method: 'get', path: '/b' })).toEqual({})
    expect(attempts).toBe(2)
  })
})
