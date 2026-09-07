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
 * reconnects through `resume` on connection loss (delays 500/1000/2000 ms; the backoff counter resets after
 * progress). Resolves on abort or a clean end we can't do anything more with; rejects with ConnectionLostError
 * once retries are exhausted (or reconnection is impossible), or with the AgnoApiError when the request itself
 * was refused (never retried).
 *
 * A source iterable can end two ways: it throws (a network error, or the explicit ConnectionLostError raised
 * below for a `/resume` meta `error` frame), or it just returns (the connection closed quietly, which is the
 * common shape for a dropped SSE stream). Both are "connection lost" unless `isDone()` says the run is over.
 * The one exception: a quiet end that produced literally nothing (not even a duplicate) with no way to
 * reconnect is a hard failure (we never got anything from the server), while a quiet, empty end that a
 * `resume` *could* have retried is treated as caught up rather than looped forever.
 */
export async function runStream(o: RunStreamOptions): Promise<void> {
  const delays = o.delays ?? [500, 1000, 2000]
  const sleep = o.sleep ?? defaultSleep
  let source = o.first
  let attempt = 0
  let everProgressed = false

  /** Schedules the next reconnect attempt, or throws ConnectionLostError when none is possible. */
  const reconnectOrThrow = async (cause?: unknown): Promise<void> => {
    const lost = cause instanceof ConnectionLostError ? cause : new ConnectionLostError(cause)
    if (!o.resume || attempt >= delays.length) throw lost
    const next = o.resume(o.getIndex())
    if (!next) throw lost
    await sleep(delays[attempt]!)
    attempt++
    source = () => next
  }

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
        everProgressed = true
        attempt = 0
      }
    } catch (err) {
      if (o.signal.aborted || isAbort(err)) return
      if (isAgnoApiError(err)) throw err
      if (o.isDone()) return
      await reconnectOrThrow(err)
      continue
    }

    // The iterable returned normally: a quiet end, not an error.
    if (o.isDone()) return
    if (!everProgressed) {
      // Nothing was ever applied. With no way to reconnect this was a failed connection attempt;
      // with `resume` available, treat a quiet empty end as caught up rather than retrying forever.
      if (!o.resume) throw new ConnectionLostError()
      return
    }
    if (!o.resume) return // Real content streamed through; nothing left to do without a way to reconnect.
    await reconnectOrThrow()
  }
}
