import { route, type RouteContext } from '../route'

export const traces = (ctx: RouteContext) => ({
  list: route(ctx, 'get', '/traces'),
  get: route(ctx, 'get', '/traces/{trace_id}'),
  search: route(ctx, 'post', '/traces/search'),
  filterSchema: route(ctx, 'get', '/traces/filter-schema'),
  sessionStats: route(ctx, 'get', '/trace_session_stats'),
})
