import { networkError } from './errors'

/**
 * Consumes complete SSE frames from `buffer`, calling `onFrame` with the joined `data:` payload
 * of each one. Returns the unconsumed remainder (a partial frame still being accumulated).
 * `event:`, `id:`, `retry:` and comment lines are ignored: the JSON payload's `event` field is canonical.
 */
export function parseSSEBuffer(buffer: string, onFrame: (data: string) => void): string {
  // Hold back a trailing lone `\r` instead of normalising it: it may be the first half of a
  // CRLF pair split across chunk boundaries, and normalising it now would turn the next
  // chunk's leading `\n` into a spurious blank line (a false frame terminator).
  const held = buffer.endsWith('\r') ? '\r' : ''
  const normalisable = held ? buffer.slice(0, -1) : buffer
  let rest = normalisable.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (;;) {
    const end = rest.indexOf('\n\n')
    if (end === -1) return rest + held
    const frame = rest.slice(0, end)
    rest = rest.slice(end + 2)
    const data: string[] = []
    for (const line of frame.split('\n')) {
      if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    if (data.length) onFrame(data.join('\n'))
  }
}

const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError'

export async function* iterateSSE<E>(body: ReadableStream<Uint8Array>, ctx: { method: string; path: string }): AsyncGenerator<E> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const pending: E[] = []
  const push = (data: string) => {
    try {
      pending.push(JSON.parse(data) as E)
    } catch {
      // malformed frame: skip, keep the stream alive
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer = parseSSEBuffer(buffer + decoder.decode(value, { stream: true }), push)
      while (pending.length) yield pending.shift()!
    }
    buffer = parseSSEBuffer(buffer + decoder.decode(), push)
    while (pending.length) yield pending.shift()!
  } catch (e) {
    if (isAbort(e)) throw e
    throw networkError(ctx.method, ctx.path, e)
  } finally {
    // Cancel first so a real fetch() response body isn't left open until GC when a consumer
    // `break`s out of `for await` early (e.g. on a terminal event). This is a safe no-op when
    // the stream has already finished or errored. Some runtimes don't release the reader's
    // lock as part of cancel(), so release it explicitly afterwards too.
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
