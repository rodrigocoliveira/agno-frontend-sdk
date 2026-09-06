import { route, type RouteContext } from '../route'

export const registry = (ctx: RouteContext) => ({
  get: route(ctx, 'get', '/registry'),
})
