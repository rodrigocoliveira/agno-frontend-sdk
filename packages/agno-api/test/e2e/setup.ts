import { describe } from 'bun:test'
import { createAgnoApi } from '../../src/client'

export const url = process.env.AGNO_URL
export const e2e = url ? describe : describe.skip
export const ids = {
  agent: process.env.AGNO_AGENT_ID ?? 'test-agent',
  team: process.env.AGNO_TEAM_ID ?? 'test-team',
  workflow: process.env.AGNO_WORKFLOW_ID ?? 'test-workflow',
}
export const api = createAgnoApi({ baseUrl: url ?? 'http://unused', token: process.env.AGNO_TOKEN })
export const uid = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export async function drain<E extends { event: string }>(it: AsyncIterable<E>) {
  const events: E[] = []
  for await (const e of it) events.push(e)
  return events
}
