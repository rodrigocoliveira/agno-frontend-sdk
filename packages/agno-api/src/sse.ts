import { networkError } from './errors'

export interface ParseSSEOptions {
  /** Last call of the stream: a trailing lone `\r` is a real terminator, not a split CRLF. */
  final?: boolean
  /**
   * Index of the first character not yet normalised/scanned by a previous call — everything
   * before it is a remainder this function already returned. Pass `remainderLength - 1` so the
   * held-back `\r` at the remainder's end is covered.
   */
  scanFrom?: number
}

/**
 * Consumes complete SSE frames from `buffer`, calling `onFrame` with the joined `data:` payload
 * of each one. Returns the unconsumed remainder (a partial frame still being accumulated).
 * `event:`, `id:`, `retry:` and comment lines are ignored: the JSON payload's `event` field is canonical.
 */
export function parseSSEBuffer(buffer: string, onFrame: (data: string) => void, opts: ParseSSEOptions = {}): string {
  // Only the newly appended tail needs work: the head is a remainder a previous call already
  // normalised and scanned, so re-doing it would make a frame split across N chunks cost O(N²).
  const from = Math.min(Math.max(opts.scanFrom ?? 0, 0), buffer.length)
  const head = buffer.slice(0, from)
  const tail = buffer.slice(from)
  // Hold back a trailing lone `\r` instead of normalising it: it may be the first half of a
  // CRLF pair split across chunk boundaries, and normalising it now would turn the next
  // chunk's leading `\n` into a spurious blank line (a false frame terminator). On the final
  // flush there is no next chunk, so the `\r` is a genuine line terminator.
  const held = !opts.final && tail.endsWith('\r') ? '\r' : ''
  const normalisable = held ? tail.slice(0, -1) : tail
  const normalised = normalisable.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  // The common case (an LF-only tail with nothing held back) leaves the buffer untouched, so
  // reuse it instead of rebuilding the whole string on every chunk.
  let rest = normalised === tail ? buffer : head + normalised
  // A new `\n\n` must include a character at index >= `from`, so it can start no earlier than
  // `from - 1`; the head holds none by construction.
  let searchFrom = Math.max(from - 1, 0)
  for (;;) {
    const end = rest.indexOf('\n\n', searchFrom)
    if (end === -1) return rest + held
    const frame = rest.slice(0, end)
    rest = rest.slice(end + 2)
    searchFrom = 0
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
      const scanFrom = Math.max(buffer.length - 1, 0)
      buffer = parseSSEBuffer(buffer + decoder.decode(value, { stream: true }), push, { scanFrom })
      while (pending.length) yield pending.shift()!
    }
    parseSSEBuffer(buffer + decoder.decode(), push, { final: true, scanFrom: Math.max(buffer.length - 1, 0) })
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
