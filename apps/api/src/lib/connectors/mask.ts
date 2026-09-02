// ─── Response masking ────────────────────────────────────────
// Sanitize integration and automation responses to NEVER expose secrets.
// Every API response must pass through sanitizeIntegration before serialization.

import type { Integration, Automation, AutomationRun } from '@prisma/client'

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
])

const ENCRYPTED_SHAPE_KEYS = ['iv', 'encrypted', 'tag']

function isEncryptedBlob(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  const keys = Object.keys(obj)
  return ENCRYPTED_SHAPE_KEYS.every((k) => keys.includes(k))
}

function maskValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value
  const lowerKey = key.toLowerCase().replace(/[^a-z_]/g, '')
  if (SECRET_FIELDS.has(lowerKey)) {
    if (typeof value === 'string' && value.length > 4) {
      return `••••${value.slice(-4)}`
    }
    return '••••••••'
  }
  return value
}

function maskObject(obj: Record<string, unknown>): Record<string, unknown> {
  if (isEncryptedBlob(obj)) {
    return { encrypted: true, masked: true }
  }
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = maskObject(value as Record<string, unknown>)
    } else if (Array.isArray(value)) {
      result[key] = value.map((v) =>
        v && typeof v === 'object' ? maskObject(v as Record<string, unknown>) : v
      )
    } else {
      result[key] = maskValue(key, value)
    }
  }
  return result
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
}

export function sanitizeIntegration(
  integration: Integration & { config?: unknown }
): SanitizedIntegration {
  const config = integration.config as Record<string, unknown> | null
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
    config: config ? maskObject(config) : {},
  }
}

export function sanitizeIntegrations(
  integrations: Array<Integration & { config?: unknown }>
): SanitizedIntegration[] {
  return integrations.map(sanitizeIntegration)
}

export interface SanitizedAutomation {
  id: string
  orgId: string
  integrationId: string
  name: string
  description: string | null
  trigger: string
  schedule: string | null
  webhookId: string | null
  status: string
  nextRunAt: Date | null
  lastRunAt: Date | null
  lastRunOk: boolean | null
  lastError: string | null
  consecutiveFailures: number
  retryPolicy: unknown
  createdAt: Date
  updatedAt: Date
  config: Record<string, unknown>
}

export function sanitizeAutomation(
  automation: Automation & { config?: unknown }
): SanitizedAutomation {
  const config = automation.config as Record<string, unknown> | null
  return {
    id: automation.id,
    orgId: automation.orgId,
    integrationId: automation.integrationId,
    name: automation.name,
    description: automation.description,
    trigger: automation.trigger,
    schedule: automation.schedule,
    webhookId: automation.webhookId,
    status: automation.status,
    nextRunAt: automation.nextRunAt,
    lastRunAt: automation.lastRunAt,
    lastRunOk: automation.lastRunOk,
    lastError: automation.lastError,
    consecutiveFailures: automation.consecutiveFailures,
    retryPolicy: automation.retryPolicy,
    createdAt: automation.createdAt,
    updatedAt: automation.updatedAt,
    config: config ? maskObject(config) : {},
  }
}

export function sanitizeAutomationRun(
  run: AutomationRun
): Omit<AutomationRun, 'inputSnapshot' | 'outputSnapshot'> & {
  inputSnapshot: Record<string, unknown> | null
  outputSnapshot: Record<string, unknown> | null
} {
  return {
    ...run,
    inputSnapshot: run.inputSnapshot
      ? maskObject(run.inputSnapshot as Record<string, unknown>)
      : null,
    outputSnapshot: run.outputSnapshot
      ? maskObject(run.outputSnapshot as Record<string, unknown>)
      : null,
  }
}
