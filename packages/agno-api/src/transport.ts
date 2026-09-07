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
  let refreshing: Promise<string | undefined> | null = null

  // `config.token` is the single source of truth and is read on every request; a token returned
  // by `onTokenExpired` is never remembered, so it cannot outlive a logout that clears `token`.
  async function resolveToken(): Promise<string | undefined> {
    return typeof config.token === 'function' ? await config.token() : config.token
  }

  function refresh(): Promise<string | undefined> {
    refreshing ??= (async () => {
      const r = await config.onTokenExpired!()
      // A returned string is used for the immediate retry only — if `token()` still reports the
      // stale value, resolveToken() would otherwise hand the retry that stale value back.
      return typeof r === 'string' ? r : await resolveToken()
    })().finally(() => { refreshing = null })
    return refreshing
  }

  async function doFetch(req: ResolvedRequest, accept: string, token: string | undefined): Promise<Response> {
    const qs = buildQuery(req.query)
    const url = `${baseUrl}${req.path}${qs ? `?${qs}` : ''}`
    // A caller-supplied body with no contentType defaults to JSON — matters only for
    // api.request()/api.stream(), the escape hatch; generated routes always carry a contentType.
    const contentType = req.contentType ?? (req.body !== undefined ? 'application/json' : null)
    const encoded = encodeBody(req.body, contentType)
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
      // Build the 401's error eagerly (this also drains the body): if the refresh itself blows up,
      // the caller must still see the original 401 rather than the refresh's own failure.
      const unauthorized = await errorFromResponse(res, req.method.toUpperCase(), req.path)
      const current = await resolveToken()
      let next: string | undefined
      if (current !== used) next = current
      else {
        try {
          next = await refresh()
        } catch (cause) {
          throw Object.assign(unauthorized, { cause })
        }
      }
      // The refresh produced nothing new: the very token that just got the 401 cannot make a retry
      // succeed, so surface the original 401 instead of paying for an identical second request.
      if (next === used) throw unauthorized
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
