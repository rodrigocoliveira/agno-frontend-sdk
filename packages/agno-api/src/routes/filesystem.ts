import { route, type RouteContext } from '../route'

export const filesystem = (ctx: RouteContext) => ({
  files: route(ctx, 'get', '/filesystem/files'),
  entries: route(ctx, 'get', '/filesystem/entries'),
  content: route(ctx, 'get', '/filesystem/content'),
  search: route(ctx, 'get', '/filesystem/search'),
})
