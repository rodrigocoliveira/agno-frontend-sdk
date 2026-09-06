import { route, type RouteContext } from '../route'

export const sessions = (ctx: RouteContext) => ({
  list: route(ctx, 'get', '/sessions'),
  create: route(ctx, 'post', '/sessions'),
  deleteMany: route(ctx, 'delete', '/sessions'),
  get: route(ctx, 'get', '/sessions/{session_id}'),
  delete: route(ctx, 'delete', '/sessions/{session_id}'),
  update: route(ctx, 'patch', '/sessions/{session_id}'),
  rename: route(ctx, 'post', '/sessions/{session_id}/rename'),
  runs: route(ctx, 'get', '/sessions/{session_id}/runs'),
  run: route(ctx, 'get', '/sessions/{session_id}/runs/{run_id}'),
  media: route<'get', '/sessions/{session_id}/media/{storage_key}', Blob>(ctx, 'get', '/sessions/{session_id}/media/{storage_key}', { response: 'blob' }),
})
