import { expect, test } from 'bun:test'
import { api, e2e } from './setup'

e2e('components (live)', () => {
  test('list and read current config', async () => {
    const list = await api.components.list({ limit: 5 })
    expect(list).toBeTruthy()
    const first = (list as { data?: { component_id: string }[] }).data?.[0]
    if (!first) return
    expect(await api.components.get(first.component_id)).toBeTruthy()
    expect(await api.components.configs.current(first.component_id)).toBeTruthy()
  })
})
