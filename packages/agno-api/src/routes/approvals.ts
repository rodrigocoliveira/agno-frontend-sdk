import { route, type RouteContext } from '../route'

export const approvals = (ctx: RouteContext) => ({
  list: route(ctx, 'get', '/approvals'),
  count: route(ctx, 'get', '/approvals/count'),
  get: route(ctx, 'get', '/approvals/{approval_id}'),
  status: route(ctx, 'get', '/approvals/{approval_id}/status'),
  delete: route(ctx, 'delete', '/approvals/{approval_id}'),
  resolve: route(ctx, 'post', '/approvals/{approval_id}/resolve'),
})
