// Compiled by `bun run typecheck` only. Positive cases must compile; negative cases use @ts-expect-error.
import { route, streamOnlyRoute, streamRoute, type BodyOf, type Op, type RouteContext } from '../src/route'
import { knowledge } from '../src/routes/knowledge'
import type { paths } from '../src/generated/openapi'
import type {
  AgentContinueInput,
  AgentRunEvent,
  AgentRunInput,
  AgentStreamEvent,
  ResumeInput,
  RunOutput,
  RunStatus,
  TeamContinueInput,
  TeamRunEvent,
  TeamRunInput,
  WorkflowContinueInput,
  WorkflowRunEvent,
  WorkflowRunInput,
} from '../src/types'

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

// ---------- knowledge.content.upload: typed response, not `unknown` ----------

const uploadResult = knowledge(rc).content.upload()
declare const uploadUnknown: unknown
// @ts-expect-error content.upload must return a typed response, not `unknown`
const uploadTyped: Awaited<typeof uploadResult> = uploadUnknown
void uploadResult; void uploadTyped

// ---------- hand-written stream input types must not drift from the OpenAPI bodies ----------

type Extra<I, P extends keyof paths> = Exclude<keyof I, keyof BodyOf<Op<P, 'post'>>>

const _d1: never = null as unknown as Extra<AgentRunInput, '/agents/{agent_id}/runs'>
const _d2: never = null as unknown as Extra<TeamRunInput, '/teams/{team_id}/runs'>
const _d3: never = null as unknown as Extra<WorkflowRunInput, '/workflows/{workflow_id}/runs'>
const _d4: never = null as unknown as Extra<AgentContinueInput, '/agents/{agent_id}/runs/{run_id}/continue'>
const _d5: never = null as unknown as Extra<TeamContinueInput, '/teams/{team_id}/runs/{run_id}/continue'>
const _d6: never = null as unknown as Extra<WorkflowContinueInput, '/workflows/{workflow_id}/runs/{run_id}/continue'>
const _d7: never = null as unknown as Extra<ResumeInput, '/agents/{agent_id}/runs/{run_id}/resume'>
void _d1; void _d2; void _d3; void _d4; void _d5; void _d6; void _d7
// @ts-expect-error a field the wire does not have must be caught
const _dBad: never = null as unknown as Extra<{ requirements?: unknown }, '/workflows/{workflow_id}/runs/{run_id}/continue'>
void _dBad
