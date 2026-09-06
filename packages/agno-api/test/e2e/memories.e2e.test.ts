import { expect, test } from 'bun:test'
import { api, e2e, uid } from './setup'

e2e('memories (live)', () => {
  test('create → get → update → delete', async () => {
    const user_id = uid()
    const created = await api.memories.create({ memory: 'likes tea', topics: ['drinks'], user_id })
    const id = (created as { memory_id: string }).memory_id
    expect(id).toBeTruthy()
    await api.memories.update(id, { memory: 'likes coffee', topics: ['drinks'], user_id })
    const got = await api.memories.get(id, { user_id })
    expect(JSON.stringify(got)).toContain('coffee')
    await api.memories.delete(id, { user_id })
  })
})
