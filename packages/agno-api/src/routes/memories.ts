import { route, type RouteContext } from '../route'

export const memories = (ctx: RouteContext) => ({
  list: route(ctx, 'get', '/memories'),
  create: route(ctx, 'post', '/memories'),
  deleteMany: route(ctx, 'delete', '/memories'),
  get: route(ctx, 'get', '/memories/{memory_id}'),
  update: route(ctx, 'patch', '/memories/{memory_id}'),
  delete: route(ctx, 'delete', '/memories/{memory_id}'),
  topics: route(ctx, 'get', '/memory_topics'),
  userStats: route(ctx, 'get', '/user_memory_stats'),
  optimize: route(ctx, 'post', '/optimize-memories'),
})
