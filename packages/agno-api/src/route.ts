import type { paths } from './generated/openapi'
import { routes, type RouteKey } from './generated/routes.gen'
import { buildPath, splitInput, type Primitive } from './serialize'
import type { Method, RequestOptions, Transport } from './transport'

export interface RouteContext {
  transport: Transport
  params: Record<string, Primitive>
}

export interface RouteInfo {
  method: Method
  path: string
}

// ---------- type-level helpers over the generated `paths` ----------

type IsNever<T> = [T] extends [never] ? true : false

export type PathsFor<M extends Method> = {
  [P in keyof paths]: undefined extends paths[P][M] ? never : P
}[keyof paths] & string

export type Op<P extends keyof paths, M extends Method> = NonNullable<paths[P][M]>

export type QueryOf<O> = O extends { parameters: { query?: infer Q } }
  ? IsNever<NonNullable<Q>> extends true ? {} : NonNullable<Q>
  : {}

export type BodyOf<O> = O extends { requestBody?: infer B }
  ? IsNever<NonNullable<B>> extends true ? {} : NonNullable<B> extends { content: infer C } ? C[keyof C] : {}
  : {}

type ContentOf<R> = R extends { content?: infer C }
  ? IsNever<NonNullable<C>> extends true
    ? undefined
    : NonNullable<C> extends { 'application/json': infer J } ? J : NonNullable<C>[keyof NonNullable<C>]
  : undefined

export type ResponseOf<O> = O extends { responses: infer R }
  ? 200 extends keyof R ? ContentOf<R[200]> : 201 extends keyof R ? ContentOf<R[201]> : undefined
  : unknown

export type InputOf<O> = QueryOf<O> & BodyOf<O>

type PathParamNames<P extends string> = P extends `${string}{${infer N}}${infer Rest}` ? [N, ...PathParamNames<Rest>] : []
export type PathArgs<P extends string> = PathParamNames<P> extends infer T extends readonly unknown[]
  ? { [K in keyof T]: string | number }
  : never

type InputArgs<I> = IsNever<keyof I> extends true ? [] : {} extends I ? [input?: I] : [input: I]

export type RouteFn<P extends keyof paths & string, M extends Method, R = ResponseOf<Op<P, M>>> = (
  ...args: [...PathArgs<P>, ...InputArgs<InputOf<Op<P, M>>>, options?: RequestOptions]
) => Promise<R>

// ---------- runtime ----------

function meta(method: Method, path: string) {
  const key = `${method} ${path}` as RouteKey
  const m = routes[key]
  if (!m) throw new Error(`unknown route: ${key}`)
  const nPath = path.match(/\{[^}]+\}/g)?.length ?? 0
  const hasInput = m.query.length > 0 || m.contentType !== null
  return { m, nPath, hasInput }
}

function parseArgs(args: unknown[], nPath: number, hasInput: boolean) {
  const pathArgs = args.slice(0, nPath) as (string | number)[]
  const input = hasInput ? (args[nPath] as Record<string, unknown> | undefined) : undefined
  const options = (hasInput ? args[nPath + 1] : args[nPath]) as RequestOptions | undefined
  return { pathArgs, input, options: options ?? {} }
}

export function route<M extends Method, P extends PathsFor<M>, R = ResponseOf<Op<P, M>>>(
  ctx: RouteContext,
  method: M,
  path: P,
  opts: { response?: 'json' | 'blob' } = {},
): RouteFn<P, M, R> & { route: RouteInfo } {
  const { m, nPath, hasInput } = meta(method, path)
  const fn = (...args: unknown[]) => {
    const { pathArgs, input, options } = parseArgs(args, nPath, hasInput)
    const { query, body } = splitInput(input, m, ctx.params)
    return ctx.transport.request({
      method, path: buildPath(path, pathArgs), query, body, contentType: m.contentType, response: opts.response ?? 'json', ...options,
    })
  }
  return Object.assign(fn, { route: { method, path } }) as unknown as RouteFn<P, M, R> & { route: RouteInfo }
}

export type StreamRouteFn<P extends string, I, R, E> = {
  (...args: [...PathArgs<P>, input: I & { stream: false }, options?: RequestOptions]): Promise<R>
  (...args: [...PathArgs<P>, input: I, options?: RequestOptions]): AsyncGenerator<E>
} & { route: RouteInfo }

export function streamRoute<I extends { stream?: boolean }, R, E>(ctx: RouteContext, path: PathsFor<'post'>): StreamRouteFn<typeof path, I, R, E> {
  const { m, nPath } = meta('post', path)
  const fn = (...args: unknown[]) => {
    const { pathArgs, input, options } = parseArgs(args, nPath, true)
    const { query, body } = splitInput(input, m, ctx.params)
    const req = { method: 'post' as const, path: buildPath(path, pathArgs), query, body, contentType: m.contentType, ...options }
    return input?.stream === false ? ctx.transport.request<R>(req) : ctx.transport.stream<E>(req)
  }
  return Object.assign(fn, { route: { method: 'post' as const, path } }) as unknown as StreamRouteFn<typeof path, I, R, E>
}

export type StreamOnlyRouteFn<P extends string, I, E> = ((
  ...args: [...PathArgs<P>, input?: I, options?: RequestOptions]
) => AsyncGenerator<E>) & { route: RouteInfo }

export function streamOnlyRoute<I, E>(ctx: RouteContext, path: PathsFor<'post'>): StreamOnlyRouteFn<typeof path, I, E> {
  const { m, nPath } = meta('post', path)
  const fn = (...args: unknown[]) => {
    const { pathArgs, input, options } = parseArgs(args, nPath, true)
    const { query, body } = splitInput(input, m, ctx.params)
    return ctx.transport.stream<E>({ method: 'post', path: buildPath(path, pathArgs), query, body, contentType: m.contentType, ...options })
  }
  return Object.assign(fn, { route: { method: 'post' as const, path } }) as unknown as StreamOnlyRouteFn<typeof path, I, E>
}
