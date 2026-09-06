import { describe, expect, test } from 'bun:test'
import { iterateSSE, parseSSEBuffer } from '../src/sse'
import { createTransport } from '../src/transport'
import { AgnoApiError } from '../src/errors'
import { json, mockFetch, sse } from './helpers'

const collect = async <T,>(it: AsyncIterable<T>) => { const out: T[] = []; for await (const x of it) out.push(x); return out }

describe('parseSSEBuffer', () => {
  test('complete frame, ignores event:/id:/comments, returns remainder', () => {
    const frames: string[] = []
    const rest = parseSSEBuffer('event: RunContent\nid: 1\n: keep-alive\ndata: {"a":1}\n\ndata: {"b"', (d) => frames.push(d))
    expect(frames).toEqual(['{"a":1}'])
    expect(rest).toBe('data: {"b"')
  })
  test('multi-line data joined with \\n and CRLF normalised', () => {
    const frames: string[] = []
    parseSSEBuffer('data: line1\r\ndata: line2\r\n\r\n', (d) => frames.push(d))
    expect(frames).toEqual(['line1\nline2'])
  })
  test('frame without data is skipped', () => {
    const frames: string[] = []
    expect(parseSSEBuffer('event: ping\n\n', (d) => frames.push(d))).toBe('')
    expect(frames).toEqual([])
  })
})

describe('iterateSSE', () => {
  test('reassembles an event split across chunks and parses JSON', async () => {
    const res = sse(['data: {"event":"RunSta', 'rted","run_id":"r1"}\n\ndata: {"event":"RunContent","content":"oi"}\n\n'])
    const events = await collect(iterateSSE<any>(res.body!, { method: 'POST', path: '/x' }))
    expect(events.map((e) => e.event)).toEqual(['RunStarted', 'RunContent'])
  })
  test('skips malformed JSON frames', async () => {
    const res = sse(['data: {oops\n\ndata: {"event":"RunCompleted"}\n\n'])
    const events = await collect(iterateSSE<any>(res.body!, { method: 'POST', path: '/x' }))
    expect(events).toEqual([{ event: 'RunCompleted' }])
  })
  test('stream that errors mid-way → AgnoApiError status 0', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new TextEncoder().encode('data: {"event":"RunStarted"}\n\n')); queueMicrotask(() => c.error(new Error('socket hang up'))) },
    })
    const it = iterateSSE<any>(body, { method: 'POST', path: '/x' })
    expect((await it.next()).value).toEqual({ event: 'RunStarted' })
    const e = await it.next().catch((x) => x)
    expect(e).toBeInstanceOf(AgnoApiError)
    expect(e.status).toBe(0)
  })
})

describe('transport.stream', () => {
  const base = 'http://agno.test'

  test('yields parsed events with accept text/event-stream and form body', async () => {
    const m = mockFetch(() => sse(['data: {"event":"RunContent","content":"a"}\n\n', 'data: {"event":"RunCompleted"}\n\n']))
    const t = createTransport({ baseUrl: base, fetch: m.fetch })
    const events = await collect(t.stream<any>({ method: 'post', path: '/agents/a/runs/r/continue', body: { tools: [] }, contentType: 'application/x-www-form-urlencoded' }))
    expect(events.map((e) => e.event)).toEqual(['RunContent', 'RunCompleted'])
    expect(new Headers(m.calls[0]!.init.headers).get('accept')).toBe('text/event-stream')
    expect(m.calls[0]!.init.body).toBeInstanceOf(URLSearchParams)
  })

  test('pre-stream error throws on first await, after 401 refresh attempt', async () => {
    let refreshes = 0
    const m = mockFetch((_, n) => (n === 1 ? json({ detail: 'expired' }, 401) : json({ detail: 'no such agent' }, 404)))
    const t = createTransport({ baseUrl: base, fetch: m.fetch, token: 't', onTokenExpired: () => { refreshes++; return 'n' } })
    const it = t.stream({ method: 'post', path: '/agents/a/runs' })[Symbol.asyncIterator]()
    const e = await it.next().catch((x) => x)
    expect(e).toBeInstanceOf(AgnoApiError)
    expect(e.status).toBe(404)
    expect(refreshes).toBe(1)
  })

  test('mid-stream RunError is delivered as an event, iterable ends normally', async () => {
    const m = mockFetch(() => sse(['data: {"event":"RunError","error":"boom"}\n\n']))
    const events = await collect(createTransport({ baseUrl: base, fetch: m.fetch }).stream<any>({ method: 'post', path: '/x' }))
    expect(events).toEqual([{ event: 'RunError', error: 'boom' }])
  })

  test('abort propagates AbortError', async () => {
    const m = mockFetch(({ init }) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          if (init.signal!.aborted) return c.error(init.signal!.reason)
          init.signal!.addEventListener('abort', () => c.error(init.signal!.reason))
        },
      })
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    })
    const ctrl = new AbortController()
    const it = createTransport({ baseUrl: base, fetch: m.fetch }).stream({ method: 'post', path: '/x', signal: ctrl.signal })[Symbol.asyncIterator]()
    const p = it.next()
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
})
