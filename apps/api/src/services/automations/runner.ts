// ─── Automation runner ───────────────────────────────────────
// Executes scheduled and triggered automations with retry, circuit
// breaker, and idempotency support. Called by the automation-runner job.

import type { PrismaClient, Automation, AutomationRun, Integration } from '@prisma/client'
import { CronExpressionParser } from 'cron-parser'
import {
  getDecryptedSecrets,
  parseIntegrationConfig,
} from '../../lib/connectors/secrets'
import {
  httpClientFromIntegration,
  executeHttpRequest,
  isCredentialsRejected,
  isRetryableStatus,
  type HttpResponse,
  type HttpError,
} from '../../lib/connectors/httpClient'
import { withRetry, parseRetryPolicy, DEFAULT_RETRY_POLICY } from '../../lib/connectors/retry'
import {
  shouldSkipExecution,
  recordSuccess,
  recordFailure,
} from '../../lib/connectors/circuitBreaker'
import {
  generateRequestId,
  isDuplicateRun,
  parseWindowKey,
  generateIdempotencyKey,
} from '../../lib/connectors/idempotency'
import { sanitizeAutomationRun } from '../../lib/connectors/mask'

export interface RunResult {
  runId: string
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  durationMs: number
  httpStatus?: number
  error?: string
  retryCount: number
}

export interface BatchRunResult {
  processed: number
  succeeded: number
  failed: number
  skipped: number
  results: RunResult[]
}

const MAX_AUTOMATIONS_PER_BATCH = 50

function computeNextRunAt(schedule: string | null, now: Date = new Date()): Date | null {
  if (!schedule) return null
  try {
    const expr = CronExpressionParser.parse(schedule, { currentDate: now })
    return expr.next().toDate()
  } catch {
    return null
  }
}

async function executeAutomation(
  prisma: PrismaClient,
  automation: Automation,
  integration: Integration,
  trigger: string,
  inputPayload?: unknown
): Promise<RunResult> {
  const startTime = Date.now()
  const requestId = generateRequestId()
  const windowKey = parseWindowKey(automation.schedule)
  const idempotencyKey = generateIdempotencyKey({
    automationId: automation.id,
    trigger,
    windowKey,
  })

  const skipCheck = shouldSkipExecution(integration)
  if (skipCheck.skip) {
    return {
      runId: '',
      status: 'SKIPPED',
      durationMs: Date.now() - startTime,
      error: skipCheck.reason,
      retryCount: 0,
    }
  }

  const isDuplicate = await isDuplicateRun(prisma, automation.id, requestId)
  if (isDuplicate) {
    return {
      runId: '',
      status: 'SKIPPED',
      durationMs: Date.now() - startTime,
      error: 'Duplicate run within window',
      retryCount: 0,
    }
  }

  const run = await prisma.automationRun.create({
    data: {
      automationId: automation.id,
      orgId: automation.orgId,
      trigger,
      requestId,
      status: 'RUNNING',
      inputSnapshot: inputPayload ? JSON.parse(JSON.stringify(inputPayload)) : null,
    },
  })

  const parsed = parseIntegrationConfig(integration.config)
  const secrets = getDecryptedSecrets(integration.config)
  const client = httpClientFromIntegration(parsed, secrets)

  if (!client) {
    const error = 'No base URL configured on integration'
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: error,
        durationMs: Date.now() - startTime,
      },
    })
    return {
      runId: run.id,
      status: 'FAILED',
      durationMs: Date.now() - startTime,
      error,
      retryCount: 0,
    }
  }

  const config = automation.config as Record<string, unknown>
  const path = (config.path as string) || '/'
  const method = ((config.method as string) || 'POST').toUpperCase()
  const body = config.body || inputPayload

  const retryPolicy = parseRetryPolicy(automation.retryPolicy)
  let retryCount = 0

  const result = await withRetry(
    async () => {
      retryCount++
      const response = await client.post(path, body, {
        'X-Request-Id': requestId,
        'X-Idempotency-Key': idempotencyKey,
      })

      if (!response.ok) {
        const error: any = new Error(`HTTP ${response.status}: ${response.statusText}`)
        error.status = response.status
        error.retryable = isRetryableStatus(response.status)
        throw error
      }

      const contentType = response.headers['content-type'] || ''
      if (response.ok && !contentType.includes('application/json')) {
        const error: any = new Error('Response is not JSON')
        error.status = response.status
        error.retryable = false
        throw error
      }

      return response
    },
    retryPolicy
  )

  const durationMs = Date.now() - startTime

  if (result.success && result.result) {
    const response = result.result
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCESS',
        completedAt: new Date(),
        httpStatus: response.status,
        outputSnapshot: response.body as any,
        durationMs,
        retryCount: retryCount - 1,
      },
    })

    await recordSuccess(prisma, integration.id)

    await prisma.automation.update({
      where: { id: automation.id },
      data: {
        lastRunAt: new Date(),
        lastRunOk: true,
        lastError: null,
        consecutiveFailures: 0,
        nextRunAt: computeNextRunAt(automation.schedule),
      },
    })

    return {
      runId: run.id,
      status: 'SUCCESS',
      durationMs,
      httpStatus: response.status,
      retryCount: retryCount - 1,
    }
  }

  const errorMessage = result.error?.message ?? 'Unknown error'
  const httpStatus = (result.error as any)?.status

  await prisma.automationRun.update({
    where: { id: run.id },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
      httpStatus,
      errorMessage,
      durationMs,
      retryCount: retryCount - 1,
    },
  })

  const isAuthError = isCredentialsRejected(httpStatus)
  if (isAuthError) {
    await recordFailure(prisma, integration.id, `Credentials rejected: ${errorMessage}`)
  }

  const newFailures = automation.consecutiveFailures + 1
  await prisma.automation.update({
    where: { id: automation.id },
    data: {
      lastRunAt: new Date(),
      lastRunOk: false,
      lastError: errorMessage,
      consecutiveFailures: newFailures,
      status: newFailures >= 5 ? 'ERROR' : automation.status,
      nextRunAt: computeNextRunAt(automation.schedule),
    },
  })

  return {
    runId: run.id,
    status: 'FAILED',
    durationMs,
    httpStatus,
    error: errorMessage,
    retryCount: retryCount - 1,
  }
}

export async function runDueAutomations(prisma: PrismaClient): Promise<BatchRunResult> {
  const now = new Date()

  const dueAutomations = await prisma.automation.findMany({
    where: {
      status: 'ACTIVE',
      trigger: 'SCHEDULE',
      nextRunAt: { lte: now },
    },
    orderBy: { nextRunAt: 'asc' },
    take: MAX_AUTOMATIONS_PER_BATCH,
    include: {
      integration: true,
    },
  })

  const validAutomations = dueAutomations.filter((a) => {
    const orgExists = a.integration?.orgId
    return orgExists
  })

  const results: RunResult[] = []
  let succeeded = 0
  let failed = 0
  let skipped = 0

  for (const automation of validAutomations) {
    try {
      if (!automation.integration) {
        results.push({
          runId: '',
          status: 'SKIPPED',
          durationMs: 0,
          error: 'Integration not found',
          retryCount: 0,
        })
        skipped++
        continue
      }

      const result = await executeAutomation(
        prisma,
        automation,
        automation.integration,
        'SCHEDULE'
      )
      results.push(result)

      switch (result.status) {
        case 'SUCCESS':
          succeeded++
          break
        case 'FAILED':
          failed++
          break
        case 'SKIPPED':
          skipped++
          break
      }
    } catch (error) {
      results.push({
        runId: '',
        status: 'FAILED',
        durationMs: 0,
        error: error instanceof Error ? error.message : String(error),
        retryCount: 0,
      })
      failed++

      await prisma.automation.update({
        where: { id: automation.id },
        data: {
          lastRunAt: now,
          lastRunOk: false,
          lastError: error instanceof Error ? error.message : String(error),
          consecutiveFailures: { increment: 1 },
          nextRunAt: computeNextRunAt(automation.schedule),
        },
      })
    }
  }

  return {
    processed: validAutomations.length,
    succeeded,
    failed,
    skipped,
    results,
  }
}

export async function runPendingAutomations(prisma: PrismaClient): Promise<BatchRunResult> {
  const pendingRuns = await prisma.automationRun.findMany({
    where: { status: 'PENDING' },
    orderBy: { startedAt: 'asc' },
    take: MAX_AUTOMATIONS_PER_BATCH,
    include: {
      automation: {
        include: {
          integration: true,
        },
      },
    },
  })

  const results: RunResult[] = []
  let succeeded = 0
  let failed = 0
  let skipped = 0

  for (const run of pendingRuns) {
    try {
      if (!run.automation?.integration) {
        await prisma.automationRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorMessage: 'Integration not found',
          },
        })
        results.push({
          runId: run.id,
          status: 'SKIPPED',
          durationMs: 0,
          error: 'Integration not found',
          retryCount: 0,
        })
        skipped++
        continue
      }

      const result = await executeAutomation(
        prisma,
        run.automation,
        run.automation.integration,
        run.trigger,
        run.inputSnapshot
      )

      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: result.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          completedAt: new Date(),
          httpStatus: result.httpStatus,
          errorMessage: result.error,
          durationMs: result.durationMs,
          retryCount: result.retryCount,
        },
      })

      results.push({ ...result, runId: run.id })

      switch (result.status) {
        case 'SUCCESS':
          succeeded++
          break
        case 'FAILED':
          failed++
          break
        case 'SKIPPED':
          skipped++
          break
      }
    } catch (error) {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      })
      results.push({
        runId: run.id,
        status: 'FAILED',
        durationMs: 0,
        error: error instanceof Error ? error.message : String(error),
        retryCount: 0,
      })
      failed++
    }
  }

  return {
    processed: pendingRuns.length,
    succeeded,
    failed,
    skipped,
    results,
  }
}

export async function runWebhookAutomation(
  prisma: PrismaClient,
  webhookId: string,
  payload: unknown,
  signature?: string
): Promise<RunResult> {
  const automation = await prisma.automation.findFirst({
    where: { webhookId, trigger: 'WEBHOOK' },
    include: { integration: true },
  })

  if (!automation) {
    return {
      runId: '',
      status: 'FAILED',
      durationMs: 0,
      error: 'Webhook not found',
      retryCount: 0,
    }
  }

  if (automation.status !== 'ACTIVE') {
    return {
      runId: '',
      status: 'SKIPPED',
      durationMs: 0,
      error: `Automation is ${automation.status.toLowerCase()}`,
      retryCount: 0,
    }
  }

  if (!automation.integration) {
    return {
      runId: '',
      status: 'FAILED',
      durationMs: 0,
      error: 'Integration not found',
      retryCount: 0,
    }
  }

  return executeAutomation(
    prisma,
    automation,
    automation.integration,
    'WEBHOOK',
    payload
  )
}
