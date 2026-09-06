import { describe, expect, test } from 'bun:test'
import { routes } from '../src/generated/routes.gen'

describe('routes manifest', () => {
  test('has all 125 operations', () => {
    expect(Object.keys(routes)).toHaveLength(125)
  })

  test('query-only route', () => {
    expect(routes['get /agents/{agent_id}/runs']).toEqual({ query: ['session_id', 'status'], body: [], contentType: null })
  })

  test('query + json body route', () => {
    expect(routes['post /sessions']).toEqual({
      query: ['type', 'db_id'],
      body: ['agent_id', 'metadata', 'session_id', 'session_name', 'session_state', 'team_id', 'user_id', 'workflow_id'],
      contentType: 'application/json',
    })
  })

  test('multipart and form routes', () => {
    expect(routes['post /agents/{agent_id}/runs'].contentType).toBe('multipart/form-data')
    expect(routes['post /agents/{agent_id}/runs/{run_id}/continue'].contentType).toBe('application/x-www-form-urlencoded')
    expect(routes['post /knowledge/content']).toEqual({
      query: ['db_id', 'knowledge_id'],
      body: ['chunk_overlap', 'chunk_size', 'chunker', 'description', 'file', 'metadata', 'name', 'reader_id', 'text_content', 'url'],
      contentType: 'multipart/form-data',
    })
  })

  test('body keys are sorted and never overlap the query keys', () => {
    for (const [key, meta] of Object.entries(routes)) {
      expect([...meta.body].sort(), key).toEqual([...meta.body])
      expect(meta.body.filter((b) => (meta.query as readonly string[]).includes(b)), key).toEqual([])
      if (meta.contentType === null) expect(meta.body, key).toEqual([])
    }
  })

  test('no query key collides with a body key', async () => {
    const spec = await Bun.file(new URL('../openapi/agentos-v3.json', import.meta.url)).json()
    for (const [path, methods] of Object.entries<any>(spec.paths)) {
      for (const [method, op] of Object.entries<any>(methods)) {
        const query = (op.parameters ?? []).filter((p: any) => p.in === 'query').map((p: any) => p.name)
        const content = op.requestBody?.content ?? {}
        let schema = Object.values<any>(content)[0]?.schema ?? {}
        if (schema.$ref) schema = spec.components.schemas[schema.$ref.split('/').pop()]
        const bodyKeys = Object.keys(schema.properties ?? {})
        const clash = query.filter((q: string) => bodyKeys.includes(q))
        expect(clash, `${method} ${path}`).toEqual([])
      }
    }
  })
})
