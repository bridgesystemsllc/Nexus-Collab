// ─── Generic HTTP client ─────────────────────────────────────
// A configurable HTTP client for connector integrations.
// Supports multiple auth types, custom headers, and timeouts.

import type { AuthType } from './catalog'
import type { ConnectorSecrets, ParsedConfig } from './secrets'

export interface HttpClientConfig {
  baseUrl: string
  authType: AuthType
  secrets: ConnectorSecrets
  apiKeyHeader?: string
  defaultHeaders?: Record<string, string>
  timeoutMs?: number
}

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  headers?: Record<string, string>
  body?: unknown
  query?: Record<string, string>
}

export interface HttpResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  body: unknown
  bodyText: string
  durationMs: number
}

export interface HttpError {
  code: string
  message: string
  status?: number
  retryable: boolean
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, string>): string {
  const base = baseUrl.replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${base}${cleanPath}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value)
    }
  }
  return url.toString()
}

function buildAuthHeaders(
  authType: AuthType,
  secrets: ConnectorSecrets,
  apiKeyHeader?: string
): Record<string, string> {
  const headers: Record<string, string> = {}

  switch (authType) {
    case 'API_KEY':
      if (secrets.apiKey) {
        const headerName = apiKeyHeader || 'X-API-Key'
        headers[headerName] = secrets.apiKey
      }
      break
    case 'BEARER':
      if (secrets.bearerToken || secrets.accessToken) {
        headers['Authorization'] = `Bearer ${secrets.bearerToken || secrets.accessToken}`
      }
      break
    case 'BASIC':
      if (secrets.basicUsername && secrets.basicPassword) {
        const encoded = Buffer.from(
          `${secrets.basicUsername}:${secrets.basicPassword}`
        ).toString('base64')
        headers['Authorization'] = `Basic ${encoded}`
      }
      break
    case 'NONE':
    case 'OAUTH2':
    case 'WEBHOOK_SECRET':
    default:
      break
  }

  return headers
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504
}

export function isCredentialsRejected(status: number): boolean {
  return status === 401 || status === 403
}

export async function executeHttpRequest(
  config: HttpClientConfig,
  request: HttpRequest
): Promise<HttpResponse> {
  const url = buildUrl(config.baseUrl, request.path, request.query)
  const authHeaders = buildAuthHeaders(config.authType, config.secrets, config.apiKeyHeader)
  const timeoutMs = config.timeoutMs ?? 30000

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(config.defaultHeaders || {}),
    ...authHeaders,
    ...(request.headers || {}),
  }

  if (request.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const startTime = Date.now()
  let response: Response
  let bodyText: string

  try {
    response = await fetch(url, {
      method: request.method,
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
    bodyText = await response.text()
  } catch (err) {
    const durationMs = Date.now() - startTime
    const isTimeout =
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError')

    throw {
      code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isTimeout
        ? `Request timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err),
      retryable: true,
    } as HttpError
  }

  const durationMs = Date.now() - startTime

  let body: unknown = bodyText
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json') && bodyText.trim()) {
    try {
      body = JSON.parse(bodyText)
    } catch {
      body = bodyText
    }
  }

  const responseHeaders: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    responseHeaders[key.toLowerCase()] = value
  })

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    body,
    bodyText,
    durationMs,
  }
}

export type HttpClient = ReturnType<typeof createHttpClient>

export function createHttpClient(config: HttpClientConfig) {
  return {
    config,
    async request(
      method: string,
      path: string,
      body?: unknown,
      headers?: Record<string, string>
    ) {
      return executeHttpRequest(config, {
        method: method.toUpperCase() as HttpRequest['method'],
        path,
        body,
        headers,
      })
    },
    async get(path: string, query?: Record<string, string>, headers?: Record<string, string>) {
      return executeHttpRequest(config, { method: 'GET', path, query, headers })
    },
    async post(path: string, body?: unknown, headers?: Record<string, string>) {
      return executeHttpRequest(config, { method: 'POST', path, body, headers })
    },
    async put(path: string, body?: unknown, headers?: Record<string, string>) {
      return executeHttpRequest(config, { method: 'PUT', path, body, headers })
    },
    async patch(path: string, body?: unknown, headers?: Record<string, string>) {
      return executeHttpRequest(config, { method: 'PATCH', path, body, headers })
    },
    async delete(path: string, headers?: Record<string, string>) {
      return executeHttpRequest(config, { method: 'DELETE', path, headers })
    },
  }
}

export function httpClientFromIntegration(
  config: ParsedConfig,
  secrets: ConnectorSecrets
): ReturnType<typeof createHttpClient> | null {
  const baseUrl = config.baseUrl || config.serverUrl
  if (!baseUrl) return null

  return createHttpClient({
    baseUrl,
    authType: config.authType || 'NONE',
    secrets,
    apiKeyHeader: config.apiKeyHeader,
    defaultHeaders: config.defaultHeaders,
    timeoutMs: config.timeoutMs,
  })
}
