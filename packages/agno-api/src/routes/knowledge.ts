import { route, type RouteContext, type RouteInfo } from '../route'
import type { RequestOptions } from '../transport'
import type { KnowledgeUploadInput } from '../types/inputs'

export const knowledge = (ctx: RouteContext) => ({
  content: {
    // The generated input type says `file?: string | null` because the OpenAPI spec encodes the
    // multipart binary field as `string`. Cast to a hand-written input type that types `file` as
    // `File | Blob | null` instead — the only input cast in the package.
    upload: route(ctx, 'post', '/knowledge/content') as unknown as ((input?: KnowledgeUploadInput, options?: RequestOptions) => Promise<unknown>) & { route: RouteInfo },
    list: route(ctx, 'get', '/knowledge/content'),
    deleteMany: route(ctx, 'delete', '/knowledge/content'),
    get: route(ctx, 'get', '/knowledge/content/{content_id}'),
    update: route(ctx, 'patch', '/knowledge/content/{content_id}'),
    delete: route(ctx, 'delete', '/knowledge/content/{content_id}'),
    refresh: route(ctx, 'post', '/knowledge/content/{content_id}/refresh'),
    status: route(ctx, 'get', '/knowledge/content/{content_id}/status'),
  },
  remoteContent: {
    create: route(ctx, 'post', '/knowledge/remote-content'),
  },
  search: route(ctx, 'post', '/knowledge/search'),
  config: route(ctx, 'get', '/knowledge/config'),
  sources: route(ctx, 'get', '/knowledge/{knowledge_id}/sources'),
  sourceFiles: route(ctx, 'get', '/knowledge/{knowledge_id}/sources/{source_id}/files'),
})
