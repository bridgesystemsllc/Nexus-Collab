// ─── Response masking ────────────────────────────────────────
// Sanitize integration and automation responses to NEVER expose secrets.
// Every API response must pass through sanitizeIntegration before serialization.
// §5.2: Handle BOTH legacy ERP and new framework config shapes.

import type { Integration, Automation, AutomationRun } from '@prisma/client'

// Fields that contain sensitive data and must be removed or masked
const SECRET_FIELDS = new Set([
  'apiKey',
  'apikey',
  'api_key',
  'bearerToken',
  'bearer_token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'token',
  'secret',
  'password',
  'basicPassword',
  'basic_password',
  'webhookSecret',
  'webhook_secret',
  'iv',
  'encrypted',
  'tag',
  'secrets', // The encrypted secrets blob
])

// Fields to preserve in the sanitized output
const PRESERVED_FIELDS = new Set([
  'apiUrl',
  'baseUrl',
  'routing',
  'outbound',
  'liveVerified',
  'webhookUrl',
  'webhookId',
  'testPath',
  'mcpServerUrl',
  'name',
  'type',
  'method',
  'path',
  'headers', // Keep header keys but mask sensitive values
])

const ENCRYPTED_SHAPE_KEYS = ['iv', 'encrypted', 'tag']

function isEncryptedBlob(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  const keys = Object.keys(obj)
  return ENCRYPTED_SHAPE_KEYS.every((k) => keys.includes(k))
}

function isSecretKey(key: string): boolean {
  const lowerKey = key.toLowerCase().replace(/[^a-z_]/g, '')
  return SECRET_FIELDS.has(lowerKey) || SECRET_FIELDS.has(key)
}

function maskApiKey(value: unknown): string {
  if (typeof value === 'string' && value.length > 4) {
    return `••••${value.slice(-4)}`
  }
  return '••••••••'
}

/**
 * Recursively mask sensitive fields in an object while preserving safe fields.
 * - Removes entire encrypted blobs {iv, encrypted, tag}
 * - Masks API keys, tokens, passwords
 * - Preserves routing, outbound, URLs, etc.
 */
function maskConfigObject(
  obj: Record<string, unknown>,
  depth = 0
): Record<string, unknown> {
  // Don't recurse too deep
  if (depth > 10) return {}

  // If this is an encrypted blob, skip it entirely
  if (isEncryptedBlob(obj)) {
    return {}
  }

  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    // Skip secret fields entirely
    if (isSecretKey(key)) {
      continue
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>
      // Skip encrypted blobs
      if (isEncryptedBlob(nested)) {
        continue
      }
      // Recurse into nested objects
      const masked = maskConfigObject(nested, depth + 1)
      if (Object.keys(masked).length > 0) {
        result[key] = masked
      }
    } else if (Array.isArray(value)) {
      // For arrays, filter and mask each element
      result[key] = value
        .map((v) => {
          if (v && typeof v === 'object') {
            return maskConfigObject(v as Record<string, unknown>, depth + 1)
          }
          return v
        })
        .filter((v) => v !== null && v !== undefined)
    } else {
      // Scalar value - keep it
      result[key] = value
    }
  }

  return result
}

/**
 * Detect if config has credentials (either legacy or framework style)
 */
function detectHasCredentials(config: Record<string, unknown>): boolean {
  // Legacy ERP style: top-level encrypted blob
  if (isEncryptedBlob(config)) return true

  // Framework style: nested secrets object
  if (config.secrets && isEncryptedBlob(config.secrets)) return true

  // Plain API key (shouldn't happen but check)
  if (config.apiKey || config.api_key || config.bearerToken || config.token) {
    return true
  }

  return false
}

/**
 * Extract and mask the API key for display (••••last4)
 * Returns null if no API key is present in the config.
 * For encrypted configs, we cannot extract the key, so return null.
 */
function extractApiKeyMasked(config: Record<string, unknown>): string | null {
  // Check for plain apiKey (legacy unencrypted)
  if (typeof config.apiKey === 'string') {
    return maskApiKey(config.apiKey)
  }
  if (typeof config.api_key === 'string') {
    return maskApiKey(config.api_key)
  }
  // For encrypted configs, we can't show the last 4
  // The frontend should indicate "credentials set" instead
  return null
}

export interface SanitizedIntegration {
  id: string
  type: string
  name: string
  status: string
  orgId: string
  paused: boolean
  authType: string | null
  lastSyncAt: Date | null
  syncCount: number
  lastTestAt: Date | null
  lastTestOk: boolean | null
  lastError: string | null
  consecutiveFailures: number
  circuitOpenUntil: Date | null
  createdAt: Date
  updatedAt: Date
  config: Record<string, unknown>
  // §5.2: Additional masked output fields
  hasCredentials: boolean
  apiKeyMasked: string | null
}

/**
 * Sanitize an integration for API response.
 * §5.2: Handles BOTH legacy ERP and new framework config shapes.
 * - Drops: iv, encrypted, tag, secrets, apiKey, token, password, webhookSecret
 * - Keeps: apiUrl, baseUrl, routing, outbound, liveVerified, webhookUrl, testPath, mcpServerUrl
 * - Emits: hasCredentials, apiKeyMasked
 */
export function sanitizeIntegration(
  integration: Integration & { config?: unknown }
): SanitizedIntegration {
  const config = (integration.config as Record<string, unknown>) || {}

  const hasCredentials = detectHasCredentials(config)
  const apiKeyMasked = extractApiKeyMasked(config)
  const sanitizedConfig = maskConfigObject(config)

  return {
    id: integration.id,
    type: integration.type,
    name: integration.name,
    status: integration.status,
    orgId: integration.orgId,
    paused: integration.paused,
    authType: integration.authType,
    lastSyncAt: integration.lastSyncAt,
    syncCount: integration.syncCount,
    lastTestAt: integration.lastTestAt,
    lastTestOk: integration.lastTestOk,
    lastError: integration.lastError,
    consecutiveFailures: integration.consecutiveFailures,
    circuitOpenUntil: integration.circuitOpenUntil,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
    config: sanitizedConfig,
    hasCredentials,
    apiKeyMasked,
  }
}

export function sanitizeIntegrations(
  integrations: Array<Integration & { config?: unknown }>
): SanitizedIntegration[] {
  return integrations.map(sanitizeIntegration)
}

// §5.2: Updated Automation interface to match new schema
export interface SanitizedAutomation {
  id: string
  orgId: string
  connectorId: string
  name: string
  description: string | null
  // §5.2: triggerType + triggerConfig
  triggerType: string
  triggerConfig: Record<string, unknown>
  // §5.2: actionType + actionConfig
  actionType: string
  actionConfig: Record<string, unknown>
  status: string
  nextRunAt: Date | null
  lastRunAt: Date | null
  lastRunOk: boolean | null
  lastError: string | null
  consecutiveFailures: number
  retryPolicy: unknown
  createdAt: Date
  updatedAt: Date
}

export function sanitizeAutomation(
  automation: Automation
): SanitizedAutomation {
  const triggerConfig = (automation.triggerConfig as Record<string, unknown>) || {}
  const actionConfig = (automation.actionConfig as Record<string, unknown>) || {}

  return {
    id: automation.id,
    orgId: automation.orgId,
    connectorId: automation.connectorId,
    name: automation.name,
    description: automation.description,
    triggerType: automation.triggerType,
    triggerConfig: maskConfigObject(triggerConfig),
    actionType: automation.actionType,
    actionConfig: maskConfigObject(actionConfig),
    status: automation.status,
    nextRunAt: automation.nextRunAt,
    lastRunAt: automation.lastRunAt,
    lastRunOk: automation.lastRunOk,
    lastError: automation.lastError,
    consecutiveFailures: automation.consecutiveFailures,
    retryPolicy: automation.retryPolicy,
    createdAt: automation.createdAt,
    updatedAt: automation.updatedAt,
  }
}

// §5.2: Updated AutomationRun interface to match new schema
export interface SanitizedAutomationRun {
  id: string
  automationId: string
  orgId: string
  trigger: string
  idempotencyKey: string | null
  status: string
  error: { code: string; message: string; retryable: boolean } | null
  requestSummary: { method: string; host: string; path: string } | null
  recordsProcessed: number
  recordsFailed: number
  inputSnapshot: Record<string, unknown> | null
  outputSnapshot: Record<string, unknown> | null
  httpStatus: number | null
  durationMs: number | null
  retryCount: number
  startedAt: Date
  completedAt: Date | null
}

export function sanitizeAutomationRun(run: AutomationRun): SanitizedAutomationRun {
  return {
    id: run.id,
    automationId: run.automationId,
    orgId: run.orgId,
    trigger: run.trigger,
    idempotencyKey: run.idempotencyKey,
    status: run.status,
    error: run.error as SanitizedAutomationRun['error'],
    requestSummary: run.requestSummary as SanitizedAutomationRun['requestSummary'],
    recordsProcessed: run.recordsProcessed,
    recordsFailed: run.recordsFailed,
    inputSnapshot: run.inputSnapshot
      ? maskConfigObject(run.inputSnapshot as Record<string, unknown>)
      : null,
    outputSnapshot: run.outputSnapshot
      ? maskConfigObject(run.outputSnapshot as Record<string, unknown>)
      : null,
    httpStatus: run.httpStatus,
    durationMs: run.durationMs,
    retryCount: run.retryCount,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  }
}
