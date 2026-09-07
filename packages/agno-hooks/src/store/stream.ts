import { isAgnoApiError } from '@rodrigocoliveira/agno-api'
import type { AnyEvent } from '../types'

export class ConnectionLostError extends Error {
  constructor(cause?: unknown) {
    super('Connection lost', { cause })
    this.name = 'ConnectionLostError'
  }
}

const META = new Set(['catch_up', 'replay', 'subscribed'])
/** /resume meta frames. The `error` meta has no run_id; a run's own error event is `RunError` / `WorkflowError`. */
export function isResumeMeta(ev: AnyEvent): boolean {
  return META.has(ev.event) || (ev.event === 'error' && !('run_id' in ev))
}

const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError'
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export interface RunStreamOptions {
  /** Opens the initial stream (create / continue / resume). */
  first: () => AsyncIterable<AnyEvent>
  /** Opens a resume stream from the last index. `null` here = never reconnect (foreground run); returning `null` = cannot reconnect right now (no real run_id yet). */
  resume: ((lastIndex: number | null) => AsyncIterable<AnyEvent> | null) | null
  onEvent: (ev: AnyEvent) => void
  getIndex: () => number | null
  isDone: () => boolean
  signal: AbortSignal
  delays?: number[]
  sleep?: (ms: number) => Promise<void>
}

/**
 * Consumes one run's stream to the end. Skips meta frames, drops events whose event_index we already applied,
 * reconnects through `resume` on thrown errors (delays 500/1000/2000 ms; the backoff counter resets after
 * progress). A clean (non-throwing) end of the source iterable always resolves — the AgentOS server closes the
 * SSE stream normally both on completion and on a non-terminal pause (`RunPaused`), and neither should trigger
 * a reconnection attempt. Rejects with ConnectionLostError once retries are exhausted or reconnection is
 * impossible, or with the AgnoApiError when the request itself was refused (never retried).
 */
export async function runStream(o: RunStreamOptions): Promise<void> {
  const delays = o.delays ?? [500, 1000, 2000]
  const sleep = o.sleep ?? defaultSleep
  let source = o.first
  let attempt = 0
  for (;;) {
    try {
      for await (const ev of source()) {
        if (o.signal.aborted) return
        if (isResumeMeta(ev)) {
          if (ev.event === 'error') throw new ConnectionLostError(ev.error)
          continue
        }
        const idx = o.getIndex()
        if (typeof ev.event_index === 'number' && idx !== null && ev.event_index <= idx) continue
        o.onEvent(ev)
        attempt = 0
      }
      return
    } catch (err) {
      if (o.signal.aborted || isAbort(err)) return
      if (isAgnoApiError(err)) throw err
      if (o.isDone()) return
      const lost = err instanceof ConnectionLostError ? err : new ConnectionLostError(err)
      if (!o.resume || attempt >= delays.length) throw lost
      const next = o.resume(o.getIndex())
      if (!next) throw lost
      await sleep(delays[attempt]!)
      attempt++
      source = () => next
    }
  }
}
