// Compiled by `bun run typecheck` only. Positive cases must compile; negative cases use @ts-expect-error.
import { route, streamOnlyRoute, streamRoute, type RouteContext } from '../src/route'
import type { AgentRunEvent, AgentRunInput, AgentStreamEvent, ResumeInput, RunOutput, RunStatus, TeamRunEvent, WorkflowRunEvent, TeamRunInput, WorkflowContinueInput } from '../src/types'

declare const ev: AgentRunEvent
if (ev.event === 'RunContent') {
  const s: string = ev.content
  void s
}
if (ev.event === 'RunPaused') {
  ev.tools?.[0]?.tool_call_id
  ev.requirements?.[0]?.tool_execution.tool_name
}
if (ev.event === 'ToolCallStarted') {
  const id: string = ev.tool.tool_call_id
  void id
}
// @ts-expect-error unknown event name
const bad: AgentRunEvent['event'] = 'TeamRunContent'
void bad

declare const tev: TeamRunEvent
if (tev.event === 'TeamRunPaused') tev.requirements?.[0]?.member_agent_id

declare const wev: WorkflowRunEvent
if (wev.event === 'StepPaused') wev.requirements

declare const sev: AgentStreamEvent
if (sev.event === 'catch_up') {
  const n: number = sev.missed_events
  void n
}
if (sev.event === 'error') {
  const m: string = sev.error
  void m
}

const st: RunStatus = 'PAUSED'
void st
// @ts-expect-error status is upper-case on the wire
const st2: RunStatus = 'paused'
void st2

const teamRun: TeamRunInput = { message: 'hi', monitor: false }
void teamRun

const wfContinue: WorkflowContinueInput = { step_requirements: [], stream: false }
void wfContinue
// @ts-expect-error workflow continue has no `requirements` field
const wfBad: WorkflowContinueInput = { requirements: [] }
void wfBad
// @ts-expect-error workflow continue has no `fork` field
const wfBad2: WorkflowContinueInput = { fork: true }
void wfBad2

// ---------- route() / streamRoute() ----------

declare const rc: RouteContext

const getAgent = route(rc, 'get', '/agents/{agent_id}')
getAgent('a')
getAgent('a', { signal: undefined })
// @ts-expect-error missing path param
getAgent()
// @ts-expect-error no input on this route
getAgent('a', { user_id: 'u' })

const listSessions = route(rc, 'get', '/sessions')
listSessions()
listSessions({ type: 'agent', limit: 1 })
listSessions(undefined, { headers: {} })
// @ts-expect-error unknown query key
listSessions({ nope: 1 })

const rename = route(rc, 'post', '/sessions/{session_id}/rename')
rename('s', { session_name: 'x' })
rename('s', { session_name: 'x', user_id: 'u' })
// @ts-expect-error session_name is required
rename('s', {})

// @ts-expect-error /health has no post
route(rc, 'post', '/health')

const createRun = streamRoute<AgentRunInput, RunOutput, AgentStreamEvent>()(rc, '/agents/{agent_id}/runs')
const p: Promise<RunOutput> = createRun('a', { message: 'oi', stream: false })
const it: AsyncGenerator<AgentStreamEvent> = createRun('a', { message: 'oi' })
void p; void it
// @ts-expect-error message is required
createRun('a', {})
// @ts-expect-error missing path param on a stream route
createRun({ message: 'oi' })
// @ts-expect-error too many path params on a stream route
createRun('a', 'b', { message: 'oi' })

const resume = streamOnlyRoute<ResumeInput, AgentStreamEvent>()(rc, '/agents/{agent_id}/runs/{run_id}/resume')
resume('a', 'r')
resume('a', 'r', { last_event_index: 3 })
// @ts-expect-error resume needs two path params
resume('a')
