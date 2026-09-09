import { describe, expect, test } from 'bun:test'
import { createAgnoStore } from '../../src/store/store'
import type { AnyEvent } from '../../src/types'
import { apiWith, bodyParam, deferred, frames, json, mockFetch, openSse, until, wait } from './helpers'

const started = (run_id: string, session_id = 's1', i = 0): AnyEvent => ({ event: 'RunStarted', run_id, session_id, agent_id: 'a', event_index: i })
const content = (run_id: string, text: string, i: number): AnyEvent => ({ event: 'RunContent', run_id, content: text, content_type: 'str', event_index: i })
const completed = (run_id: string, text: string, i: number): AnyEvent => ({ event: 'RunCompleted', run_id, content: text, event_index: i })
const agentStore = (fetchFn: typeof fetch, over: Partial<Parameters<typeof createAgnoStore>[0]> = {}) =>
  createAgnoStore({ api: apiWith(fetchFn), target: { kind: 'agent', id: 'a' }, retryDelays: [1, 1, 1], ...over })

describe('hydrate', () => {
  test('loads rows oldest first and resumes the running one', async () => {
    const live = openSse()
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([
        { run_id: 'r2', agent_id: 'a', status: 'RUNNING', run_input: 'second', content: 'par', created_at: '2026-01-01T00:00:02Z' },
        { run_id: 'r1', agent_id: 'a', status: 'COMPLETED', run_input: 'first', content: 'done', created_at: '2026-01-01T00:00:01Z' },
      ])
      if (call.url.endsWith('/runs/r2/resume')) return live.response
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    expect(store.getSnapshot().status).toBe('loading')
    const s = await until(store, (s) => s.status === 'ready')
    expect(s.runs.map((r) => [r.id, r.status, r.input.message])).toEqual([['r1', 'completed', 'first'], ['r2', 'running', 'second']])
    expect(s.isBusy).toBe(false) // reattached runs never block send
    await until(store, () => m.calls.some((c) => c.url.endsWith('/runs/r2/resume')))
    expect(bodyParam(m.calls.at(-1)!, 'last_event_index')).toBeNull()
    live.push(started('r2')); live.push(content('r2', 'partial ', 1)); live.push(content('r2', 'text', 2)); live.push(completed('r2', 'partial text', 3)); live.close()
    const done = await until(store, (s) => s.runs[1]!.status === 'completed')
    expect(done.runs[1]!.content).toBe('partial text')
    expect(done.runs[1]!.eventIndex).toBe(3)
    expect(done.runs[0]).toBe(s.runs[0]) // untouched run keeps its reference
  })

  test('a reattach without last_event_index replays from zero onto an empty run, not onto the row', async () => {
    const live = openSse()
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([
        { run_id: 'r1', agent_id: 'a', status: 'RUNNING', run_input: 'one two three', content: 'Echo: one two' },
      ])
      if (call.url.endsWith('/runs/r1/resume')) return live.response
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await until(store, (s) => s.status === 'ready')
    expect(store.getSnapshot().runs[0]!.content).toBe('Echo: one two')
    await until(store, () => m.calls.some((c) => c.url.endsWith('/runs/r1/resume')))
    expect(bodyParam(m.calls.at(-1)!, 'last_event_index')).toBeNull()
    live.push(started('r1'))
    live.push(content('r1', 'Echo: ', 1))
    live.push(content('r1', 'one two ', 2))
    live.push(content('r1', 'three', 3))
    // Mid-replay: the row's partial content was replaced by the replay, not appended to.
    const mid = await until(store, (s) => s.runs[0]!.eventIndex === 3)
    expect(mid.runs[0]!.content).toBe('Echo: one two three')
    live.push(completed('r1', 'Echo: one two three', 4))
    live.close()
    const done = await until(store, (s) => s.runs[0]!.status === 'completed')
    expect(done.runs[0]!.content).toBe('Echo: one two three')
    expect(done.runs[0]!.input.message).toBe('one two three')
  })

  test('paused row is refetched through runs.get to recover requirements', async () => {
    const t = { tool_call_id: 'c1', tool_name: 'add_one', tool_args: {}, requires_confirmation: true }
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([{ run_id: 'r1', agent_id: 'a', status: 'PAUSED', run_input: 'what is around me', tools: [t] }])
      // The single-run GET endpoint's real shape: no `run_input`, input nested as agno's `RunInput`
      // dataclass (`{ input_content }`) instead of a flat string.
      if (call.url.includes('/agents/a/runs/r1')) return json({ run_id: 'r1', agent_id: 'a', status: 'PAUSED', input: { input_content: 'what is around me' }, tools: [t], requirements: [{ id: 'q', tool_execution: t }] })
      throw new Error('unexpected ' + call.url)
    })
    const s = await until(agentStore(m.fetch, { sessionId: 's1' }), (s) => s.status === 'ready')
    expect(s.runs[0]!.requirements![0]!.id).toBe('q')
    expect(s.runs[0]!.input.message).toBe('what is around me')
    expect(s.pending).toEqual({ runId: 'r1', tools: [t] })
    expect(s.isBusy).toBe(true)
  })

  test('a 404 for a session with no runs is empty; any other 404 is an error', async () => {
    const m404 = (detail: string) => mockFetch(() => json({ detail }, 404))
    const empty = await until(agentStore(m404('Session not found or has no runs').fetch, { sessionId: 's1' }), (s) => s.status === 'ready')
    expect(empty.runs).toEqual([])
    expect(empty.error).toBeNull()
    const bad = await until(agentStore(m404('Not Found').fetch, { sessionId: 's1' }), (s) => s.status === 'error')
    expect(bad.error?.message).toBe('Not Found')
  })

  test('a failing paused-row refetch keeps the row instead of failing the whole session', async () => {
    const t = { tool_call_id: 'c1', tool_name: 'add_one', tool_args: {}, requires_confirmation: true }
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([
        { run_id: 'r1', agent_id: 'a', status: 'COMPLETED', content: 'fine', created_at: 1 },
        { run_id: 'r2', agent_id: 'a', status: 'PAUSED', tools: [t], created_at: 2 },
      ])
      if (call.url.includes('/agents/a/runs/r2')) return json({ detail: 'pruned' }, 500)
      throw new Error('unexpected ' + call.url)
    })
    const s = await until(agentStore(m.fetch, { sessionId: 's1' }), (s) => s.status === 'ready')
    expect(s.error).toBeNull()
    expect(s.runs.map((r) => [r.id, r.status])).toEqual([['r1', 'completed'], ['r2', 'paused']])
    expect(s.pending).toEqual({ runId: 'r2', tools: [t] })
  })

  test('team rows are grouped; sessionless store is ready immediately; hydrate failure is exposed', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([
        { run_id: 'm1', agent_id: 'a', parent_run_id: 't1', status: 'COMPLETED', content: 'member' },
        { run_id: 't1', team_id: 'team', status: 'COMPLETED', content: 'leader' },
      ])
      return json({ detail: 'nope' }, 500)
    })
    const team = createAgnoStore({ api: apiWith(m.fetch), target: { kind: 'team', id: 'team' }, sessionId: 's1' })
    const s = await until(team, (s) => s.status === 'ready')
    expect(s.runs).toHaveLength(1)
    expect(s.runs[0]!.members[0]!.content).toBe('member')

    expect(agentStore(m.fetch).getSnapshot()).toMatchObject({ status: 'ready', runs: [], sessionId: null })

    const bad = agentStore(m.fetch, { sessionId: 'broken' })
    const e = await until(bad, (s) => s.status === 'error')
    expect(e.error?.message).toContain('nope')
  })
})

describe('sessionState (read)', () => {
  test('hydrate busca session_state via sessions.get em paralelo com os runs', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') return json({ session_id: 's1', session_state: { count: 1 } })
      throw new Error('unexpected ' + call.url)
    })
    const s = await until(agentStore(m.fetch, { sessionId: 's1' }), (s) => s.status === 'ready' && s.sessionState !== null)
    expect(s.sessionState).toEqual({ count: 1 })
  })

  test('sem sessionId, sessionState fica null e sessions.get não é chamado', async () => {
    const m = mockFetch(() => json({}, 404))
    const s = agentStore(m.fetch).getSnapshot()
    expect(s.sessionState).toBeNull()
    expect(m.calls).toHaveLength(0)
  })

  test('sessions.get falhando não quebra o hydrate; sessionState fica null', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') return json({ detail: 'boom' }, 500)
      throw new Error('unexpected ' + call.url)
    })
    const s = await until(agentStore(m.fetch, { sessionId: 's1' }), (s) => s.status === 'ready')
    expect(s.sessionState).toBeNull()
    expect(s.error).toBeNull()
  })

  test('evento terminal de run com session_state atualiza o snapshot', async () => {
    const withState = (run_id: string, text: string, i: number, session_state: Record<string, unknown>): AnyEvent =>
      ({ event: 'RunCompleted', run_id, content: text, event_index: i, session_state })
    const m = mockFetch(() => frames([started('r1', 's9'), withState('r1', 'hello', 1, { count: 5 })]))
    const store = agentStore(m.fetch)
    await store.send('hi')
    expect(store.getSnapshot().sessionState).toEqual({ count: 5 })
  })

  test('an event-driven update wins over a slower, stale hydrate() fetch', async () => {
    const withState = (run_id: string, text: string, i: number, session_state: Record<string, unknown>): AnyEvent =>
      ({ event: 'RunCompleted', run_id, content: text, event_index: i, session_state })
    // hydrate()'s sessions.get is held open by this gate, so it is still in flight — provably, not just
    // probably — while the run below completes with the fresh, authoritative POST-run state.
    const gate = deferred()
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET')
        return gate.promise.then(() => json({ session_id: 's1', session_state: { count: 1 } }))
      if (call.url.endsWith('/agents/a/runs')) return frames([started('r1', 's1'), withState('r1', 'hi', 1, { count: 5 })])
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await until(store, (s) => s.status === 'ready')
    expect(store.getSnapshot().sessionState).toBeNull() // the seed fetch has not answered yet
    await store.send('hi')
    expect(store.getSnapshot().sessionState).toEqual({ count: 5 })
    // Only now does the stale hydrate() response arrive; it must not clobber the event-driven value.
    gate.release()
    await wait(5)
    expect(store.getSnapshot().sessionState).toEqual({ count: 5 })
  })
})

describe('send', () => {
  test('optimistic run, id swap, session learned, background by default', async () => {
    const m = mockFetch(() => frames([started('r1', 's9'), content('r1', 'hel', 1), content('r1', 'lo', 2), completed('r1', 'hello', 3)]))
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    const optimistic = store.getSnapshot()
    expect(optimistic.runs[0]).toMatchObject({ id: 'local-1', status: 'running', local: true, input: { message: 'hi' } })
    expect(optimistic.isBusy).toBe(true)
    await expect(store.send('again')).rejects.toThrow('A run is already active')
    await p
    const s = store.getSnapshot()
    expect(s.runs[0]).toMatchObject({ id: 'r1', status: 'completed', content: 'hello', eventIndex: 3 })
    expect(s.sessionId).toBe('s9')
    expect(s.isBusy).toBe(false)
    const call = m.calls[0]!
    expect(call.url).toContain('/agents/a/runs')
    expect(bodyParam(call, 'message')).toBe('hi')
    expect(bodyParam(call, 'background')).toBe('true')
    expect(bodyParam(call, 'stream')).toBe('true')
    expect(bodyParam(call, 'session_id')).toBeNull()
  })

  test('full input passes through; existing session id is sent', async () => {
    const m = mockFetch((call) => (call.url.includes('/sessions/') ? json([]) : frames([started('r1'), completed('r1', 'ok', 1)])))
    const store = agentStore(m.fetch, { sessionId: 's1', background: false })
    await until(store, (s) => s.status === 'ready')
    await store.send({ message: 'with file', files: [new File(['x'], 'a.txt')], user_id: 'u1' })
    const call = m.calls.at(-1)!
    expect(bodyParam(call, 'session_id')).toBe('s1')
    expect(bodyParam(call, 'user_id')).toBe('u1')
    expect(bodyParam(call, 'background')).toBe('false')
    expect((call.init.body as FormData).get('files')).toBeInstanceOf(File)
    expect(store.getSnapshot().runs[0]!.input.files).toHaveLength(1)
  })

  test('a failed settle GET marks the run as an error instead of leaving it running', async () => {
    const live = openSse()
    const m = mockFetch((call) => {
      if (call.url.endsWith('/agents/a/runs')) return live.response
      if (call.url.includes('/agents/a/runs/r1')) return json({ detail: 'db down' }, 503)
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    await until(store, () => m.calls.length === 1)
    live.push(started('r1')); live.close() // clean end while still running → settle GET → 503
    await p
    expect(store.getSnapshot().runs[0]).toMatchObject({ id: 'r1', status: 'error', error: expect.stringContaining('db down') })
    expect(store.getSnapshot().isBusy).toBe(false)
  })

  test('a stream that closes before RunStarted ends the local run as an error, not stuck running', async () => {
    const empty = openSse()
    const m = mockFetch(() => empty.response)
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    await until(store, () => m.calls.length === 1)
    empty.close()
    await p
    expect(store.getSnapshot().runs[0]).toMatchObject({ id: 'local-1', status: 'error', error: 'Stream ended before the run started' })
    expect(store.getSnapshot().isBusy).toBe(false)
    expect(m.calls).toHaveLength(1) // no settle GET, no resume for a run without an id
  })

  test('HTTP error before the stream opens → run error, no resume', async () => {
    const m = mockFetch(() => json({ detail: 'Agent not found' }, 404))
    const store = agentStore(m.fetch)
    await store.send('hi')
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'error', error: expect.stringContaining('Agent not found') })
    expect(m.calls).toHaveLength(1)
  })

  test('connection drop → resume with last_event_index; foreground run just errors', async () => {
    const first = openSse()
    const m = mockFetch((call) => {
      if (call.url.endsWith('/agents/a/runs')) return first.response
      if (call.url.endsWith('/runs/r1/resume')) return frames([content('r1', 'lo', 2), completed('r1', 'hello', 3)])
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    await until(store, () => m.calls.length === 1)
    first.push(started('r1', 's1', 0)); first.push(content('r1', 'hel', 1))
    await until(store, (s) => s.runs[0]!.eventIndex === 1) // ctrl.error() resets the queue: let both frames be read first
    first.drop()
    await p
    expect(bodyParam(m.calls[1]!, 'last_event_index')).toBe('1')
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'completed', content: 'hello' })

    const fg = openSse()
    const m2 = mockFetch(() => fg.response)
    const store2 = agentStore(m2.fetch, { background: false })
    const p2 = store2.send('hi')
    await until(store2, () => m2.calls.length === 1)
    fg.push(started('r1')); fg.drop()
    await p2
    expect(store2.getSnapshot().runs[0]).toMatchObject({ status: 'error', error: 'Connection lost' })
    expect(m2.calls).toHaveLength(1)
  })

  test('gives up after 3 resumes; resume(runId) retries manually', async () => {
    const first = openSse()
    let resumes = 0
    const m = mockFetch((call) => {
      if (call.url.endsWith('/agents/a/runs')) return first.response
      if (call.url.endsWith('/runs/r1/resume')) {
        resumes++
        if (resumes > 3) return frames([completed('r1', 'late', 5)])
        const dead = openSse(); dead.drop(); return dead.response   // errors on first read → a drop
      }
      throw new Error('unexpected')
    })
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    await until(store, () => m.calls.length === 1)
    first.push(started('r1'))
    await until(store, (s) => s.runs[0]!.id === 'r1') // same: the id swap must land before the drop
    first.drop()
    await p
    expect(resumes).toBe(3)
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'error', error: 'Connection lost' })
    await store.resume('r1')
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'completed', content: 'late' })
  })

  test('rejects while the session is still loading', async () => {
    const m = mockFetch(async (call) => {
      if (call.url.includes('/sessions/s1/runs')) { await wait(30); return json([]) }
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await expect(store.send('hi')).rejects.toThrow('Session is still loading')
    await until(store, (s) => s.status === 'ready')
    expect(store.getSnapshot().runs).toHaveLength(0)
  })
})

describe('settle from the run row', () => {
  // A background workflow that pauses closes its stream before `WorkflowPaused` is published; the same
  // shape is reproduced here with an agent stream that ends right after `RunStarted`.
  test('a stream ending on a still-running run takes the row, keeping local, input and cancellability', async () => {
    const tool = { tool_call_id: 'c1', tool_name: 'add_one', tool_args: { x: 41 }, requires_confirmation: true }
    const m = mockFetch((call) => {
      if (call.url.includes('/cancel')) return json({ ok: true })
      if (call.url.endsWith('/agents/a/runs')) return frames([started('r1')])
      // Real single-run GET shape (no `run_input`); irrelevant to this test since settleFromRow keeps
      // the run's own local `input`, but kept realistic anyway.
      if (call.url.includes('/agents/a/runs/r1')) return json({ run_id: 'r1', agent_id: 'a', status: 'PAUSED', input: { input_content: 'ignored' }, tools: [tool], requirements: [{ id: 'q', tool_execution: tool }] })
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch)
    await store.send('hi')
    const s = store.getSnapshot()
    expect(s.runs[0]).toMatchObject({ id: 'r1', status: 'paused', local: true, input: { message: 'hi' } })
    expect(s.pending).toMatchObject({ runId: 'r1', tools: [tool] })
    await store.cancel()
    expect(m.calls.at(-1)!.url).toContain('/agents/a/runs/r1/cancel')
  })
})

describe('cancel / destroy / subscribe', () => {
  test('cancel posts to the cancel route and the RunCancelled event lands', async () => {
    const live = openSse()
    const m = mockFetch((call) => (call.url.includes('/cancel') ? json({ ok: true }) : live.response))
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    await until(store, () => m.calls.length === 1)
    live.push(started('r1'))
    await until(store, (s) => s.runs[0]!.id === 'r1')
    await store.cancel()
    expect(m.calls.at(-1)!.url).toContain('/agents/a/runs/r1/cancel')
    live.push({ event: 'RunCancelled', run_id: 'r1', reason: 'user', event_index: 1 }); live.close()
    await p
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'cancelled', error: 'user' })
  })

  test('a failed cancel request lands in run.error and never rejects', async () => {
    const live = openSse()
    const m = mockFetch((call) => (call.url.includes('/cancel') ? json({ detail: 'nope' }, 500) : live.response))
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    await until(store, () => m.calls.length === 1)
    live.push(started('r1'))
    await until(store, (s) => s.runs[0]!.id === 'r1')
    await store.cancel()
    expect(store.getSnapshot().runs[0]).toMatchObject({ status: 'running', error: expect.stringContaining('nope') })
    live.push({ event: 'RunCancelled', run_id: 'r1', reason: 'user', event_index: 1 }); live.close()
    await p
  })

  test('resume is a no-op while a stream for that run is open', async () => {
    const live = openSse()
    const m = mockFetch(() => live.response)
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    await until(store, () => m.calls.length === 1)
    live.push(started('r1'))
    await until(store, (s) => s.runs[0]!.id === 'r1')
    await store.resume('r1')
    expect(m.calls).toHaveLength(1)
    live.push(completed('r1', 'hello', 1)); live.close()
    await p
  })

  test('cancel before RunStarted aborts the stream and settles the run locally', async () => {
    const live = openSse()
    const m = mockFetch(() => live.response)
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    await until(store, () => m.calls.length === 1)
    await store.cancel()
    expect(store.getSnapshot().runs[0]).toMatchObject({ id: 'local-1', status: 'cancelled' })
    expect(store.getSnapshot().isBusy).toBe(false)
    expect(m.calls).toHaveLength(1) // no /cancel request: the server has no run id yet
    live.close() // the mocked fetch ignores the abort signal; a real fetch rejects the read
    await p
    expect(store.getSnapshot().runs[0]!.status).toBe('cancelled')
  })

  test('cancel falls back to a local cancel after the timeout', async () => {
    const live = openSse()
    const m = mockFetch((call) => (call.url.includes('/cancel') ? json({ ok: true }) : live.response))
    const store = agentStore(m.fetch, { cancelTimeoutMs: 10 })
    void store.send('hi')
    await until(store, () => m.calls.length === 1)
    live.push(started('r1'))
    await until(store, (s) => s.runs[0]!.id === 'r1')
    await store.cancel()
    await until(store, (s) => s.runs[0]!.status === 'cancelled')
  })

  test('destroy aborts streams and stops notifying', async () => {
    const live = openSse()
    const m = mockFetch(() => live.response)
    const store = agentStore(m.fetch)
    let notified = 0
    store.subscribe(() => notified++)
    const p = store.send('hi')
    await until(store, () => m.calls.length === 1)
    const before = notified
    store.destroy()
    live.push(started('r1'))
    await wait(20)
    await p
    expect(notified).toBe(before)
    expect(store.getSnapshot().runs[0]!.id).toBe('local-1')
  })

  test('snapshot identity is stable between commits', () => {
    const store = agentStore(mockFetch(() => json([])).fetch)
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })
})

describe('mergeSessionState (write)', () => {
  test('mescla localmente e faz PATCH do estado completo; irmãs sobrevivem, array substitui', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET')
        return json({ session_id: 's1', session_state: { cart: { items: [{ id: 'a', qty: 1 }], delivery: { notes: 'x' } } } })
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'PATCH')
        return json({ session_id: 's1', session_state: JSON.parse(String(call.init.body)).session_state })
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await until(store, (s) => s.sessionState !== null)
    await store.mergeSessionState({ cart: { items: [{ id: 'a', qty: 2 }] } })
    const s = store.getSnapshot()
    expect(s.sessionState).toEqual({ cart: { items: [{ id: 'a', qty: 2 }], delivery: { notes: 'x' } } })
    const patchCall = m.calls.find((c) => c.url.endsWith('/sessions/s1') && c.init.method === 'PATCH')!
    expect(JSON.parse(String(patchCall.init.body)).session_state).toEqual(s.sessionState)
  })

  test('aceita updater function recebendo o current certo', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') return json({ session_id: 's1', session_state: { count: 3 } })
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'PATCH')
        return json({ session_id: 's1', session_state: JSON.parse(String(call.init.body)).session_state })
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await until(store, (s) => s.sessionState !== null)
    await store.mergeSessionState((current) => ({ count: (current.count as number) + 1 }))
    expect(store.getSnapshot().sessionState).toEqual({ count: 4 })
  })

  test('lança se isBusy e não chama a API', async () => {
    const m = mockFetch(() => frames([started('r1', 's9'), content('r1', 'hel', 1), completed('r1', 'hello', 2)]))
    const store = agentStore(m.fetch)
    const p = store.send('hi')
    // Checagem síncrona, sem `until`: o run otimista fica 'running' antes de qualquer rede (mesmo
    // padrão do teste de `send()` já existente no arquivo) — esperar via `until` aqui arriscaria
    // flakiness, já que o stream mockado (frames pré-montados) pode terminar rápido demais.
    expect(store.getSnapshot().isBusy).toBe(true)
    await expect(store.mergeSessionState({ a: 1 })).rejects.toThrow('A run is already active')
    expect(m.calls.some((c) => c.init.method === 'PATCH')).toBe(false)
    await p
  })

  test('lança se não há sessão ainda', async () => {
    const m = mockFetch(() => json({}, 404))
    const store = agentStore(m.fetch)
    await expect(store.mergeSessionState({ a: 1 })).rejects.toThrow('mergeSessionState requires an active session')
    expect(m.calls).toHaveLength(0)
  })

  test('chamadas concorrentes serializam: nunca dois PATCH em voo, merge local em ordem, total acumulado', async () => {
    // The first PATCH's response is held open, so "only one PATCH has reached the network" is checked
    // while it is provably still in flight — an implementation that fired both in parallel (no queue at
    // all) would produce the same bodies in the same order and pass a purely content-based assertion.
    const gate = deferred()
    const patchBodies: unknown[] = []
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') return json({ session_id: 's1', session_state: { count: 0 } })
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'PATCH') {
        const state = JSON.parse(String(call.init.body)).session_state
        const isFirst = patchBodies.length === 0
        patchBodies.push(state)
        const body = () => json({ session_id: 's1', session_state: state })
        return isFirst ? gate.promise.then(body) : body()
      }
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await until(store, (s) => s.sessionState !== null)
    const p1 = store.mergeSessionState({ count: 1 })
    const p2 = store.mergeSessionState((current) => ({ count: (current.count as number) + 10 }))
    expect(store.getSnapshot().sessionState).toEqual({ count: 11 }) // ambos os merges locais já aplicaram, antes de qualquer PATCH resolver
    await wait(10) // tempo de sobra pra um despacho paralelo (incorreto) acontecer
    expect(m.calls.filter((c) => c.init.method === 'PATCH')).toHaveLength(1) // exclusão mútua: o PATCH de p2 ainda não saiu
    gate.release()
    await Promise.all([p1, p2])
    expect(m.calls.filter((c) => c.init.method === 'PATCH')).toHaveLength(2)
    expect(patchBodies).toEqual([{ count: 1 }, { count: 11 }]) // PATCH em ordem, cada um com o total daquele momento
  })

  test('PATCH falhando resincroniza do servidor, rejeita só aquela chamada e não trava o que já estava na fila', async () => {
    let failNext = true
    const patchBodies: unknown[] = []
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') return json({ session_id: 's1', session_state: { count: failNext ? 0 : 99 } })
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'PATCH') {
        if (failNext) { failNext = false; return json({ detail: 'boom' }, 500) }
        const state = JSON.parse(String(call.init.body)).session_state
        patchBodies.push(state)
        return json({ session_id: 's1', session_state: state })
      }
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await until(store, (s) => s.sessionState !== null)
    const p1 = store.mergeSessionState({ count: 1 })
    const p2 = store.mergeSessionState({ count: 2 }) // enfileirada ANTES de p1 falhar — sem await entre as duas
    await expect(p1).rejects.toThrow()
    await p2 // a fila não trava: a escrita que já estava atrás da que falhou saiu mesmo assim
    expect(patchBodies).toEqual([{ count: 2 }])
    // Resincronizado do servidor, não preso no otimista {count:1}. A escrita já enfileirada NÃO é
    // rebaseada em cima do resync (limitação deliberada, documentada em mergeSessionState), então o
    // valor local reflete o resync — e não o {count:2} que acabou de ir pro servidor.
    expect(store.getSnapshot().sessionState).toEqual({ count: 99 })
    // Uma chamada nova parte do estado resincronizado.
    await store.mergeSessionState({ extra: true })
    expect(store.getSnapshot().sessionState).toEqual({ count: 99, extra: true })
  })

  test('com sessionState ainda null, faz o seed do servidor antes de mesclar — nunca faz PATCH só das chaves do patch', async () => {
    // The PATCH is a whole-field replacement, so merging onto `{}` would erase every server-side key
    // the agent had written. `sessionState` is null here for the reason the hydrate suite calls
    // harmless: the seed GET failed (500). The next GET — mergeSessionState's own — succeeds.
    let gets = 0
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') {
        gets++
        return gets === 1 ? json({ detail: 'boom' }, 500) : json({ session_id: 's1', session_state: { count: 7, agentWrote: 'keep me' } })
      }
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'PATCH')
        return json({ session_id: 's1', session_state: JSON.parse(String(call.init.body)).session_state })
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await until(store, (s) => s.status === 'ready' && gets === 1)
    expect(store.getSnapshot().sessionState).toBeNull()
    await store.mergeSessionState({ count: 8 })
    expect(store.getSnapshot().sessionState).toEqual({ count: 8, agentWrote: 'keep me' })
    const patchCall = m.calls.find((c) => c.url.endsWith('/sessions/s1') && c.init.method === 'PATCH')!
    expect(JSON.parse(String(patchCall.init.body)).session_state).toEqual({ count: 8, agentWrote: 'keep me' })
  })

  test('duas merges concorrentes com sessionState null compõem em ordem — o último PATCH carrega as duas', async () => {
    // Each call takes its slot in the PATCH queue synchronously, at call time, but freezes the whole-field
    // payload it sends only once it has a base to merge onto. If those two orders can disagree — a seed
    // fetch per call, answering out of order — the write that lands LAST carries a state built BEFORE the
    // one ahead of it, silently dropping that patch server-side while the local state still shows both.
    // Releasing every outstanding on-demand seed newest-first is the interleaving that exposes it.
    const releases: (() => void)[] = []
    let gets = 0
    const patchBodies: unknown[] = []
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') {
        // GET #1 is hydrate()'s seed, failing the way hydrate treats as harmless: `sessionState` stays null.
        if (++gets === 1) return json({ detail: 'boom' }, 500)
        const d = deferred()
        releases.push(d.release)
        return d.promise.then(() => json({ session_id: 's1', session_state: { srv: 'keep me' } }))
      }
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'PATCH') {
        const state = JSON.parse(String(call.init.body)).session_state
        patchBodies.push(state)
        return json({ session_id: 's1', session_state: state })
      }
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await until(store, (s) => s.status === 'ready' && gets === 1)
    expect(store.getSnapshot().sessionState).toBeNull()
    const p1 = store.mergeSessionState({ a: 1 })
    const p2 = store.mergeSessionState({ b: 2 })
    await until(store, () => releases.length >= 1)
    await wait(10) // tempo de sobra pra uma segunda busca de seed (uma implementação sem dedupe) sair
    for (const release of [...releases].reverse()) release() // o seed mais novo responde primeiro
    await Promise.all([p1, p2])
    expect(store.getSnapshot().sessionState).toEqual({ srv: 'keep me', a: 1, b: 2 })
    // Cada PATCH leva o total daquele momento, em ordem de chamada — e o último, que é o que fica valendo
    // no servidor, tem as duas edições e a chave que só existia lá.
    expect(patchBodies).toEqual([{ srv: 'keep me', a: 1 }, { srv: 'keep me', a: 1, b: 2 }])
  })

  test('com sessionState null e o seed sob demanda também falhando, rejeita sem nenhum PATCH', async () => {
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') return json({ detail: 'boom' }, 500)
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await until(store, (s) => s.status === 'ready')
    await expect(store.mergeSessionState({ count: 1 })).rejects.toThrow('boom')
    expect(m.calls.some((c) => c.init.method === 'PATCH')).toBe(false)
    expect(store.getSnapshot().sessionState).toBeNull() // nada de estado parcial inventado
  })

  test('a merge survives a slower, stale hydrate() fetch landing afterward', async () => {
    const gate = deferred()
    let gets = 0
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') {
        // The FIRST GET is hydrate()'s seed: held open until this test releases it, so it is
        // provably still in flight while the merge below happens. mergeSessionState's own on-demand
        // seed (the second GET) answers immediately.
        gets++
        const body = () => json({ session_id: 's1', session_state: { count: 1 } })
        return gets === 1 ? gate.promise.then(body) : body()
      }
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'PATCH')
        return json({ session_id: 's1', session_state: JSON.parse(String(call.init.body)).session_state })
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    await until(store, () => gets === 1)
    expect(store.getSnapshot().sessionState).toBeNull() // hydrate's seed has not landed
    await store.mergeSessionState({ count: 5 })
    expect(store.getSnapshot().sessionState).toEqual({ count: 5 })
    // Only now does hydrate()'s stale response arrive; it must not clobber the merge's result.
    gate.release()
    await wait(5)
    expect(store.getSnapshot().sessionState).toEqual({ count: 5 })
  })

  // The lock in `mergeSessionState` stops an edit from starting while a run is active. These cover the
  // same race from the other side: a run starting while an edit's PATCH — built from the pre-run state —
  // is still in flight would let that stale whole-field write land after the run mutated session_state
  // server-side, silently losing the agent's own changes.
  describe('uma run só começa depois que a escrita manual em voo aterrissa', () => {
    const stateOf = (call: { init: RequestInit }) => JSON.parse(String(call.init.body)).session_state
    const gatedStateApi = (gate: { promise: Promise<void> }, rest: (call: { url: string; init: RequestInit }) => Response | Promise<Response>) =>
      (call: { url: string; init: RequestInit }) => {
        if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') return json({ session_id: 's1', session_state: { count: 0 } })
        if (call.url.endsWith('/sessions/s1') && call.init.method === 'PATCH')
          return gate.promise.then(() => json({ session_id: 's1', session_state: stateOf(call) }))
        return rest(call)
      }

    test('send() espera a fila de escrita antes de abrir a run', async () => {
      const gate = deferred()
      const m = mockFetch(gatedStateApi(gate, (call) => {
        if (call.url.includes('/sessions/s1/runs')) return json([])
        if (call.url.endsWith('/agents/a/runs'))
          return frames([started('r1', 's1'), { event: 'RunCompleted', run_id: 'r1', content: 'ok', event_index: 1, session_state: { count: 42 } } as AnyEvent])
        throw new Error('unexpected ' + call.url)
      }))
      const store = agentStore(m.fetch, { sessionId: 's1' })
      await until(store, (s) => s.status === 'ready' && s.sessionState !== null)
      const pMerge = store.mergeSessionState({ count: 1 })
      const pSend = store.send('hi')
      await wait(10)
      expect(m.calls.some((c) => c.url.endsWith('/agents/a/runs'))).toBe(false) // run not opened yet
      gate.release()
      await Promise.all([pMerge, pSend])
      expect(m.calls.some((c) => c.url.endsWith('/agents/a/runs'))).toBe(true)
      // The run's terminal event is the last word on session_state, not the merge that preceded it.
      expect(store.getSnapshot().sessionState).toEqual({ count: 42 })
    })

    test('send() espera mesmo quando a escrita ainda está buscando o seed (sessionState null)', async () => {
      // The window the counter used to miss entirely: `mergeSessionState` with `sessionState` still null
      // has to GET the session before it can merge, and while it is parked on that fetch it is just as
      // outstanding as one parked on its PATCH — the run it lets through would race the merge's own
      // whole-field write. The seed GET is gated, so the merge is provably still mid-seed when send()
      // is called; no PATCH has even been built yet.
      const seed = deferred()
      let gets = 0
      const m = mockFetch((call) => {
        if (call.url.includes('/sessions/s1/runs')) return json([])
        if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') {
          gets++
          // GET #1 is hydrate()'s seed: it fails, which hydrate treats as harmless — that is exactly how
          // `sessionState` legitimately stays null on a ready store. GET #2 is the merge's own seed.
          return gets === 1
            ? json({ detail: 'boom' }, 500)
            : seed.promise.then(() => json({ session_id: 's1', session_state: { count: 0, agentWrote: 'keep me' } }))
        }
        if (call.url.endsWith('/sessions/s1') && call.init.method === 'PATCH') return json({ session_id: 's1', session_state: stateOf(call) })
        if (call.url.endsWith('/agents/a/runs'))
          return frames([started('r1', 's1'), { event: 'RunCompleted', run_id: 'r1', content: 'ok', event_index: 1, session_state: { count: 42 } } as AnyEvent])
        throw new Error('unexpected ' + call.url)
      })
      const store = agentStore(m.fetch, { sessionId: 's1' })
      await until(store, (s) => s.status === 'ready' && gets === 1)
      expect(store.getSnapshot().sessionState).toBeNull()
      const pMerge = store.mergeSessionState({ count: 1 })
      await until(store, () => gets === 2) // o seed do merge está comprovadamente em voo
      const pSend = store.send('hi')
      await wait(10) // tempo de sobra pra uma run (incorretamente) despachada acontecer
      expect(m.calls.some((c) => c.url.endsWith('/agents/a/runs'))).toBe(false) // run not opened yet
      expect(m.calls.some((c) => c.init.method === 'PATCH')).toBe(false) // e o PATCH nem foi montado ainda
      seed.release()
      await Promise.all([pMerge, pSend])
      const patchAt = m.calls.findIndex((c) => c.init.method === 'PATCH')
      const runAt = m.calls.findIndex((c) => c.url.endsWith('/agents/a/runs'))
      expect(patchAt).toBeGreaterThanOrEqual(0)
      expect(runAt).toBeGreaterThan(patchAt) // a run só abriu depois que a escrita manual aterrissou
      // Nada foi apagado em nenhuma das duas direções: o PATCH levou o estado completo do servidor
      // (`agentWrote`), e o evento terminal da run é a última palavra sobre `session_state`.
      expect(stateOf(m.calls[patchAt]!)).toEqual({ count: 1, agentWrote: 'keep me' })
      expect(store.getSnapshot().sessionState).toEqual({ count: 42 })
    })

    test('resume() espera a fila de escrita antes de reabrir o stream', async () => {
      const gate = deferred()
      const m = mockFetch(gatedStateApi(gate, (call) => {
        if (call.url.includes('/sessions/s1/runs')) return json([{ run_id: 'r1', agent_id: 'a', status: 'ERROR', run_input: 'hi', content: '' }])
        if (call.url.endsWith('/runs/r1/resume'))
          return frames([{ event: 'RunCompleted', run_id: 'r1', content: 'ok', event_index: 1, session_state: { count: 42 } } as AnyEvent])
        throw new Error('unexpected ' + call.url)
      }))
      const store = agentStore(m.fetch, { sessionId: 's1' })
      await until(store, (s) => s.status === 'ready' && s.sessionState !== null)
      const pMerge = store.mergeSessionState({ count: 1 })
      const pResume = store.resume('r1')
      await wait(10)
      expect(m.calls.some((c) => c.url.endsWith('/runs/r1/resume'))).toBe(false)
      gate.release()
      await Promise.all([pMerge, pResume])
      expect(m.calls.some((c) => c.url.endsWith('/runs/r1/resume'))).toBe(true)
      expect(store.getSnapshot().sessionState).toEqual({ count: 42 })
    })

    test('continue() espera a fila de escrita antes de retomar a run pausada', async () => {
      // Reachable because the merge starts before hydrate() has any run to report: the rows land (with
      // an already-paused run) only after the PATCH is in flight.
      const gate = deferred()
      const rows = deferred()
      const tool = { tool_call_id: 'c1', tool_name: 'add_one', tool_args: { x: 1 }, requires_confirmation: true }
      const m = mockFetch(gatedStateApi(gate, (call) => {
        if (call.url.includes('/sessions/s1/runs'))
          return rows.promise.then(() => json([{ run_id: 'r1', agent_id: 'a', status: 'PAUSED', run_input: 'hi', tools: [tool] }]))
        if (call.url.endsWith('/agents/a/runs/r1/continue'))
          return frames([{ event: 'RunContinued', run_id: 'r1', event_index: 10 }, { event: 'RunCompleted', run_id: 'r1', content: 'done', event_index: 11, session_state: { count: 42 } } as AnyEvent])
        if (call.url.includes('/agents/a/runs/r1'))
          return json({ run_id: 'r1', agent_id: 'a', status: 'PAUSED', input: { input_content: 'hi' }, tools: [tool], requirements: [{ id: 'q', tool_execution: tool }] })
        throw new Error('unexpected ' + call.url)
      }))
      const store = agentStore(m.fetch, { sessionId: 's1' })
      await until(store, (s) => s.sessionState !== null)
      const pMerge = store.mergeSessionState({ count: 1 }) // no run yet: the lock lets this through
      rows.release()
      await until(store, (s) => s.pending !== null)
      const pCont = store.continue([{ ...tool, confirmed: true }])
      await wait(10)
      expect(m.calls.some((c) => c.url.endsWith('/continue'))).toBe(false)
      gate.release()
      await Promise.all([pMerge, pCont])
      expect(m.calls.some((c) => c.url.endsWith('/continue'))).toBe(true)
      expect(store.getSnapshot().sessionState).toEqual({ count: 42 })
    })
  })

  test('throws when a run is running/paused for this session, even if reattached and not locally driven', async () => {
    const live = openSse()
    const m = mockFetch((call) => {
      if (call.url.includes('/sessions/s1/runs')) return json([
        { run_id: 'r1', agent_id: 'a', status: 'RUNNING', run_input: 'hi', content: '' },
      ])
      if (call.url.endsWith('/sessions/s1') && call.init.method === 'GET') return json({ session_id: 's1', session_state: { count: 1 } })
      if (call.url.endsWith('/runs/r1/resume')) return live.response
      throw new Error('unexpected ' + call.url)
    })
    const store = agentStore(m.fetch, { sessionId: 's1' })
    const s = await until(store, (s) => s.status === 'ready')
    // Same setup as the hydrate describe block's first test: the row is reattached automatically, but
    // never taken over via resume()/continue(), so `isBusy` (which send() relies on) stays false.
    expect(s.isBusy).toBe(false)
    await expect(store.mergeSessionState({ a: 1 })).rejects.toThrow('A run is already active')
    expect(m.calls.some((c) => c.init.method === 'PATCH')).toBe(false)
    live.close()
  })
})
