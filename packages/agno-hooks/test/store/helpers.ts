import { createAgnoApi } from '@rodrigocoliveira/agno-api'
import { json, mockFetch, sse, type FetchCall } from '../../../agno-api/test/helpers'
import type { AnyEvent } from '../../src/types'

export { json, mockFetch, sse }

/** SSE response from a list of events (one `data:` frame each). */
export const frames = (events: AnyEvent[]) => sse(events.map((e) => `data: ${JSON.stringify(e)}\n\n`))

/** An SSE response you can feed after the fact; `drop()` errors the stream like a network cut. */
export function openSse() {
  const enc = new TextEncoder()
  let ctrl!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start(c) { ctrl = c } })
  return {
    response: new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    push: (e: AnyEvent) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)),
    close: () => ctrl.close(),
    drop: () => ctrl.error(new TypeError('network down')),
  }
}

/** Reads a body param whether the route used FormData, URLSearchParams or a JSON/string body. */
export function bodyParam(call: FetchCall, name: string): string | null {
  const b = call.init.body
  if (b instanceof FormData) { const v = b.get(name); return v == null ? null : String(v) }
  if (b instanceof URLSearchParams) return b.get(name)
  if (typeof b === 'string') { try { return new URLSearchParams(b).get(name) } catch { return null } }
  return null
}

export const apiWith = (fetchFn: typeof fetch) => createAgnoApi({ baseUrl: 'http://x', fetch: fetchFn })

export const wait = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))

/** Polls a store until `pred(snapshot)` is true (or times out). */
export async function until<T>(store: { getSnapshot(): T }, pred: (s: T) => boolean, timeoutMs = 2000): Promise<T> {
  const start = Date.now()
  while (!pred(store.getSnapshot())) {
    if (Date.now() - start > timeoutMs) throw new Error('until: timed out; snapshot = ' + JSON.stringify(store.getSnapshot(), null, 1).slice(0, 2000))
    await wait(5)
  }
  return store.getSnapshot()
}
