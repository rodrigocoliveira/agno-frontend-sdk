import { describe, expect, test } from 'bun:test'
import { AgnoApiError } from '@rodrigocoliveira/agno-api'
import type { AnyEvent } from '../../src/types'
import { ConnectionLostError, isResumeMeta, runStream } from '../../src/store/stream'

async function* gen(events: AnyEvent[], failAfter?: number) {
  let n = 0
  for (const e of events) {
    if (failAfter !== undefined && n === failAfter) throw new TypeError('network down')
    n++
    yield e
  }
  if (failAfter !== undefined && n === failAfter) throw new TypeError('network down')
}
const e = (i: number, event = 'RunContent'): AnyEvent => ({ event, run_id: 'r', event_index: i })
const noSleep = async () => {}

describe('runStream', () => {
  test('passes events through, skips meta events, dedupes by event_index', async () => {
    const seen: string[] = []
    let last: number | null = null
    await runStream({
      first: () => gen([{ event: 'replay', run_id: 'r', status: 'x', total_events: 3 } as AnyEvent, e(0, 'RunStarted'), e(1), e(1), e(2, 'RunCompleted')]),
      resume: null,
      onEvent: (ev) => { seen.push(`${ev.event}:${ev.event_index}`); last = ev.event_index as number },
      getIndex: () => last,
      isDone: () => false,
      signal: new AbortController().signal,
      sleep: noSleep,
    })
    expect(seen).toEqual(['RunStarted:0', 'RunContent:1', 'RunCompleted:2'])
  })

  test('reconnects with last index, resets attempts after progress, gives up after 3', async () => {
    const resumes: (number | null)[] = []
    const sleeps: number[] = []
    let last: number | null = null
    const attempt = [
      () => gen([e(0), e(1)], 2),          // first: 2 events then drop
      () => gen([e(2)], 1),                // resume 1: progress then drop
      () => gen([], 0),                    // resume 2..4: immediate drops
      () => gen([], 0),
      () => gen([], 0),
    ]
    let i = 0
    const p = runStream({
      first: attempt[i++]!,
      resume: (idx) => { resumes.push(idx); return attempt[i++]!() },
      onEvent: (ev) => { last = ev.event_index as number },
      getIndex: () => last,
      isDone: () => false,
      signal: new AbortController().signal,
      sleep: async (ms) => { sleeps.push(ms) },
    })
    await expect(p).rejects.toBeInstanceOf(ConnectionLostError)
    expect(resumes).toEqual([1, 2, 2, 2])
    expect(sleeps).toEqual([500, 500, 1000, 2000])
  })

  test('no reconnection when the run is already terminal or when resume is null', async () => {
    let done = false
    await runStream({
      first: () => gen([e(0, 'RunCompleted')], 1),
      resume: () => { throw new Error('should not resume') },
      onEvent: () => { done = true },
      getIndex: () => null, isDone: () => done, signal: new AbortController().signal, sleep: noSleep,
    })
    await expect(runStream({
      first: () => gen([], 0), resume: null, onEvent: () => {}, getIndex: () => null, isDone: () => false,
      signal: new AbortController().signal, sleep: noSleep,
    })).rejects.toBeInstanceOf(ConnectionLostError)
  })

  test('AgnoApiError is rethrown untouched, never retried', async () => {
    const err = new AgnoApiError({ status: 403, method: 'post', path: '/x', detail: 'Approval pending' })
    const p = runStream({
      first: () => (async function* () { throw err })(),
      resume: () => { throw new Error('no') }, onEvent: () => {}, getIndex: () => null, isDone: () => false,
      signal: new AbortController().signal, sleep: noSleep,
    })
    await expect(p).rejects.toBe(err)
  })

  test('meta error event ends the stream as a connection loss', async () => {
    const p = runStream({
      first: () => gen([{ event: 'error', error: 'gone' } as AnyEvent]), resume: null, onEvent: () => {},
      getIndex: () => null, isDone: () => false, signal: new AbortController().signal, sleep: noSleep,
    })
    await expect(p).rejects.toBeInstanceOf(ConnectionLostError)
  })

  test('abort stops silently', async () => {
    const ac = new AbortController()
    const seen: number[] = []
    async function* slow() { yield e(0); ac.abort(); yield e(1) }
    await runStream({ first: () => slow(), resume: null, onEvent: (ev) => seen.push(ev.event_index as number), getIndex: () => null, isDone: () => false, signal: ac.signal, sleep: noSleep })
    expect(seen).toEqual([0])
  })
})

test('isResumeMeta', () => {
  expect(isResumeMeta({ event: 'catch_up', run_id: 'r' })).toBe(true)
  expect(isResumeMeta({ event: 'error', error: 'x' })).toBe(true)
  expect(isResumeMeta({ event: 'RunError', run_id: 'r' })).toBe(false)
})
