import type { StepRequirement, ToolExecution } from '@rodrigocoliveira/agno-api'
import type { AnyEvent, RunRowLike, StepRun, WorkflowRun } from '../types'
import { emptyBase, fromBaseRow, textOf, toEpochSeconds, upsertTool } from './base'

export function createWorkflowRun(workflowId: string, over: Partial<WorkflowRun> = {}): WorkflowRun {
  return { ...emptyBase(), kind: 'workflow', workflowId, steps: [], stepRequirements: null, pauseKind: null, ...over }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const stepKey = (ev: AnyEvent): string | null => str(ev.step_id) ?? str(ev.step_name)

function upsertStep(steps: StepRun[], id: string, seed: Partial<StepRun>, patch: (s: StepRun) => StepRun): StepRun[] {
  const i = steps.findIndex((s) => s.id === id)
  const current: StepRun = i === -1
    ? { status: 'running', content: '', tools: [], executorRunId: null, raw: null, ...seed, id, name: seed.name ?? id, index: seed.index ?? steps.length }
    : steps[i]!
  const next = patch(current)
  if (i !== -1 && next === current) return steps
  const out = steps.slice()
  if (i === -1) out.push(next); else out[i] = next
  return out
}

const seedFrom = (ev: AnyEvent): Partial<StepRun> => ({
  name: str(ev.step_name) ?? undefined,
  index: ev.step_index == null || Number.isNaN(Number(ev.step_index)) ? undefined : Number(ev.step_index),
})

/** step_results[] → StepRun[] (merge by step_id, then step_name). */
export function reconcileSteps(steps: StepRun[], stepResults: unknown): StepRun[] {
  if (!Array.isArray(stepResults)) return steps
  let out = steps
  stepResults.forEach((r, i) => {
    if (!r || typeof r !== 'object') return
    const res = r as Record<string, unknown>
    const id = str(res.step_id) ?? str(res.step_name)
    if (!id) return
    out = upsertStep(out, id, { name: str(res.step_name) ?? undefined, index: i }, (s) => ({
      ...s,
      status: res.success === false ? 'error' : 'completed',
      content: res.content == null ? s.content : textOf(res.content),
      executorRunId: str(res.step_run_id) ?? s.executorRunId,
      raw: res,
    }))
  })
  return out
}

function applyExecutorEvent(run: WorkflowRun, ev: AnyEvent): WorkflowRun {
  const id = stepKey(ev)
  if (!id) return run
  const name = ev.event.startsWith('Team') ? ev.event.slice(4) : ev.event
  const steps = upsertStep(run.steps, id, seedFrom(ev), (s) => {
    switch (name) {
      case 'RunStarted': return { ...s, executorRunId: str(ev.run_id) ?? s.executorRunId }
      case 'RunContent': return (ev.content_type == null || ev.content_type === 'str') && typeof ev.content === 'string' ? { ...s, content: s.content + ev.content } : s
      case 'RunCompleted': return { ...s, content: ev.content == null ? s.content : textOf(ev.content), executorRunId: str(ev.run_id) ?? s.executorRunId }
      case 'ToolCallStarted': case 'ToolCallCompleted': case 'ToolCallError':
        return ev.tool && typeof ev.tool === 'object' ? { ...s, tools: upsertTool(s.tools, ev.tool as ToolExecution) } : s
      default: return s
    }
  })
  return steps === run.steps ? run : { ...run, steps }
}

export function applyWorkflowEvent(run: WorkflowRun, ev: AnyEvent): WorkflowRun {
  if (typeof ev.run_id === 'string' && ev.run_id !== run.id && ev.workflow_run_id === run.id) return applyExecutorEvent(run, ev)
  const setStep = (status: StepRun['status'], extra: (s: StepRun) => Partial<StepRun> = () => ({})) => {
    const id = stepKey(ev)
    return id ? upsertStep(run.steps, id, seedFrom(ev), (s) => ({ ...s, status, ...extra(s) })) : run.steps
  }
  switch (ev.event) {
    case 'WorkflowStarted':
      return { ...run, id: typeof ev.run_id === 'string' ? ev.run_id : run.id, sessionId: str(ev.session_id) ?? run.sessionId, status: 'running' }
    case 'StepStarted':
      return { ...run, steps: setStep('running') }
    case 'StepCompleted':
      return { ...run, steps: setStep('completed', (s) => ({ content: ev.content == null ? s.content : textOf(ev.content), raw: ev.step_response ?? s.raw })) }
    case 'StepError':
      return { ...run, steps: setStep('error') }
    case 'StepPaused': case 'StepExecutorPaused': case 'ConditionPaused': case 'RouterPaused':
      return { ...run, steps: setStep('paused') }
    case 'StepContinued': case 'StepExecutorContinued':
      return { ...run, status: 'running', steps: setStep('running') }
    case 'WorkflowPaused':
      return {
        ...run, status: 'paused',
        stepRequirements: (Array.isArray(ev.step_requirements) ? ev.step_requirements as StepRequirement[] : null),
        pauseKind: ev.pause_kind === 'step' || ev.pause_kind === 'executor' ? ev.pause_kind : null,
        steps: reconcileSteps(run.steps, ev.step_results),
      }
    case 'WorkflowCompleted':
      return {
        ...run, status: 'completed',
        content: ev.content == null ? run.content : textOf(ev.content),
        steps: reconcileSteps(run.steps, ev.step_results),
        stepRequirements: null, pauseKind: null,
        metrics: ev.metrics ?? run.metrics,
        media: {
          images: Array.isArray(ev.images) ? ev.images : run.media.images, videos: Array.isArray(ev.videos) ? ev.videos : run.media.videos,
          audio: Array.isArray(ev.audio) ? ev.audio : run.media.audio, files: Array.isArray(ev.files) ? ev.files : run.media.files,
        },
        raw: ev,
      }
    case 'WorkflowError':
      return { ...run, status: 'error', error: str(ev.error) ?? str(ev.content) ?? 'Workflow failed', raw: ev }
    case 'WorkflowCancelled':
      return { ...run, status: 'cancelled', error: str(ev.reason), raw: ev }
    default:
      return run
  }
}

export function fromWorkflowRow(row: RunRowLike): WorkflowRun {
  const base = fromBaseRow(createWorkflowRun(row.workflow_id ?? ''), row)
  return {
    ...base,
    createdAt: toEpochSeconds(row.created_at),
    steps: reconcileSteps([], row.step_results),
    stepRequirements: row.step_requirements ?? null,
    pauseKind: row.pause_kind === 'step' || row.pause_kind === 'executor' ? row.pause_kind : null,
  }
}
