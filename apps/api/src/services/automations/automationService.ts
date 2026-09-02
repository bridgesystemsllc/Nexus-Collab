// ─── Automation service ──────────────────────────────────────
// Business logic for creating, updating, and managing automations.
// All operations are org-scoped. §5.2 compliant.

import type { PrismaClient, Automation, AutomationRun } from '@prisma/client'
import { Prisma } from '@prisma/client'
import {
  sanitizeAutomation,
  sanitizeAutomationRun,
  type SanitizedAutomation,
  type SanitizedAutomationRun,
} from '../../lib/connectors/mask'
import { parseRetryPolicy, DEFAULT_RETRY_POLICY, type RetryPolicy } from '../../lib/connectors/retry'
import { serviceError, type ConnectorServiceError } from '../connectors/connectorService'

// §5.2: Trigger types
export type TriggerType = 'SCHEDULE' | 'WEBHOOK' | 'MANUAL'

// §5.2: Action types
export type ActionType = 'HTTP_REQUEST' | 'MCP_CALL' | 'WEBHOOK_FORWARD'

// §5.2: Status (default DRAFT)
export type AutomationStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ERROR'

// §5.2: TriggerConfig for SCHEDULE
export interface ScheduleTriggerConfig {
  everyMinutes: 15 | 60 | 1440
  timezone?: string
}

// §5.2: ActionConfig for HTTP_REQUEST
export interface HttpActionConfig {
  method: string
  path: string
  headers?: Record<string, string>
  body?: unknown
}

// §5.2: ActionConfig for MCP_CALL
export interface McpActionConfig {
  tool: string
  arguments?: Record<string, unknown>
}

// §5.2: ActionConfig for WEBHOOK_FORWARD
export interface WebhookForwardConfig {
  targetUrl: string
  headers?: Record<string, string>
}

export interface CreateAutomationInput {
  connectorId: string
  name: string
  description?: string
  triggerType: TriggerType
  triggerConfig?: ScheduleTriggerConfig | Record<string, unknown>
  actionType?: ActionType
  actionConfig?: HttpActionConfig | McpActionConfig | WebhookForwardConfig | Record<string, unknown>
  retryPolicy?: Partial<RetryPolicy>
}

export interface UpdateAutomationInput {
  name?: string
  description?: string
  triggerConfig?: ScheduleTriggerConfig | Record<string, unknown>
  actionConfig?: HttpActionConfig | McpActionConfig | WebhookForwardConfig | Record<string, unknown>
  retryPolicy?: Partial<RetryPolicy>
  status?: AutomationStatus
}

/**
 * Compute next run time for SCHEDULE triggers based on everyMinutes.
 */
function computeNextRunAt(
  triggerConfig: Record<string, unknown> | null,
  now: Date = new Date()
): Date | null {
  if (!triggerConfig) return null
  const everyMinutes = triggerConfig.everyMinutes as number
  if (!everyMinutes || typeof everyMinutes !== 'number') return null

  const minutes = now.getMinutes()
  const nextSlot = Math.ceil(minutes / everyMinutes) * everyMinutes
  const next = new Date(now)
  next.setMinutes(nextSlot, 0, 0)

  if (next <= now) {
    next.setMinutes(next.getMinutes() + everyMinutes)
  }

  return next
}

export async function listAutomations(
  prisma: PrismaClient,
  orgId: string,
  connectorId?: string
): Promise<SanitizedAutomation[]> {
  const where: Prisma.AutomationWhereInput = { orgId }
  if (connectorId) where.connectorId = connectorId

  const automations = await prisma.automation.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })
  return automations.map(sanitizeAutomation)
}

export async function getAutomation(
  prisma: PrismaClient,
  orgId: string,
  automationId: string
): Promise<SanitizedAutomation> {
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, orgId },
  })
  if (!automation) {
    throw serviceError('NOT_FOUND', 'Automation not found', 404)
  }
  return sanitizeAutomation(automation)
}

export async function createAutomation(
  prisma: PrismaClient,
  orgId: string,
  input: CreateAutomationInput
): Promise<SanitizedAutomation> {
  const {
    connectorId,
    name,
    description,
    triggerType,
    triggerConfig,
    actionType,
    actionConfig,
    retryPolicy,
  } = input

  // Verify connector exists and belongs to org
  const connector = await prisma.integration.findFirst({
    where: { id: connectorId, orgId },
  })
  if (!connector) {
    throw serviceError('NOT_FOUND', 'Connector not found', 404)
  }

  const now = new Date()
  const nextRunAt =
    triggerType === 'SCHEDULE'
      ? computeNextRunAt((triggerConfig as Record<string, unknown>) ?? null, now)
      : null

  const automation = await prisma.automation.create({
    data: {
      orgId,
      connectorId,
      name,
      description: description ?? null,
      triggerType,
      triggerConfig: (triggerConfig ?? {}) as Prisma.InputJsonObject,
      actionType: actionType ?? 'HTTP_REQUEST',
      actionConfig: (actionConfig ?? {}) as Prisma.InputJsonObject,
      // §5.2: status default DRAFT
      status: 'DRAFT',
      nextRunAt,
      retryPolicy: retryPolicy
        ? (parseRetryPolicy(retryPolicy) as unknown as Prisma.InputJsonObject)
        : Prisma.JsonNull,
    },
  })

  return sanitizeAutomation(automation)
}

export async function updateAutomation(
  prisma: PrismaClient,
  orgId: string,
  automationId: string,
  input: UpdateAutomationInput
): Promise<SanitizedAutomation> {
  const existing = await prisma.automation.findFirst({
    where: { id: automationId, orgId },
  })
  if (!existing) {
    throw serviceError('NOT_FOUND', 'Automation not found', 404)
  }

  const now = new Date()
  let nextRunAt = existing.nextRunAt

  // Recompute nextRunAt if triggerConfig changes or status becomes ACTIVE
  if (input.triggerConfig !== undefined || input.status === 'ACTIVE') {
    const triggerConfig = input.triggerConfig ?? (existing.triggerConfig as Record<string, unknown>)
    nextRunAt =
      existing.triggerType === 'SCHEDULE'
        ? computeNextRunAt(triggerConfig as Record<string, unknown>, now)
        : null
  }

  const data: Prisma.AutomationUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  if (input.triggerConfig !== undefined) {
    data.triggerConfig = input.triggerConfig as Prisma.InputJsonObject
  }
  if (input.actionConfig !== undefined) {
    data.actionConfig = input.actionConfig as Prisma.InputJsonObject
  }
  if (input.retryPolicy !== undefined) {
    data.retryPolicy = parseRetryPolicy(input.retryPolicy) as unknown as Prisma.InputJsonObject
  }
  if (input.status !== undefined) {
    data.status = input.status
    if (input.status === 'ACTIVE') {
      data.consecutiveFailures = 0
      data.lastError = null
    }
  }
  data.nextRunAt = nextRunAt

  const automation = await prisma.automation.update({
    where: { id: automationId },
    data,
  })

  return sanitizeAutomation(automation)
}

/**
 * §5.2: POST /:id/activate - Activate a DRAFT automation
 */
export async function activateAutomation(
  prisma: PrismaClient,
  orgId: string,
  automationId: string
): Promise<SanitizedAutomation> {
  const existing = await prisma.automation.findFirst({
    where: { id: automationId, orgId },
  })
  if (!existing) {
    throw serviceError('NOT_FOUND', 'Automation not found', 404)
  }

  if (existing.status !== 'DRAFT') {
    throw serviceError(
      'INVALID_STATE',
      `Cannot activate automation in ${existing.status} state`,
      400
    )
  }

  return updateAutomation(prisma, orgId, automationId, { status: 'ACTIVE' })
}

export async function deleteAutomation(
  prisma: PrismaClient,
  orgId: string,
  automationId: string
): Promise<void> {
  const existing = await prisma.automation.findFirst({
    where: { id: automationId, orgId },
  })
  if (!existing) {
    throw serviceError('NOT_FOUND', 'Automation not found', 404)
  }

  await prisma.automation.delete({
    where: { id: automationId },
  })
}

export async function pauseAutomation(
  prisma: PrismaClient,
  orgId: string,
  automationId: string
): Promise<SanitizedAutomation> {
  return updateAutomation(prisma, orgId, automationId, { status: 'PAUSED' })
}

export async function resumeAutomation(
  prisma: PrismaClient,
  orgId: string,
  automationId: string
): Promise<SanitizedAutomation> {
  return updateAutomation(prisma, orgId, automationId, { status: 'ACTIVE' })
}

export async function listAutomationRuns(
  prisma: PrismaClient,
  orgId: string,
  automationId: string,
  limit: number = 20
): Promise<SanitizedAutomationRun[]> {
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, orgId },
  })
  if (!automation) {
    throw serviceError('NOT_FOUND', 'Automation not found', 404)
  }

  const runs = await prisma.automationRun.findMany({
    where: { automationId },
    orderBy: { startedAt: 'desc' },
    take: limit,
  })

  return runs.map(sanitizeAutomationRun)
}

export async function getAutomationRun(
  prisma: PrismaClient,
  orgId: string,
  runId: string
): Promise<SanitizedAutomationRun> {
  const run = await prisma.automationRun.findFirst({
    where: { id: runId, orgId },
  })
  if (!run) {
    throw serviceError('NOT_FOUND', 'Automation run not found', 404)
  }
  return sanitizeAutomationRun(run)
}

export async function getRawAutomation(
  prisma: PrismaClient,
  automationId: string
): Promise<Automation | null> {
  return prisma.automation.findUnique({
    where: { id: automationId },
  })
}

/**
 * §5.8: Lookup automation by webhookId stored in the connector's config.
 * GENERIC_WEBHOOK connectors store webhookId in Integration.config.webhookId
 */
export async function getAutomationByWebhookId(
  prisma: PrismaClient,
  webhookId: string
): Promise<Automation | null> {
  // Find the integration with this webhookId in its config
  const integrations = await prisma.integration.findMany({
    where: {
      type: 'GENERIC_WEBHOOK',
    },
  })

  for (const integration of integrations) {
    const config = integration.config as Record<string, unknown>
    if (config?.webhookId === webhookId) {
      // Find an active automation for this connector
      return prisma.automation.findFirst({
        where: {
          connectorId: integration.id,
          status: 'ACTIVE',
          triggerType: 'WEBHOOK',
        },
      })
    }
  }

  return null
}

/**
 * Get the webhook URL for a GENERIC_WEBHOOK connector's automation.
 */
export async function getConnectorWebhookUrl(
  prisma: PrismaClient,
  orgId: string,
  connectorId: string,
  baseUrl: string
): Promise<string | null> {
  const connector = await prisma.integration.findFirst({
    where: { id: connectorId, orgId, type: 'GENERIC_WEBHOOK' },
  })
  if (!connector) return null

  const config = connector.config as Record<string, unknown>
  const webhookId = config?.webhookId as string
  if (!webhookId) return null

  return `${baseUrl}/api/v1/webhooks/connectors/${webhookId}`
}
