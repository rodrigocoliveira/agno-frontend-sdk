import { route, type RouteContext } from '../route'

/** The captured spec was taken with the queue backend disabled; these are typed as the spec says and are not exercised in E2E. */
export const queue = (ctx: RouteContext) => ({
  get: route(ctx, 'get', '/queue'),
  put: route(ctx, 'put', '/queue'),
  post: route(ctx, 'post', '/queue'),
  patch: route(ctx, 'patch', '/queue'),
  delete: route(ctx, 'delete', '/queue'),
})
