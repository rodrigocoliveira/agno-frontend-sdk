import { networkError } from './errors'

/**
 * Consumes complete SSE frames from `buffer`, calling `onFrame` with the joined `data:` payload
 * of each one. Returns the unconsumed remainder (a partial frame still being accumulated).
 * `event:`, `id:`, `retry:` and comment lines are ignored: the JSON payload's `event` field is canonical.
 */
export function parseSSEBuffer(buffer: string, onFrame: (data: string) => void): string {
  let rest = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (;;) {
    const end = rest.indexOf('\n\n')
    if (end === -1) return rest
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
    reader.releaseLock()
  }
}
