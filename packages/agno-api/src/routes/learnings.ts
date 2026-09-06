import { route, type RouteContext } from '../route'

export const learnings = (ctx: RouteContext) => ({
  list: route(ctx, 'get', '/learnings'),
  create: route(ctx, 'post', '/learnings'),
  get: route(ctx, 'get', '/learnings/{learning_id}'),
  update: route(ctx, 'patch', '/learnings/{learning_id}'),
  delete: route(ctx, 'delete', '/learnings/{learning_id}'),
  users: route(ctx, 'get', '/learnings/users'),
  deleteUser: route(ctx, 'delete', '/learnings/users/{user_id}'),
})
