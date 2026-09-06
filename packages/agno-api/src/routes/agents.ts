import { route, streamOnlyRoute, streamRoute, type RouteContext } from '../route'
import type { AgentContinueInput, AgentRunInput, AgentStreamEvent, ResumeInput, RunOutput } from '../types'

export const agents = (ctx: RouteContext) => ({
  list: route(ctx, 'get', '/agents'),
  get: route(ctx, 'get', '/agents/{agent_id}'),
  forkSession: route(ctx, 'post', '/agents/{agent_id}/sessions/{session_id}/fork'),
  runs: {
    create: streamRoute<AgentRunInput, RunOutput, AgentStreamEvent>()(ctx, '/agents/{agent_id}/runs'),
    continue: streamRoute<AgentContinueInput, RunOutput, AgentStreamEvent>()(ctx, '/agents/{agent_id}/runs/{run_id}/continue'),
    resume: streamOnlyRoute<ResumeInput, AgentStreamEvent>()(ctx, '/agents/{agent_id}/runs/{run_id}/resume'),
    cancel: route(ctx, 'post', '/agents/{agent_id}/runs/{run_id}/cancel'),
    get: route<'get', '/agents/{agent_id}/runs/{run_id}', RunOutput>(ctx, 'get', '/agents/{agent_id}/runs/{run_id}'),
    list: route<'get', '/agents/{agent_id}/runs', RunOutput[]>(ctx, 'get', '/agents/{agent_id}/runs'),
    checkpoints: route(ctx, 'get', '/agents/{agent_id}/runs/{run_id}/checkpoints'),
    checkpoint: route(ctx, 'get', '/agents/{agent_id}/runs/{run_id}/checkpoints/{message_index}'),
  },
})
