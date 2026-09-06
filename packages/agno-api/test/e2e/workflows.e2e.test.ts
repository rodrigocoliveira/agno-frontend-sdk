import { expect, test } from 'bun:test'
import { api, drain, e2e, ids, uid } from './setup'

e2e('workflows (live)', () => {
  test('list, get, stream run', async () => {
    expect(Array.isArray(await api.workflows.list())).toBe(true)
    expect(await api.workflows.get(ids.workflow)).toBeTruthy()
    const events = await drain(api.workflows.runs.create(ids.workflow, { message: 'go', session_id: uid() }))
    expect(events[0]!.event).toBe('WorkflowStarted')
    expect(events.at(-1)!.event).toBe('WorkflowCompleted')
  })
})
