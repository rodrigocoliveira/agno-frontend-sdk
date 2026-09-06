export interface ValidationErrorDetail {
  loc: (string | number)[]
  msg: string
  type: string
}

export interface AgnoApiErrorInit {
  status: number
  method: string
  path: string
  detail?: unknown
  errorId?: string
  errorType?: string
  headers?: Headers
  body?: unknown
  message?: string
  cause?: unknown
}

export class AgnoApiError extends Error {
  readonly status: number
  readonly detail: unknown
  readonly errorId?: string
  readonly errorType?: string
  readonly validation?: ValidationErrorDetail[]
  readonly method: string
  readonly path: string
  readonly headers: Headers
  readonly body: unknown

  constructor(init: AgnoApiErrorInit) {
    const validation = isValidationList(init.detail) ? init.detail : undefined
    super(init.message ?? buildMessage(init, validation), { cause: init.cause })
    this.name = 'AgnoApiError'
    this.status = init.status
    this.detail = init.detail
    this.errorId = init.errorId
    this.errorType = init.errorType
    this.validation = validation
    this.method = init.method
    this.path = init.path
    this.headers = init.headers ?? new Headers()
    this.body = init.body
  }
}

function isValidationList(d: unknown): d is ValidationErrorDetail[] {
  return Array.isArray(d) && d.length > 0 && d.every((x) => x && typeof x === 'object' && 'loc' in x && 'msg' in x)
}

function buildMessage(init: AgnoApiErrorInit, validation?: ValidationErrorDetail[]): string {
  if (typeof init.detail === 'string' && init.detail.length > 0) return init.detail
  if (validation) return `${validation[0]!.loc.join('.')}: ${validation[0]!.msg}`
  return `${init.method} ${init.path} failed with ${init.status}`
}

export function isAgnoApiError(e: unknown): e is AgnoApiError {
  return e instanceof AgnoApiError
}

export async function errorFromResponse(res: Response, method: string, path: string): Promise<AgnoApiError> {
  const text = await res.text().catch(() => '')
  let body: unknown = text
  if (res.headers.get('content-type')?.includes('json')) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  const obj = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined
  // Some AgentOS errors carry the human-readable reason under `message` instead of `detail`.
  const detail = obj ? (obj.detail ?? (typeof obj.message === 'string' ? obj.message : undefined)) : text
  const isNonJsonText = obj === undefined
  return new AgnoApiError({
    status: res.status,
    method,
    path,
    detail,
    errorId: typeof obj?.error_id === 'string' ? obj.error_id : undefined,
    errorType: typeof obj?.error_type === 'string' ? obj.error_type : undefined,
    headers: res.headers,
    body,
    message: isNonJsonText ? `${method} ${path} failed with ${res.status}` : undefined,
  })
}

export function networkError(method: string, path: string, cause: unknown): AgnoApiError {
  const reason = cause instanceof Error ? cause.message : String(cause)
  return new AgnoApiError({ status: 0, method, path, detail: reason, message: `${method} ${path} failed: ${reason}`, cause })
}
