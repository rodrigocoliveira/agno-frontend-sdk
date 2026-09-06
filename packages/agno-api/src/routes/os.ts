import { route, type RouteContext } from '../route'

export const os = (ctx: RouteContext) => ({
  health: route(ctx, 'get', '/health'),
  info: route(ctx, 'get', '/info'),
  config: route(ctx, 'get', '/config'),
})
