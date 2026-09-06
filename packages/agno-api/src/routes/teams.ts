import { route, streamOnlyRoute, streamRoute, type RouteContext } from '../route'
import type { ResumeInput, TeamContinueInput, TeamRunInput, TeamRunOutput, TeamStreamEvent } from '../types'

export const teams = (ctx: RouteContext) => ({
  list: route(ctx, 'get', '/teams'),
  get: route(ctx, 'get', '/teams/{team_id}'),
  forkSession: route(ctx, 'post', '/teams/{team_id}/sessions/{session_id}/fork'),
  runs: {
    create: streamRoute<TeamRunInput, TeamRunOutput, TeamStreamEvent>()(ctx, '/teams/{team_id}/runs'),
    continue: streamRoute<TeamContinueInput, TeamRunOutput, TeamStreamEvent>()(ctx, '/teams/{team_id}/runs/{run_id}/continue'),
    resume: streamOnlyRoute<ResumeInput, TeamStreamEvent>()(ctx, '/teams/{team_id}/runs/{run_id}/resume'),
    cancel: route(ctx, 'post', '/teams/{team_id}/runs/{run_id}/cancel'),
    get: route<'get', '/teams/{team_id}/runs/{run_id}', TeamRunOutput>(ctx, 'get', '/teams/{team_id}/runs/{run_id}'),
    list: route<'get', '/teams/{team_id}/runs', TeamRunOutput[]>(ctx, 'get', '/teams/{team_id}/runs'),
    checkpoints: route(ctx, 'get', '/teams/{team_id}/runs/{run_id}/checkpoints'),
    checkpoint: route(ctx, 'get', '/teams/{team_id}/runs/{run_id}/checkpoints/{message_index}'),
  },
})
