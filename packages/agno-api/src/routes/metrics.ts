import { route, type RouteContext } from '../route'

export const metrics = (ctx: RouteContext) => ({
  get: route(ctx, 'get', '/metrics'),
  refresh: route(ctx, 'post', '/metrics/refresh'),
  refreshStatus: route(ctx, 'get', '/metrics/refresh/status'),
})
