import type { ContentType } from './generated/routes.gen'
import type { RouteContext } from './route'
import { agents } from './routes/agents'
import { os } from './routes/os'
import { sessions } from './routes/sessions'
import { teams } from './routes/teams'
import { workflows } from './routes/workflows'
import type { Primitive } from './serialize'
import { createTransport, type Method, type RequestOptions, type TransportConfig } from './transport'

export interface AgnoApiConfig extends TransportConfig {
  /** Applied to every route whose query accepts the key (e.g. db_id, table, user_id). A value passed in the call wins. */
  params?: Record<string, Primitive>
}

export interface CustomRequest extends RequestOptions {
  method: Method
  path: string
  query?: Record<string, unknown>
  body?: Record<string, unknown>
  contentType?: ContentType
  response?: 'json' | 'blob'
}

export function createAgnoApi(config: AgnoApiConfig) {
  const transport = createTransport(config)
  const ctx: RouteContext = { transport, params: config.params ?? {} }
  return {
    os: os(ctx),
    agents: agents(ctx),
    teams: teams(ctx),
    workflows: workflows(ctx),
    sessions: sessions(ctx),
    /** Any route not in the tree. Same auth, refresh and errors. Global `params` are not applied. */
    request: <T = unknown>(req: CustomRequest) => transport.request<T>(req),
    stream: <E = unknown>(req: CustomRequest) => transport.stream<E>(req),
  }
}

export type AgnoApi = ReturnType<typeof createAgnoApi>
