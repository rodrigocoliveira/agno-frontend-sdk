import { describe, expect, test } from 'bun:test'
import { createAgnoApi } from '../src/client'
import { routes } from '../src/generated/routes.gen'

function collect(node: unknown, prefix: string, out: Map<string, string>) {
  if (typeof node === 'function' && 'route' in node) {
    const r = (node as { route: { method: string; path: string } }).route
    const key = `${r.method} ${r.path}`
    expect(out.has(key), `duplicate route ${key} at ${prefix} and ${out.get(key)}`).toBe(false)
    out.set(key, prefix)
    return
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) collect(v, prefix ? `${prefix}.${k}` : k, out)
  }
}

describe('contract: api tree ↔ OpenAPI manifest', () => {
  const api = createAgnoApi({ baseUrl: 'http://x' })
  const { request: _r, stream: _s, ...tree } = api
  const found = new Map<string, string>()
  collect(tree, '', found)

  test('every OpenAPI operation has a function', () => {
    const missing = Object.keys(routes).filter((k) => !found.has(k))
    expect(missing).toEqual([])
  })

  test('every function points at a real operation', () => {
    const extra = [...found.keys()].filter((k) => !(k in routes))
    expect(extra).toEqual([])
  })

  test('125 operations mapped', () => {
    expect(found.size).toBe(125)
  })
})
