// ─── Secrets management ──────────────────────────────────────
// Wrapper around encryption.ts for connector-specific secret handling.
// Secrets are encrypted before storage and decrypted only when needed.

import { encryptJson, decryptJson } from '../encryption'
import type { AuthType } from './catalog'

export interface EncryptedBlob {
  iv: string
  encrypted: string
  tag: string
}

export interface ConnectorSecrets {
  apiKey?: string
  bearerToken?: string
  basicUsername?: string
  basicPassword?: string
  webhookSecret?: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
}

export function encryptSecrets(secrets: ConnectorSecrets): EncryptedBlob {
  return encryptJson(secrets)
}

export function decryptSecrets(blob: EncryptedBlob): ConnectorSecrets {
  return decryptJson<ConnectorSecrets>(blob)
}

export function isEncryptedBlob(value: unknown): value is EncryptedBlob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.iv === 'string' &&
    typeof obj.encrypted === 'string' &&
    typeof obj.tag === 'string'
  )
}

export interface ParsedConfig {
  secrets: EncryptedBlob | null
  baseUrl?: string
  serverUrl?: string
  authType?: AuthType
  apiKeyHeader?: string
  defaultHeaders?: Record<string, string>
  timeoutMs?: number
  capabilities?: string[]
  description?: string
  signatureHeader?: string
  signatureAlgorithm?: string
  webhookId?: string
  routing?: Record<string, unknown>
  outbound?: Record<string, unknown>
  liveVerified?: boolean
  lastTestAt?: string
  lastTestError?: string | null
}

export function parseIntegrationConfig(config: unknown): ParsedConfig {
  if (!config || typeof config !== 'object') {
    return { secrets: null }
  }
  const raw = config as Record<string, unknown>

  const secrets: EncryptedBlob | null = isEncryptedBlob(raw)
    ? raw as EncryptedBlob
    : isEncryptedBlob(raw.secrets)
      ? raw.secrets as EncryptedBlob
      : null

  return {
    secrets,
    baseUrl: raw.baseUrl as string | undefined,
    serverUrl: raw.serverUrl as string | undefined,
    authType: raw.authType as AuthType | undefined,
    apiKeyHeader: raw.apiKeyHeader as string | undefined,
    defaultHeaders: raw.defaultHeaders as Record<string, string> | undefined,
    timeoutMs: raw.timeoutMs as number | undefined,
    capabilities: raw.capabilities as string[] | undefined,
    description: raw.description as string | undefined,
    signatureHeader: raw.signatureHeader as string | undefined,
    signatureAlgorithm: raw.signatureAlgorithm as string | undefined,
    webhookId: raw.webhookId as string | undefined,
    routing: raw.routing as Record<string, unknown> | undefined,
    outbound: raw.outbound as Record<string, unknown> | undefined,
    liveVerified: raw.liveVerified as boolean | undefined,
    lastTestAt: raw.lastTestAt as string | undefined,
    lastTestError: raw.lastTestError as string | null | undefined,
  }
}

export function buildIntegrationConfig(
  plainConfig: Omit<ParsedConfig, 'secrets'>,
  secrets: ConnectorSecrets
): Record<string, unknown> {
  const encryptedSecrets = Object.keys(secrets).length > 0
    ? encryptSecrets(secrets)
    : null

  const result: Record<string, unknown> = {}
  if (encryptedSecrets) result.secrets = encryptedSecrets
  if (plainConfig.baseUrl) result.baseUrl = plainConfig.baseUrl
  if (plainConfig.serverUrl) result.serverUrl = plainConfig.serverUrl
  if (plainConfig.authType) result.authType = plainConfig.authType
  if (plainConfig.apiKeyHeader) result.apiKeyHeader = plainConfig.apiKeyHeader
  if (plainConfig.defaultHeaders) result.defaultHeaders = plainConfig.defaultHeaders
  if (plainConfig.timeoutMs) result.timeoutMs = plainConfig.timeoutMs
  if (plainConfig.capabilities) result.capabilities = plainConfig.capabilities
  if (plainConfig.description) result.description = plainConfig.description
  if (plainConfig.signatureHeader) result.signatureHeader = plainConfig.signatureHeader
  if (plainConfig.signatureAlgorithm) result.signatureAlgorithm = plainConfig.signatureAlgorithm
  if (plainConfig.webhookId) result.webhookId = plainConfig.webhookId
  if (plainConfig.routing) result.routing = plainConfig.routing
  if (plainConfig.outbound) result.outbound = plainConfig.outbound
  if (plainConfig.liveVerified !== undefined) result.liveVerified = plainConfig.liveVerified
  if (plainConfig.lastTestAt) result.lastTestAt = plainConfig.lastTestAt
  if (plainConfig.lastTestError !== undefined) result.lastTestError = plainConfig.lastTestError

  return result
}

export function getDecryptedSecrets(config: unknown): ConnectorSecrets {
  const parsed = parseIntegrationConfig(config)
  if (!parsed.secrets) return {}
  try {
    return decryptSecrets(parsed.secrets)
  } catch {
    return {}
  }
}
