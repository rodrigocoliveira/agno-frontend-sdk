import { route, type RouteContext } from '../route'

export const serviceAccounts = (ctx: RouteContext) => ({
  list: route(ctx, 'get', '/service-accounts'),
  create: route(ctx, 'post', '/service-accounts'),
  delete: route(ctx, 'delete', '/service-accounts/{service_account_id}'),
})
