import { describe, expect, test } from 'bun:test'
import { buildPath, buildQuery, encodeBody, splitInput } from '../src/serialize'

describe('buildPath', () => {
  test('replaces params in order and encodes', () => {
    expect(buildPath('/agents/{agent_id}/runs/{run_id}', ['a b', 42])).toBe('/agents/a%20b/runs/42')
  })
  test('throws when arg count mismatches', () => {
    expect(() => buildPath('/agents/{agent_id}', [])).toThrow(/expected 1 path param/)
  })
})

describe('buildQuery', () => {
  test('skips null/undefined, repeats arrays, stringifies booleans', () => {
    expect(buildQuery({ a: 1, b: undefined, c: null, d: [1, 2], e: true, f: 'x y' })).toBe('a=1&d=1&d=2&e=true&f=x+y')
  })
  test('empty', () => {
    expect(buildQuery(undefined)).toBe('')
    expect(buildQuery({ a: undefined })).toBe('')
  })
})

describe('splitInput', () => {
  const meta = { query: ['type', 'db_id'], body: ['session_name'], contentType: 'application/json' } as const

  test('routes keys to query or body by manifest', () => {
    expect(splitInput({ type: 'agent', session_name: 'x' }, meta, {})).toEqual({
      query: { type: 'agent' },
      body: { session_name: 'x' },
    })
  })
  test('applies globals only where the route accepts them; call wins', () => {
    expect(splitInput({ type: 'team' }, meta, { db_id: 'main', user_id: 'u1', type: 'agent' })).toEqual({
      query: { db_id: 'main', type: 'team' },
      body: {},
    })
  })
  test('undefined in call does not erase a global', () => {
    expect(splitInput({ db_id: undefined }, meta, { db_id: 'main' }).query).toEqual({ db_id: 'main' })
  })
  test('body is undefined for routes without body', () => {
    expect(splitInput({ session_id: 's' }, { query: ['session_id'], body: [], contentType: null }, {})).toEqual({
      query: { session_id: 's' },
      body: undefined,
    })
  })
  test('throws on a body key for a route without body', () => {
    expect(() => splitInput({ nope: 1 }, { query: [], body: [], contentType: null }, {})).toThrow(/unknown input key "nope"/)
  })
  test('a global lands in the body when the route takes that key in the body', () => {
    const m = { query: [], body: ['memory', 'user_id'], contentType: 'application/json' } as const
    expect(splitInput({ memory: 'm' }, m, { user_id: 'u1' })).toEqual({ query: {}, body: { user_id: 'u1', memory: 'm' } })
  })
  test('a call value wins over a body global, and undefined does not erase it', () => {
    const m = { query: [], body: ['memory', 'user_id'], contentType: 'application/json' } as const
    expect(splitInput({ user_id: 'u2' }, m, { user_id: 'u1' }).body).toEqual({ user_id: 'u2' })
    expect(splitInput({ user_id: undefined }, m, { user_id: 'u1' }).body).toEqual({ user_id: 'u1' })
  })
  test('a global in neither list is not applied', () => {
    const m = { query: ['type'], body: ['memory'], contentType: 'application/json' } as const
    expect(splitInput({ memory: 'm' }, m, { user_id: 'u1' })).toEqual({ query: {}, body: { memory: 'm' } })
  })
  test('an undefined value for an unknown key is skipped on a bodyless route', () => {
    expect(splitInput({ user_id: 'u', limit: undefined }, { query: ['user_id'], body: [], contentType: null }, {})).toEqual({
      query: { user_id: 'u' },
      body: undefined,
    })
  })
})

describe('encodeBody', () => {
  test('json', () => {
    const r = encodeBody({ a: 1, b: undefined }, 'application/json')
    expect(r.body).toBe('{"a":1}')
    expect(r.headers).toEqual({ 'content-type': 'application/json' })
  })
  test('no body', () => {
    expect(encodeBody(undefined, 'application/json')).toEqual({ body: undefined, headers: {} })
    expect(encodeBody({ a: 1 }, null)).toEqual({ body: undefined, headers: {} })
  })
  test('form-urlencoded: primitives, json for objects/arrays, skips null', () => {
    const r = encodeBody(
      { tools: [{ tool_call_id: 't1', confirmed: true }], stream: false, input: null, continue_from: 'end' },
      'application/x-www-form-urlencoded',
    )
    const p = r.body as URLSearchParams
    expect(p).toBeInstanceOf(URLSearchParams)
    expect(p.get('tools')).toBe('[{"tool_call_id":"t1","confirmed":true}]')
    expect(p.get('stream')).toBe('false')
    expect(p.get('continue_from')).toBe('end')
    expect(p.has('input')).toBe(false)
    expect(r.headers).toEqual({})
  })
  test('multipart: blobs intact, blob arrays repeated, objects as json', () => {
    const f1 = new File(['a'], 'a.txt', { type: 'text/plain' })
    const f2 = new File(['b'], 'b.txt', { type: 'text/plain' })
    const r = encodeBody({ message: 'oi', files: [f1, f2], factory_input: { k: 1 }, stream: true }, 'multipart/form-data')
    const fd = r.body as FormData
    expect(fd).toBeInstanceOf(FormData)
    expect(fd.get('message')).toBe('oi')
    expect(fd.getAll('files')).toHaveLength(2)
    expect((fd.getAll('files')[0] as File).name).toBe('a.txt')
    expect(fd.get('factory_input')).toBe('{"k":1}')
    expect(fd.get('stream')).toBe('true')
    expect(r.headers).toEqual({})
  })
  test('multipart: an empty array is omitted entirely', () => {
    const r = encodeBody({ message: 'oi', files: [] }, 'multipart/form-data')
    const fd = r.body as FormData
    expect(fd.has('files')).toBe(false)
    expect(fd.get('message')).toBe('oi')
  })
  test('multipart: an array mixing files and non-files throws', () => {
    const f1 = new File(['a'], 'a.txt', { type: 'text/plain' })
    expect(() => encodeBody({ files: [f1, 'x'] }, 'multipart/form-data')).toThrow(
      /"files": an array of files must contain only File\/Blob values/,
    )
  })
  test('multipart: an array with no files keeps the JSON-string behaviour', () => {
    const r = encodeBody({ tags: ['a', 'b'] }, 'multipart/form-data')
    expect((r.body as FormData).get('tags')).toBe('["a","b"]')
  })
})
