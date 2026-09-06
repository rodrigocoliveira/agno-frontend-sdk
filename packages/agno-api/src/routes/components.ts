import { route, type RouteContext } from '../route'

export const components = (ctx: RouteContext) => ({
  list: route(ctx, 'get', '/components'),
  create: route(ctx, 'post', '/components'),
  get: route(ctx, 'get', '/components/{component_id}'),
  update: route(ctx, 'patch', '/components/{component_id}'),
  delete: route(ctx, 'delete', '/components/{component_id}'),
  restore: route(ctx, 'post', '/components/{component_id}/restore'),
  configs: {
    list: route(ctx, 'get', '/components/{component_id}/configs'),
    create: route(ctx, 'post', '/components/{component_id}/configs'),
    get: route(ctx, 'get', '/components/{component_id}/configs/{version}'),
    update: route(ctx, 'patch', '/components/{component_id}/configs/{version}'),
    delete: route(ctx, 'delete', '/components/{component_id}/configs/{version}'),
    current: route(ctx, 'get', '/components/{component_id}/configs/current'),
    setCurrent: route(ctx, 'post', '/components/{component_id}/configs/{version}/set-current'),
  },
})
