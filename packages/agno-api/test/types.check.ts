// Compiled by `bun run typecheck` only. Positive cases must compile; negative cases use @ts-expect-error.
import type { AgentRunEvent, AgentStreamEvent, RunStatus, TeamRunEvent, WorkflowRunEvent } from '../src/types'

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
