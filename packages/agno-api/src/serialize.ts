import type { ContentType, RouteMeta } from './generated/routes.gen'

export type Primitive = string | number | boolean

const PARAM_RE = /\{([^}]+)\}/g

export function buildPath(template: string, args: readonly (string | number)[]): string {
  const expected = template.match(PARAM_RE)?.length ?? 0
  if (args.length !== expected) {
    throw new TypeError(`${template}: expected ${expected} path param(s), got ${args.length}`)
  }
  let i = 0
  return template.replace(PARAM_RE, () => encodeURIComponent(String(args[i++])))
}

function scalar(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

export function buildQuery(query: Record<string, unknown> | undefined): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) for (const item of v) p.append(k, scalar(item))
    else p.append(k, scalar(v))
  }
  return p.toString()
}

export function splitInput(
  input: Record<string, unknown> | undefined,
  meta: RouteMeta,
  globals: Record<string, Primitive>,
): { query: Record<string, unknown>; body: Record<string, unknown> | undefined } {
  const query: Record<string, unknown> = {}
  const body: Record<string, unknown> = {}
  for (const k of meta.query) if (globals[k] !== undefined) query[k] = globals[k]
  for (const [k, v] of Object.entries(input ?? {})) {
    if (meta.query.includes(k)) {
      if (v !== undefined) query[k] = v
    } else if (meta.contentType) {
      body[k] = v
    } else {
      throw new TypeError(`unknown input key "${k}" for a route without body`)
    }
  }
  return { query, body: meta.contentType ? body : undefined }
}

const isBlob = (v: unknown): v is Blob => typeof Blob !== 'undefined' && v instanceof Blob

function formValue(v: unknown): string | Blob {
  return isBlob(v) ? v : scalar(v)
}

export function encodeBody(
  body: Record<string, unknown> | undefined,
  contentType: ContentType | null,
): { body: BodyInit | undefined; headers: Record<string, string> } {
  if (!body || !contentType) return { body: undefined, headers: {} }

  if (contentType === 'application/json') {
    return { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
  }

  if (contentType === 'multipart/form-data') {
    const fd = new FormData()
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null) continue
      if (Array.isArray(v) && v.length > 0 && v.every(isBlob)) for (const b of v) fd.append(k, b)
      else fd.append(k, formValue(v))
    }
    return { body: fd, headers: {} } // fetch sets the multipart boundary
  }

  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue
    if (isBlob(v)) throw new TypeError(`"${k}": files are not allowed in a form-urlencoded body`)
    p.append(k, scalar(v))
  }
  return { body: p, headers: {} } // fetch sets application/x-www-form-urlencoded;charset=UTF-8
}
