import type { AgnoApi, RequestOptions } from '@rodrigocoliveira/agno-api'
import type { AnyEvent, RunRowLike, Target } from '../types'

type Input = Record<string, unknown>
export interface KindRoutes {
  create(input: Input, opts: RequestOptions): AsyncIterable<AnyEvent>
  continue(runId: string, input: Input, opts: RequestOptions): AsyncIterable<AnyEvent>
  resume(runId: string, input: Input, opts: RequestOptions): AsyncIterable<AnyEvent>
  cancel(runId: string, sessionId: string | null): Promise<unknown>
  get(runId: string, sessionId: string | null): Promise<RunRowLike>
}

/** The only place that knows there are three targets. Inputs are cast: the store owns stream/background/session_id. */
export function routesFor(api: AgnoApi, target: Target): KindRoutes {
  const q = (sessionId: string | null) => (sessionId ? { session_id: sessionId } : undefined)
  const id = target.id
  switch (target.kind) {
    case 'agent': return {
      create: (input, opts) => api.agents.runs.create(id, input as unknown as Parameters<typeof api.agents.runs.create>[1], opts) as AsyncIterable<AnyEvent>,
      continue: (runId, input, opts) => api.agents.runs.continue(id, runId, input as unknown as Parameters<typeof api.agents.runs.continue>[2], opts) as AsyncIterable<AnyEvent>,
      resume: (runId, input, opts) => api.agents.runs.resume(id, runId, input as never, opts) as AsyncIterable<AnyEvent>,
      cancel: (runId, s) => api.agents.runs.cancel(id, runId, q(s) as never),
      get: (runId, s) => api.agents.runs.get(id, runId, q(s) as never) as Promise<RunRowLike>,
    }
    case 'team': return {
      create: (input, opts) => api.teams.runs.create(id, input as unknown as Parameters<typeof api.teams.runs.create>[1], opts) as AsyncIterable<AnyEvent>,
      continue: (runId, input, opts) => api.teams.runs.continue(id, runId, input as unknown as Parameters<typeof api.teams.runs.continue>[2], opts) as AsyncIterable<AnyEvent>,
      resume: (runId, input, opts) => api.teams.runs.resume(id, runId, input as never, opts) as AsyncIterable<AnyEvent>,
      cancel: (runId, s) => api.teams.runs.cancel(id, runId, q(s) as never),
      get: (runId, s) => api.teams.runs.get(id, runId, q(s) as never) as Promise<RunRowLike>,
    }
    default: return {
      create: (input, opts) => api.workflows.runs.create(id, input as unknown as Parameters<typeof api.workflows.runs.create>[1], opts) as AsyncIterable<AnyEvent>,
      continue: (runId, input, opts) => api.workflows.runs.continue(id, runId, input as unknown as Parameters<typeof api.workflows.runs.continue>[2], opts) as AsyncIterable<AnyEvent>,
      resume: (runId, input, opts) => api.workflows.runs.resume(id, runId, input as never, opts) as AsyncIterable<AnyEvent>,
      cancel: (runId, s) => api.workflows.runs.cancel(id, runId, q(s) as never),
      get: (runId, s) => api.workflows.runs.get(id, runId, q(s) as never) as Promise<RunRowLike>,
    }
  }
}
