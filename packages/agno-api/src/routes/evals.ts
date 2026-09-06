import { route, type RouteContext } from '../route'

export const evals = (ctx: RouteContext) => ({
  list: route(ctx, 'get', '/eval-runs'),
  create: route(ctx, 'post', '/eval-runs'),
  deleteMany: route(ctx, 'delete', '/eval-runs'),
  get: route(ctx, 'get', '/eval-runs/{eval_run_id}'),
  update: route(ctx, 'patch', '/eval-runs/{eval_run_id}'),
})
