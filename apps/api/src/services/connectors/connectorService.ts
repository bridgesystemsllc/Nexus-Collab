// ─── Connector service ───────────────────────────────────────
// Business logic for creating, updating, testing, pausing, and resuming
// connector integrations. All operations are org-scoped.

import type { PrismaClient, Integration, Prisma } from '@prisma/client'
import {
  CONNECTOR_CATALOG,
  isSingletonType,
  isGenericType,
  getConnectorDefinition,
  type AuthType,
} from '../../lib/connectors/catalog'
import {
  sanitizeIntegration,
  type SanitizedIntegration,
} from '../../lib/connectors/mask'
import {
  encryptSecrets,
  decryptSecrets,
  parseIntegrationConfig,
  buildIntegrationConfig,
  getDecryptedSecrets,
  type ConnectorSecrets,
  type ParsedConfig,
} from '../../lib/connectors/secrets'
import {
  executeHttpRequest,
  httpClientFromIntegration,
  isCredentialsRejected,
  isRetryableStatus,
  type HttpResponse,
} from '../../lib/connectors/httpClient'
import { withRetry } from '../../lib/connectors/retry'
import {
  shouldSkipExecution,
  recordSuccess,
  recordFailure,
  resetCircuit,
} from '../../lib/connectors/circuitBreaker'
import {
  generateWebhookId,
  generateWebhookSecret,
  generateRequestId,
} from '../../lib/connectors/idempotency'

export interface CreateConnectorInput {
  type: string
  name: string
  authType?: AuthType
  config: Record<string, unknown>
  secrets: ConnectorSecrets
}

export interface UpdateConnectorInput {
  name?: string
  authType?: AuthType
  config?: Record<string, unknown>
  secrets?: ConnectorSecrets
}

export interface TestResult {
  ok: boolean
  message: string
  status?: number
  durationMs?: number
  endpoint?: string
  cached?: boolean
}

export interface ConnectorServiceError {
  code: string
  message: string
  status: number
}

function isServiceError(err: unknown): err is ConnectorServiceError {
  return typeof err === 'object' && err !== null && 'code' in err && 'status' in err
}

export function serviceError(
  code: string,
  message: string,
  status: number
): ConnectorServiceError {
  return { code, message, status }
}

export async function getCatalog(): Promise<typeof CONNECTOR_CATALOG> {
  return CONNECTOR_CATALOG
}

export async function listConnectors(
  prisma: PrismaClient,
  orgId: string
): Promise<SanitizedIntegration[]> {
  const integrations = await prisma.integration.findMany({
    where: { orgId },
    orderBy: { createdAt: 'asc' },
  })
  return integrations.map(sanitizeIntegration)
}

export async function getConnector(
  prisma: PrismaClient,
  orgId: string,
  integrationId: string
): Promise<SanitizedIntegration> {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, orgId },
  })
  if (!integration) {
    throw serviceError('NOT_FOUND', 'Integration not found', 404)
  }
  return sanitizeIntegration(integration)
}

export async function getConnectorByType(
  prisma: PrismaClient,
  orgId: string,
  type: string
): Promise<SanitizedIntegration | null> {
  const integration = await prisma.integration.findFirst({
    where: { type, orgId },
  })
  return integration ? sanitizeIntegration(integration) : null
}

export async function createConnector(
  prisma: PrismaClient,
  orgId: string,
  input: CreateConnectorInput
): Promise<SanitizedIntegration> {
  const { type, name, authType, config, secrets } = input

  if (isSingletonType(type)) {
    const existing = await prisma.integration.findFirst({
      where: { type, orgId },
    })
    if (existing) {
      throw serviceError(
        'SINGLETON_EXISTS',
        `Only one ${type} integration is allowed per organization`,
        409
      )
    }
  }

  const definition = getConnectorDefinition(type)
  const effectiveAuthType = authType || (definition?.authTypes[0] ?? 'NONE')

  let webhookId: string | undefined
  let webhookSecret: string | undefined
  if (type === 'GENERIC_WEBHOOK') {
    webhookId = generateWebhookId()
    webhookSecret = generateWebhookSecret()
  }

  const plainConfig: Omit<ParsedConfig, 'secrets'> = {
    ...config,
    authType: effectiveAuthType,
    webhookId,
  }

  const effectiveSecrets: ConnectorSecrets = {
    ...secrets,
    ...(webhookSecret ? { webhookSecret } : {}),
  }

  const fullConfig = buildIntegrationConfig(plainConfig, effectiveSecrets)

  const integration = await prisma.integration.create({
    data: {
      type,
      name,
      status: 'CONNECTED',
      orgId,
      authType: effectiveAuthType,
      config: fullConfig as Prisma.InputJsonObject,
      paused: false,
      consecutiveFailures: 0,
    },
  })

  return sanitizeIntegration(integration)
}

export async function updateConnector(
  prisma: PrismaClient,
  orgId: string,
  integrationId: string,
  input: UpdateConnectorInput
): Promise<SanitizedIntegration> {
  const existing = await prisma.integration.findFirst({
    where: { id: integrationId, orgId },
  })
  if (!existing) {
    throw serviceError('NOT_FOUND', 'Integration not found', 404)
  }

  const parsed = parseIntegrationConfig(existing.config)
  const existingSecrets = parsed.secrets ? decryptSecrets(parsed.secrets) : {}

  const newAuthType = input.authType ?? existing.authType ?? 'NONE'
  const newSecrets = input.secrets
    ? { ...existingSecrets, ...input.secrets }
    : existingSecrets

  const plainConfig: Omit<ParsedConfig, 'secrets'> = {
    baseUrl: (input.config?.baseUrl as string) ?? parsed.baseUrl,
    serverUrl: (input.config?.serverUrl as string) ?? parsed.serverUrl,
    authType: newAuthType as AuthType,
    apiKeyHeader: (input.config?.apiKeyHeader as string) ?? parsed.apiKeyHeader,
    defaultHeaders:
      (input.config?.defaultHeaders as Record<string, string>) ?? parsed.defaultHeaders,
    timeoutMs: (input.config?.timeoutMs as number) ?? parsed.timeoutMs,
    capabilities: (input.config?.capabilities as string[]) ?? parsed.capabilities,
    description: (input.config?.description as string) ?? parsed.description,
    signatureHeader: (input.config?.signatureHeader as string) ?? parsed.signatureHeader,
    signatureAlgorithm:
      (input.config?.signatureAlgorithm as string) ?? parsed.signatureAlgorithm,
    webhookId: parsed.webhookId,
    routing: parsed.routing,
    outbound: parsed.outbound,
    liveVerified: parsed.liveVerified,
  }

  const fullConfig = buildIntegrationConfig(plainConfig, newSecrets)

  const integration = await prisma.integration.update({
    where: { id: integrationId },
    data: {
      name: input.name ?? existing.name,
      authType: newAuthType,
      config: fullConfig as Prisma.InputJsonObject,
    },
  })

  return sanitizeIntegration(integration)
}

export async function testConnector(
  prisma: PrismaClient,
  orgId: string,
  integrationId: string
): Promise<TestResult> {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, orgId },
  })
  if (!integration) {
    throw serviceError('NOT_FOUND', 'Integration not found', 404)
  }

  const now = new Date()
  const lastTestAt = integration.lastTestAt
  if (lastTestAt && now.getTime() - lastTestAt.getTime() < 2000) {
    return {
      ok: integration.lastTestOk ?? false,
      message: integration.lastTestOk
        ? 'Connection is active (cached).'
        : integration.lastError ?? 'Last test failed.',
      cached: true,
    }
  }

  if (integration.type === 'GENERIC_WEBHOOK') {
    await prisma.integration.update({
      where: { id: integrationId },
      data: { lastTestAt: now, lastTestOk: true },
    })
    return {
      ok: true,
      message: 'Webhook receiver is configured and ready.',
    }
  }

  const parsed = parseIntegrationConfig(integration.config)
  const secrets = getDecryptedSecrets(integration.config)

  const client = httpClientFromIntegration(parsed, secrets)
  if (!client) {
    await prisma.integration.update({
      where: { id: integrationId },
      data: { lastTestAt: now, lastTestOk: false, lastError: 'No base URL configured' },
    })
    return { ok: false, message: 'No base URL configured' }
  }

  const testPath = integration.type === 'GENERIC_MCP' ? '/health' : '/'

  const result = await withRetry(
    async () => {
      const response = await client.get(testPath)
      if (!response.ok) {
        const error: any = new Error(`HTTP ${response.status}`)
        error.status = response.status
        error.retryable = isRetryableStatus(response.status)
        throw error
      }
      return response
    },
    { maxAttempts: 2 }
  )

  if (result.success && result.result) {
    const response = result.result
    await prisma.integration.update({
      where: { id: integrationId },
      data: {
        lastTestAt: now,
        lastTestOk: true,
        lastError: null,
        consecutiveFailures: 0,
        circuitOpenUntil: null,
        status: 'CONNECTED',
      },
    })
    return {
      ok: true,
      message: `Connected — received HTTP ${response.status} in ${response.durationMs}ms.`,
      status: response.status,
      durationMs: response.durationMs,
    }
  }

  const errorMessage = result.error?.message ?? 'Connection test failed'
  const isAuthError = isCredentialsRejected((result.error as any)?.status)

  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      lastTestAt: now,
      lastTestOk: false,
      lastError: errorMessage,
    },
  })

  if (isAuthError) {
    await recordFailure(prisma, integrationId, errorMessage)
  }

  return {
    ok: false,
    message: isAuthError
      ? `Credentials rejected: ${errorMessage}`
      : errorMessage,
  }
}

export async function pauseConnector(
  prisma: PrismaClient,
  orgId: string,
  integrationId: string
): Promise<SanitizedIntegration> {
  const existing = await prisma.integration.findFirst({
    where: { id: integrationId, orgId },
  })
  if (!existing) {
    throw serviceError('NOT_FOUND', 'Integration not found', 404)
  }

  const integration = await prisma.integration.update({
    where: { id: integrationId },
    data: { paused: true },
  })

  return sanitizeIntegration(integration)
}

export async function resumeConnector(
  prisma: PrismaClient,
  orgId: string,
  integrationId: string
): Promise<SanitizedIntegration> {
  const existing = await prisma.integration.findFirst({
    where: { id: integrationId, orgId },
  })
  if (!existing) {
    throw serviceError('NOT_FOUND', 'Integration not found', 404)
  }

  const integration = await prisma.integration.update({
    where: { id: integrationId },
    data: {
      paused: false,
      consecutiveFailures: 0,
      circuitOpenUntil: null,
    },
  })

  return sanitizeIntegration(integration)
}

export async function deleteConnector(
  prisma: PrismaClient,
  orgId: string,
  integrationId: string
): Promise<void> {
  const existing = await prisma.integration.findFirst({
    where: { id: integrationId, orgId },
  })
  if (!existing) {
    throw serviceError('NOT_FOUND', 'Integration not found', 404)
  }

  if (isSingletonType(existing.type) && !isGenericType(existing.type)) {
    throw serviceError(
      'SINGLETON_PROTECTED',
      `${existing.type} cannot be deleted. Use disconnect instead.`,
      400
    )
  }

  await prisma.integration.delete({
    where: { id: integrationId },
  })
}

export async function getRawIntegration(
  prisma: PrismaClient,
  orgId: string,
  integrationId: string
): Promise<Integration | null> {
  return prisma.integration.findFirst({
    where: { id: integrationId, orgId },
  })
}

export async function getRawIntegrationByType(
  prisma: PrismaClient,
  orgId: string,
  type: string
): Promise<Integration | null> {
  return prisma.integration.findFirst({
    where: { type, orgId },
  })
}

export async function getWebhookUrl(
  prisma: PrismaClient,
  orgId: string,
  integrationId: string,
  baseUrl: string
): Promise<string | null> {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, orgId, type: 'GENERIC_WEBHOOK' },
  })
  if (!integration) return null

  const parsed = parseIntegrationConfig(integration.config)
  if (!parsed.webhookId) return null

  return `${baseUrl}/api/v1/webhooks/connectors/${parsed.webhookId}`
}
