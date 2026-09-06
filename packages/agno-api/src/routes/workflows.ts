import { route, streamOnlyRoute, streamRoute, type RouteContext } from '../route'
import type { ResumeInput, WorkflowContinueInput, WorkflowRunInput, WorkflowRunOutput, WorkflowStreamEvent } from '../types'

export const workflows = (ctx: RouteContext) => ({
  list: route(ctx, 'get', '/workflows'),
  get: route(ctx, 'get', '/workflows/{workflow_id}'),
  runs: {
    create: streamRoute<WorkflowRunInput, WorkflowRunOutput, WorkflowStreamEvent>()(ctx, '/workflows/{workflow_id}/runs'),
    continue: streamRoute<WorkflowContinueInput, WorkflowRunOutput, WorkflowStreamEvent>()(ctx, '/workflows/{workflow_id}/runs/{run_id}/continue'),
    resume: streamOnlyRoute<ResumeInput, WorkflowStreamEvent>()(ctx, '/workflows/{workflow_id}/runs/{run_id}/resume'),
    cancel: route(ctx, 'post', '/workflows/{workflow_id}/runs/{run_id}/cancel'),
    get: route<'get', '/workflows/{workflow_id}/runs/{run_id}', WorkflowRunOutput>(ctx, 'get', '/workflows/{workflow_id}/runs/{run_id}'),
    list: route<'get', '/workflows/{workflow_id}/runs', WorkflowRunOutput[]>(ctx, 'get', '/workflows/{workflow_id}/runs'),
  },
})
