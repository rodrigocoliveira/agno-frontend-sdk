import type { RunRequirement, ToolExecution } from '@rodrigocoliveira/agno-api'
import { fromServerStatus, type AnyEvent, type RunBase, type RunRowLike } from '../types'

export function emptyBase(over: Partial<RunBase> = {}): RunBase {
  return {
    id: '', sessionId: null, status: 'running', local: false,
    input: { message: '', files: [], media: null },
    content: '', reasoning: '', tools: [], requirements: null,
    media: { images: [], videos: [], audio: [], files: [] },
    citations: null, metrics: null, error: null, createdAt: null, eventIndex: null, raw: null,
    ...over,
  }
}

/** ISO string (RunSchema) or epoch seconds (RunOutput / events) → epoch seconds. */
export function toEpochSeconds(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const ms = Date.parse(v); return Number.isNaN(ms) ? null : ms / 1000 }
  return null
}

export function textOf(content: unknown): string {
  if (content == null) return ''
  return typeof content === 'string' ? content : JSON.stringify(content)
}

export function upsertTool(tools: ToolExecution[], tool: ToolExecution): ToolExecution[] {
  const i = tools.findIndex((t) => t.tool_call_id === tool.tool_call_id)
  if (i === -1) return [...tools, tool]
  const next = tools.slice(); next[i] = tool; return next
}

const isStr = (ev: AnyEvent) => ev.content_type == null || ev.content_type === 'str'
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const arr = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null)

/** Reducer for the agent event family (unprefixed names). Unknown events return the same reference. */
export function applyBaseEvent<R extends RunBase>(run: R, ev: AnyEvent): R {
  switch (ev.event) {
    case 'RunStarted':
      return { ...run, id: typeof ev.run_id === 'string' ? ev.run_id : run.id, sessionId: str(ev.session_id) ?? run.sessionId, status: 'running' }
    case 'RunContent': {
      const content = isStr(ev) && typeof ev.content === 'string' ? run.content + ev.content : run.content
      const rc = str(ev.reasoning_content)
      const reasoning = rc ? run.reasoning + rc : run.reasoning
      return content === run.content && reasoning === run.reasoning ? run : { ...run, content, reasoning }
    }
    case 'ReasoningContentDelta': {
      const rc = str(ev.reasoning_content)
      return rc ? { ...run, reasoning: run.reasoning + rc } : run
    }
    case 'ReasoningStep':
    case 'ReasoningCompleted': {
      const rc = str(ev.reasoning_content)
      return rc ? { ...run, reasoning: rc } : run
    }
    case 'ToolCallStarted':
    case 'ToolCallCompleted':
    case 'ToolCallError':
      return ev.tool && typeof ev.tool === 'object' ? { ...run, tools: upsertTool(run.tools, ev.tool as ToolExecution) } : run
    case 'RunPaused': {
      let tools = run.tools
      for (const t of (arr(ev.tools) ?? []) as ToolExecution[]) tools = upsertTool(tools, t)
      return { ...run, status: 'paused', tools, requirements: (arr(ev.requirements) as RunRequirement[] | null) ?? null }
    }
    case 'RunContinued':
      return { ...run, status: 'running' }
    case 'RunCompleted':
      return {
        ...run,
        status: 'completed',
        content: ev.content == null ? run.content : textOf(ev.content),
        reasoning: str(ev.reasoning_content) ?? run.reasoning,
        tools: (arr(ev.tools) as ToolExecution[] | null) ?? run.tools,
        requirements: null,
        media: {
          images: arr(ev.images) ?? run.media.images, videos: arr(ev.videos) ?? run.media.videos,
          audio: arr(ev.audio) ?? run.media.audio, files: arr(ev.files) ?? run.media.files,
        },
        citations: ev.citations ?? run.citations,
        metrics: ev.metrics ?? run.metrics,
        raw: ev,
      }
    case 'RunError':
      return { ...run, status: 'error', error: str(ev.error) ?? str(ev.content) ?? 'Run failed', raw: ev }
    case 'RunCancelled':
      return { ...run, status: 'cancelled', error: str(ev.reason), raw: ev }
    default:
      return run
  }
}

export function fromBaseRow<R extends RunBase>(run: R, row: RunRowLike): R {
  return {
    ...run,
    id: row.run_id,
    sessionId: row.session_id ?? run.sessionId,
    status: fromServerStatus(row.status),
    local: false,
    input: { message: typeof row.run_input === 'string' ? row.run_input : textOf(row.input), files: [], media: row.input_media ?? null },
    content: textOf(row.content),
    reasoning: row.reasoning_content ?? '',
    tools: row.tools ?? [],
    requirements: row.requirements ?? null,
    media: { images: row.images ?? [], videos: row.videos ?? [], audio: row.audio ?? [], files: row.files ?? [] },
    citations: row.citations ?? null,
    metrics: row.metrics ?? null,
    createdAt: toEpochSeconds(row.created_at),
    raw: row,
  }
}
