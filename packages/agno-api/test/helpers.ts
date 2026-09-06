export interface FetchCall { url: string; init: RequestInit }

export function mockFetch(handler: (call: FetchCall, n: number) => Response | Promise<Response>) {
  const calls: FetchCall[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const call = { url, init: init ?? {} }
    calls.push(call)
    return handler(call, calls.length)
  }) as typeof fetch
  return { fetch: fetchFn, calls }
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } })

export const empty = (status = 204) => new Response(null, { status })

export function sse(frames: string[], headers: Record<string, string> = {}) {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const f of frames) c.enqueue(enc.encode(f))
      c.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', ...headers } })
}

export const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name)
