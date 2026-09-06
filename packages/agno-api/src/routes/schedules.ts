import { route, type RouteContext } from '../route'

export const schedules = (ctx: RouteContext) => ({
  list: route(ctx, 'get', '/schedules'),
  create: route(ctx, 'post', '/schedules'),
  get: route(ctx, 'get', '/schedules/{schedule_id}'),
  update: route(ctx, 'patch', '/schedules/{schedule_id}'),
  delete: route(ctx, 'delete', '/schedules/{schedule_id}'),
  enable: route(ctx, 'post', '/schedules/{schedule_id}/enable'),
  disable: route(ctx, 'post', '/schedules/{schedule_id}/disable'),
  trigger: route(ctx, 'post', '/schedules/{schedule_id}/trigger'),
  runs: {
    list: route(ctx, 'get', '/schedules/{schedule_id}/runs'),
    get: route(ctx, 'get', '/schedules/{schedule_id}/runs/{run_id}'),
  },
})
