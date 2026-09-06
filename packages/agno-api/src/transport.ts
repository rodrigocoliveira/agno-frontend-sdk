import type { ContentType } from './generated/routes.gen'
import { errorFromResponse, networkError } from './errors'
import { buildQuery, encodeBody } from './serialize'
import { iterateSSE } from './sse'

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'
export type TokenSource = string | (() => string | undefined | Promise<string | undefined>)

export interface RequestOptions {
  signal?: AbortSignal
  headers?: Record<string, string>
  idempotencyKey?: string
}

export interface TransportConfig {
  baseUrl: string
  token?: TokenSource
  onTokenExpired?: () => void | string | Promise<void | string>
  headers?: Record<string, string>
  fetch?: typeof fetch
}

export interface ResolvedRequest extends RequestOptions {
  method: Method
  path: string
  query?: Record<string, unknown>
  body?: Record<string, unknown>
  contentType?: ContentType | null
  response?: 'json' | 'blob'
}

export interface Transport {
  request<T>(req: ResolvedRequest): Promise<T>
  stream<E>(req: ResolvedRequest): AsyncGenerator<E>
}

const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError'

export function createTransport(config: TransportConfig): Transport {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const fetchFn = config.fetch ?? globalThis.fetch
  let override: string | undefined // token returned by onTokenExpired, wins until the next refresh
  let refreshing: Promise<string | undefined> | null = null

  async function resolveToken(): Promise<string | undefined> {
    if (override !== undefined) return override
    return typeof config.token === 'function' ? await config.token() : config.token
  }

  function refresh(): Promise<string | undefined> {
    refreshing ??= (async () => {
      const r = await config.onTokenExpired!()
      override = typeof r === 'string' ? r : undefined
      return resolveToken()
    })().finally(() => { refreshing = null })
    return refreshing
  }

  async function doFetch(req: ResolvedRequest, accept: string, token: string | undefined): Promise<Response> {
    const qs = buildQuery(req.query)
    const url = `${baseUrl}${req.path}${qs ? `?${qs}` : ''}`
    const encoded = encodeBody(req.body, req.contentType ?? null)
    const headers = new Headers()
    headers.set('accept', accept)
    for (const [k, v] of Object.entries(config.headers ?? {})) headers.set(k, v)
    for (const [k, v] of Object.entries(encoded.headers ?? {})) headers.set(k, v)
    for (const [k, v] of Object.entries(req.headers ?? {})) headers.set(k, v)
    if (token) headers.set('authorization', `Bearer ${token}`)
    if (req.idempotencyKey) headers.set('idempotency-key', req.idempotencyKey)
    try {
      return await fetchFn(url, { method: req.method.toUpperCase(), headers, body: encoded.body, signal: req.signal })
    } catch (e) {
      if (isAbort(e)) throw e
      throw networkError(req.method.toUpperCase(), req.path, e)
    }
  }

  // Sends once; on 401 refreshes (deduplicated) and retries exactly once. Throws AgnoApiError on non-2xx.
  async function send(req: ResolvedRequest, accept: string): Promise<Response> {
    const used = await resolveToken()
    let res = await doFetch(req, accept, used)
    if (res.status === 401 && config.onTokenExpired) {
      await res.body?.cancel().catch(() => {})
      const current = await resolveToken()
      const next = current !== used ? current : await refresh()
      res = await doFetch(req, accept, next)
    }
    if (!res.ok) throw await errorFromResponse(res, req.method.toUpperCase(), req.path)
    return res
  }

  async function parse<T>(res: Response, as: 'json' | 'blob'): Promise<T> {
    if (as === 'blob') return (await res.blob()) as T
    if (res.status === 204) return undefined as T
    const text = await res.text()
    if (text.length === 0) return undefined as T
    if (res.headers.get('content-type')?.includes('json')) return JSON.parse(text) as T
    return text as T
  }

  return {
    async request<T>(req: ResolvedRequest): Promise<T> {
      const res = await send(req, 'application/json')
      return parse<T>(res, req.response ?? 'json')
    },
    async *stream<E>(req: ResolvedRequest): AsyncGenerator<E> {
      const res = await send(req, 'text/event-stream')
      if (!res.body) throw networkError(req.method.toUpperCase(), req.path, new Error('empty stream body'))
      yield* iterateSSE<E>(res.body, { method: req.method.toUpperCase(), path: req.path })
    },
  }
}
