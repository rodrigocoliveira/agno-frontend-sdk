import { describe, expect, test } from 'bun:test'
import { AgnoApiError, errorFromResponse, isAgnoApiError, networkError } from '../src/errors'

const res = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json', ...headers },
  })

describe('errorFromResponse', () => {
  test('string detail with error_id and error_type', async () => {
    const e = await errorFromResponse(res({ detail: 'Not found', error_id: 'agent_not_found', error_type: 'not_found' }, 404), 'GET', '/agents/x')
    expect(e).toBeInstanceOf(AgnoApiError)
    expect(e.status).toBe(404)
    expect(e.detail).toBe('Not found')
    expect(e.errorId).toBe('agent_not_found')
    expect(e.errorType).toBe('not_found')
    expect(e.message).toBe('Not found')
    expect(e.method).toBe('GET')
    expect(e.path).toBe('/agents/x')
    expect(e.validation).toBeUndefined()
  })

  test('422 with field list fills validation and message', async () => {
    const detail = [{ loc: ['body', 'endpoint'], msg: 'Value error, must be a path', type: 'value_error' }]
    const e = await errorFromResponse(res({ detail }, 422), 'POST', '/schedules')
    expect(e.validation).toEqual(detail)
    expect(e.message).toBe('body.endpoint: Value error, must be a path')
  })

  test('non-JSON body keeps raw text and generic message', async () => {
    const e = await errorFromResponse(res('Bad Gateway', 502), 'GET', '/health')
    expect(e.body).toBe('Bad Gateway')
    expect(e.detail).toBe('Bad Gateway')
    expect(e.message).toBe('GET /health failed with 502')
  })

  test('exposes response headers (Retry-After)', async () => {
    const e = await errorFromResponse(res({ detail: 'queue full' }, 429, { 'retry-after': '3' }), 'POST', '/agents/a/runs')
    expect(e.headers.get('retry-after')).toBe('3')
  })

  test('networkError has status 0 and keeps cause', () => {
    const cause = new TypeError('fetch failed')
    const e = networkError('GET', '/health', cause)
    expect(e.status).toBe(0)
    expect(e.cause).toBe(cause)
    expect(e.message).toBe('GET /health failed: fetch failed')
  })

  test('isAgnoApiError', () => {
    expect(isAgnoApiError(networkError('GET', '/x', new Error('boom')))).toBe(true)
    expect(isAgnoApiError(new Error('x'))).toBe(false)
  })

  test('JSON object without detail → undefined detail and generic message', async () => {
    const e = await errorFromResponse(res({ foo: 'bar' }, 500), 'GET', '/x')
    expect(e.detail).toBeUndefined()
    expect(e.message).toBe('GET /x failed with 500')
    expect(e.body).toEqual({ foo: 'bar' })
  })

  test('JSON array body is not treated as an error object', async () => {
    const e = await errorFromResponse(res([1, 2], 500), 'GET', '/x')
    expect(e.validation).toBeUndefined()
    expect(e.message).toBe('GET /x failed with 500')
    expect(e.body).toEqual([1, 2])
  })
})
