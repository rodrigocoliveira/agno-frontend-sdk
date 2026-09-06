import { expect, test } from 'bun:test'
import { api, drain, e2e, ids, uid } from './setup'

e2e('teams (live)', () => {
  test('stream run completes', async () => {
    const events = await drain(api.teams.runs.create(ids.team, { message: 'Say hi in one word.', session_id: uid() }))
    expect(events[0]!.event).toBe('TeamRunStarted')
    expect(events.at(-1)!.event).toBe('TeamRunCompleted')
  })

  test('HITL: TeamRunPaused → continue with requirements', async () => {
    const session_id = uid()
    const events = await drain(api.teams.runs.create(ids.team, { message: 'Use the tool that needs confirmation.', session_id }))
    const paused = events.find((e) => e.event === 'TeamRunPaused')
    expect(paused).toBeTruthy()
    if (paused?.event !== 'TeamRunPaused') return
    const requirements = (paused.requirements ?? []).map((r) => ({ ...r, tool_execution: { ...r.tool_execution, confirmed: true } }))
    const done = await drain(api.teams.runs.continue(ids.team, paused.run_id, { requirements, session_id }))
    expect(done.at(-1)!.event).toBe('TeamRunCompleted')
  })
})
