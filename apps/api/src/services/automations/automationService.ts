// ─── Automation service ──────────────────────────────────────
// Business logic for creating, updating, and managing automations.
// All operations are org-scoped.

import type { PrismaClient, Automation, AutomationRun } from '@prisma/client'
import { Prisma } from '@prisma/client'
import {
  sanitizeAutomation,
  sanitizeAutomationRun,
  type SanitizedAutomation,
} from '../../lib/connectors/mask'
import {
  encryptSecrets,
  decryptSecrets,
  type ConnectorSecrets,
} from '../../lib/connectors/secrets'
import {
  generateWebhookId,
  generateWebhookSecret,
  generateRequestId,
} from '../../lib/connectors/idempotency'
import { parseRetryPolicy, DEFAULT_RETRY_POLICY, type RetryPolicy } from '../../lib/connectors/retry'
import { serviceError, type ConnectorServiceError } from '../connectors/connectorService'
import { CronExpressionParser } from 'cron-parser'

export type AutomationTrigger = 'SCHEDULE' | 'WEBHOOK' | 'MANUAL'
export type AutomationStatus = 'ACTIVE' | 'PAUSED' | 'ERROR' | 'DISABLED'

export interface CreateAutomationInput {
  integrationId: string
  name: string
  description?: string
  trigger: AutomationTrigger
  schedule?: string
  config?: Record<string, unknown>
  retryPolicy?: Partial<typeof DEFAULT_RETRY_POLICY>
}

export interface UpdateAutomationInput {
  name?: string
  description?: string
  schedule?: string
  config?: Record<string, unknown>
  retryPolicy?: Partial<typeof DEFAULT_RETRY_POLICY>
  status?: AutomationStatus
}

function computeNextRunAt(schedule: string | null, now: Date = new Date()): Date | null {
  if (!schedule) return null
  try {
    const expr = CronExpressionParser.parse(schedule, { currentDate: now })
    return expr.next().toDate()
  } catch {
    return null
  }
}

export async function listAutomations(
  prisma: PrismaClient,
  orgId: string,
  integrationId?: string
): Promise<SanitizedAutomation[]> {
  const where: Prisma.AutomationWhereInput = { orgId }
  if (integrationId) where.integrationId = integrationId

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
  const { integrationId, name, description, trigger, schedule, config, retryPolicy } = input

  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, orgId },
  })
  if (!integration) {
    throw serviceError('NOT_FOUND', 'Integration not found', 404)
  }

  let webhookId: string | undefined
  let webhookSecret: string | undefined
  if (trigger === 'WEBHOOK') {
    webhookId = generateWebhookId()
    webhookSecret = generateWebhookSecret()
  }

  const now = new Date()
  const nextRunAt = trigger === 'SCHEDULE' ? computeNextRunAt(schedule ?? null, now) : null

  const automation = await prisma.automation.create({
    data: {
      orgId,
      integrationId,
      name,
      description: description ?? null,
      trigger,
      schedule: schedule ?? null,
      webhookId: webhookId ?? null,
      webhookSecret: webhookSecret ?? null,
      config: (config ?? {}) as Prisma.InputJsonObject,
      status: 'ACTIVE',
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

  const schedule = input.schedule ?? existing.schedule
  const now = new Date()
  let nextRunAt = existing.nextRunAt

  if (input.schedule !== undefined || input.status === 'ACTIVE') {
    nextRunAt = existing.trigger === 'SCHEDULE' ? computeNextRunAt(schedule, now) : null
  }

  const data: Prisma.AutomationUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  if (input.schedule !== undefined) data.schedule = input.schedule
  if (input.config !== undefined) data.config = input.config as Prisma.InputJsonObject
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

export async function triggerAutomation(
  prisma: PrismaClient,
  orgId: string,
  automationId: string
): Promise<{ runId: string; status: string }> {
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, orgId },
  })
  if (!automation) {
    throw serviceError('NOT_FOUND', 'Automation not found', 404)
  }

  if (automation.status !== 'ACTIVE') {
    throw serviceError(
      'AUTOMATION_NOT_ACTIVE',
      `Automation is ${automation.status.toLowerCase()}, cannot trigger`,
      400
    )
  }

  const requestId = generateRequestId()

  const run = await prisma.automationRun.create({
    data: {
      automationId,
      orgId,
      trigger: 'MANUAL',
      requestId,
      status: 'PENDING',
    },
  })

  return { runId: run.id, status: run.status }
}

export async function listAutomationRuns(
  prisma: PrismaClient,
  orgId: string,
  automationId: string,
  limit: number = 20
): Promise<ReturnType<typeof sanitizeAutomationRun>[]> {
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
): Promise<ReturnType<typeof sanitizeAutomationRun>> {
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

export async function getRawAutomationByWebhookId(
  prisma: PrismaClient,
  webhookId: string
): Promise<Automation | null> {
  return prisma.automation.findFirst({
    where: { webhookId },
  })
}

export async function getAutomationWebhookUrl(
  prisma: PrismaClient,
  orgId: string,
  automationId: string,
  baseUrl: string
): Promise<string | null> {
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, orgId, trigger: 'WEBHOOK' },
  })
  if (!automation?.webhookId) return null

  return `${baseUrl}/api/v1/webhooks/connectors/${automation.webhookId}`
}
