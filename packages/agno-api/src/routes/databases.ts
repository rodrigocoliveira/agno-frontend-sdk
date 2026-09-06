import { route, type RouteContext } from '../route'

export const databases = (ctx: RouteContext) => ({
  migrateAll: route(ctx, 'post', '/databases/all/migrate'),
  migrate: route(ctx, 'post', '/databases/{db_id}/migrate'),
})
