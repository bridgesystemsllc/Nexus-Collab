// ─── Automation runner ───────────────────────────────────────
// Executes scheduled and triggered automations with retry, circuit
// breaker, and idempotency support. Called by the automation-runner job.
// §5.8 + §6 compliant.

import type { PrismaClient, Automation, AutomationRun, Integration } from '@prisma/client'
import { Prisma } from '@prisma/client'
import {
  getDecryptedSecrets,
  parseIntegrationConfig,
} from '../../lib/connectors/secrets'
import {
  httpClientFromIntegration,
  isCredentialsRejected,
  isRetryableStatus,
  type HttpClient,
} from '../../lib/connectors/httpClient'
import { withRetry, parseRetryPolicy, DEFAULT_RETRY_POLICY } from '../../lib/connectors/retry'
import {
  shouldSkipExecution,
  recordSuccess,
  recordFailure,
  isCircuitOpen,
  CIRCUIT_THRESHOLD,
  CIRCUIT_OPEN_DURATION_MS,
} from '../../lib/connectors/circuitBreaker'
import { generateRequestId } from '../../lib/connectors/idempotency'
import { sanitizeAutomationRun } from '../../lib/connectors/mask'

// §5.2: Run statuses
export type RunStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED'

// §6: Skip codes
export type SkipCode =
  | 'connector_paused'
  | 'connector_error'
  | 'connector_disconnected'
  | 'circuit_open'
  | 'ORG_DELETED'
  | 'automation_not_active'
  | 'duplicate_run'

// §6: Error codes
export type ErrorCode =
  | 'TIMEOUT'
  | 'CREDENTIALS_REJECTED'
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'UNKNOWN'

export interface RunResult {
  runId: string
  status: RunStatus
  durationMs: number
  httpStatus?: number
  error?: { code: ErrorCode; message: string; retryable: boolean }
  requestSummary?: { method: string; host: string; path: string }
  recordsProcessed: number
  recordsFailed: number
  retryCount: number
  duplicate?: boolean
}

export interface BatchRunResult {
  processed: number
  succeeded: number
  failed: number
  skipped: number
  results: RunResult[]
}

const MAX_AUTOMATIONS_PER_BATCH = 50

// §5.8: Timeouts
const ACTION_TIMEOUT_MS = 10_000
const TEST_TIMEOUT_MS = 8_000
const MAX_ATTEMPTS = 3

/**
 * §5.8: Compute unique window key for SCHEDULE automations
 * Format: schedule:{automationId}:{floorToWindow(now, everyMinutes, timezone)}
 */
function computeWindowKey(
  automationId: string,
  triggerConfig: Record<string, unknown> | null,
  now: Date = new Date()
): string {
  if (!triggerConfig) return `schedule:${automationId}:${now.toISOString()}`

  const everyMinutes = (triggerConfig.everyMinutes as number) || 15
  const timezone = (triggerConfig.timezone as string) || 'UTC'

  const ms = now.getTime()
  const windowMs = everyMinutes * 60 * 1000
  const flooredMs = Math.floor(ms / windowMs) * windowMs
  const flooredDate = new Date(flooredMs)

  return `schedule:${automationId}:${flooredDate.toISOString()}`
}

/**
 * §5.2: Compute next run time based on triggerConfig.everyMinutes
 */
function computeNextRunAt(
  triggerConfig: Record<string, unknown> | null,
  now: Date = new Date()
): Date | null {
  if (!triggerConfig) return null
  const everyMinutes = triggerConfig.everyMinutes as number
  if (!everyMinutes || typeof everyMinutes !== 'number') return null

  const ms = now.getTime()
  const windowMs = everyMinutes * 60 * 1000
  const nextMs = Math.ceil(ms / windowMs) * windowMs
  return new Date(nextMs)
}

/**
 * §6: Check if we should skip this automation and return the skip code
 */
function getSkipReason(
  automation: Automation,
  connector: Integration | null
): { skip: true; code: SkipCode; message: string } | { skip: false } {
  // Check automation status
  if (automation.status !== 'ACTIVE') {
    return {
      skip: true,
      code: 'automation_not_active',
      message: `Automation is ${automation.status.toLowerCase()}`,
    }
  }

  // Check connector exists
  if (!connector) {
    return {
      skip: true,
      code: 'connector_error',
      message: 'Connector not found',
    }
  }

  // Check connector status
  if (connector.status === 'DISCONNECTED') {
    return {
      skip: true,
      code: 'connector_disconnected',
      message: 'Connector is disconnected',
    }
  }

  if (connector.status === 'ERROR') {
    return {
      skip: true,
      code: 'connector_error',
      message: 'Connector is in error state',
    }
  }

  // Check connector paused
  if (connector.paused) {
    return {
      skip: true,
      code: 'connector_paused',
      message: 'Connector is paused',
    }
  }

  // §5.8: Check circuit breaker (5 failures → open for 15 minutes)
  if (isCircuitOpen(connector)) {
    return {
      skip: true,
      code: 'circuit_open',
      message: 'Circuit breaker is open',
    }
  }

  return { skip: false }
}

/**
 * §5.8: Check for duplicate run within the idempotency window
 */
async function checkDuplicate(
  prisma: PrismaClient,
  automationId: string,
  idempotencyKey: string
): Promise<{ duplicate: boolean; existingRunId?: string }> {
  const existing = await prisma.automationRun.findFirst({
    where: {
      automationId,
      idempotencyKey,
      status: { in: ['SUCCESS', 'PARTIAL'] },
    },
  })

  if (existing) {
    return { duplicate: true, existingRunId: existing.id }
  }

  return { duplicate: false }
}

/**
 * §5.8: Execute a single automation
 */
async function executeAutomation(
  prisma: PrismaClient,
  automation: Automation,
  connector: Integration,
  trigger: string,
  inputPayload?: unknown
): Promise<RunResult> {
  const startTime = Date.now()
  const requestId = generateRequestId()

  // §5.8: Compute idempotency key using window
  const triggerConfig = automation.triggerConfig as Record<string, unknown>
  const idempotencyKey = computeWindowKey(automation.id, triggerConfig)

  // §6: Check skip conditions
  const skipCheck = getSkipReason(automation, connector)
  if (skipCheck.skip) {
    // Create a SKIPPED run record
    const run = await prisma.automationRun.create({
      data: {
        automationId: automation.id,
        orgId: automation.orgId,
        trigger,
        idempotencyKey,
        status: 'SKIPPED',
        error: { code: skipCheck.code, message: skipCheck.message, retryable: false } as Prisma.InputJsonValue,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      },
    })

    return {
      runId: run.id,
      status: 'SKIPPED',
      durationMs: Date.now() - startTime,
      error: { code: skipCheck.code as ErrorCode, message: skipCheck.message, retryable: false },
      recordsProcessed: 0,
      recordsFailed: 0,
      retryCount: 0,
    }
  }

  // §5.8: Check for duplicate run
  const dupCheck = await checkDuplicate(prisma, automation.id, idempotencyKey)
  if (dupCheck.duplicate) {
    return {
      runId: dupCheck.existingRunId!,
      status: 'SUCCESS',
      durationMs: 0,
      recordsProcessed: 0,
      recordsFailed: 0,
      retryCount: 0,
      duplicate: true,
    }
  }

  // Create run record
  const run = await prisma.automationRun.create({
    data: {
      automationId: automation.id,
      orgId: automation.orgId,
      trigger,
      idempotencyKey,
      status: 'RUNNING',
      inputSnapshot: inputPayload ? (JSON.parse(JSON.stringify(inputPayload)) as Prisma.InputJsonValue) : Prisma.JsonNull,
      startedAt: new Date(),
    },
  })

  // Build HTTP client from connector config
  const parsed = parseIntegrationConfig(connector.config)
  const secrets = getDecryptedSecrets(connector.config)
  const client = httpClientFromIntegration(parsed, secrets)

  if (!client) {
    const error = { code: 'PARSE_ERROR' as ErrorCode, message: 'No base URL configured on connector', retryable: false }
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: error as Prisma.InputJsonValue,
        durationMs: Date.now() - startTime,
      },
    })
    return {
      runId: run.id,
      status: 'FAILED',
      durationMs: Date.now() - startTime,
      error,
      recordsProcessed: 0,
      recordsFailed: 0,
      retryCount: 0,
    }
  }

  // Get action config
  const actionConfig = automation.actionConfig as Record<string, unknown>
  const path = (actionConfig.path as string) || '/'
  const method = ((actionConfig.method as string) || 'POST').toUpperCase()
  const body = actionConfig.body || inputPayload
  const headers = (actionConfig.headers as Record<string, string>) || {}

  // Build request summary
  const host = parsed.baseUrl || parsed.serverUrl || 'unknown'
  const requestSummary = { method, host, path }

  // Execute with retry and timeout
  const retryPolicy = parseRetryPolicy(automation.retryPolicy)
  retryPolicy.maxAttempts = MAX_ATTEMPTS

  let retryCount = 0
  let httpStatus: number | undefined
  let errorResult: { code: ErrorCode; message: string; retryable: boolean } | undefined

  try {
    const result = await withRetry(
      async () => {
        retryCount++

        // Create abort controller for timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), ACTION_TIMEOUT_MS)

        try {
          const response = await client.request(method, path, body, {
            ...headers,
            'X-Request-Id': requestId,
            'X-Idempotency-Key': idempotencyKey,
          })

          clearTimeout(timeoutId)
          httpStatus = response.status

          if (!response.ok) {
            const err: any = new Error(`HTTP ${response.status}: ${response.statusText}`)
            err.status = response.status
            // §6: 401/403 CREDENTIALS_REJECTED stops remaining items, no circuit trip
            if (isCredentialsRejected(response.status)) {
              err.retryable = false
              err.code = 'CREDENTIALS_REJECTED'
            } else {
              err.retryable = isRetryableStatus(response.status)
            }
            throw err
          }

          // Check for JSON response
          const contentType = response.headers['content-type'] || ''
          if (!contentType.includes('application/json') && response.body) {
            const err: any = new Error('Response is not JSON')
            err.status = response.status
            err.retryable = false
            throw err
          }

          return response
        } catch (err: any) {
          clearTimeout(timeoutId)

          // §6: Handle timeout
          if (err.name === 'AbortError' || err.message?.includes('abort')) {
            const timeoutErr: any = new Error('Request timed out')
            timeoutErr.code = 'TIMEOUT'
            timeoutErr.retryable = true
            throw timeoutErr
          }

          throw err
        }
      },
      retryPolicy
    )

    const durationMs = Date.now() - startTime

    if (result.success && result.result) {
      // Success
      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          httpStatus,
          requestSummary: requestSummary as Prisma.InputJsonValue,
          outputSnapshot: result.result.body as Prisma.InputJsonValue,
          durationMs,
          retryCount: retryCount - 1,
          recordsProcessed: 1,
        },
      })

      // Record success on connector (resets circuit breaker)
      await recordSuccess(prisma, connector.id)

      // Update automation
      await prisma.automation.update({
        where: { id: automation.id },
        data: {
          lastRunAt: new Date(),
          lastRunOk: true,
          lastError: null,
          consecutiveFailures: 0,
          nextRunAt: computeNextRunAt(triggerConfig),
        },
      })

      return {
        runId: run.id,
        status: 'SUCCESS',
        durationMs,
        httpStatus,
        requestSummary,
        recordsProcessed: 1,
        recordsFailed: 0,
        retryCount: retryCount - 1,
      }
    }

    // Failure
    const err = result.error as any
    errorResult = {
      code: err?.code || (isCredentialsRejected(err?.status) ? 'CREDENTIALS_REJECTED' : 'HTTP_ERROR'),
      message: err?.message || 'Unknown error',
      retryable: err?.retryable ?? false,
    }
  } catch (err: any) {
    const durationMs = Date.now() - startTime

    // §6: Handle timeout
    if (err.code === 'TIMEOUT' || err.name === 'AbortError') {
      errorResult = { code: 'TIMEOUT', message: 'Request timed out', retryable: true }
    } else if (err.code === 'CREDENTIALS_REJECTED') {
      errorResult = { code: 'CREDENTIALS_REJECTED', message: err.message, retryable: false }
    } else {
      errorResult = {
        code: 'UNKNOWN',
        message: err.message || 'Unknown error',
        retryable: false,
      }
    }
  }

  const durationMs = Date.now() - startTime

  // Update run with failure
  await prisma.automationRun.update({
    where: { id: run.id },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
      httpStatus,
      requestSummary: requestSummary as Prisma.InputJsonValue,
      error: errorResult as Prisma.InputJsonValue,
      durationMs,
      retryCount: retryCount - 1,
      recordsProcessed: 0,
      recordsFailed: 1,
    },
  })

  // §6: 401/403 does NOT trip circuit breaker
  if (errorResult?.code !== 'CREDENTIALS_REJECTED') {
    await recordFailure(prisma, connector.id, errorResult?.message)
  }

  // Update automation failure count
  const newFailures = automation.consecutiveFailures + 1
  await prisma.automation.update({
    where: { id: automation.id },
    data: {
      lastRunAt: new Date(),
      lastRunOk: false,
      lastError: errorResult?.message,
      consecutiveFailures: newFailures,
      status: newFailures >= 5 ? 'ERROR' : automation.status,
      nextRunAt: computeNextRunAt(triggerConfig),
    },
  })

  return {
    runId: run.id,
    status: 'FAILED',
    durationMs,
    httpStatus,
    requestSummary,
    error: errorResult,
    recordsProcessed: 0,
    recordsFailed: 1,
    retryCount: retryCount - 1,
  }
}

/**
 * §5.8: Run all due scheduled automations
 */
export async function runDueAutomations(prisma: PrismaClient): Promise<BatchRunResult> {
  const now = new Date()

  const dueAutomations = await prisma.automation.findMany({
    where: {
      status: 'ACTIVE',
      triggerType: 'SCHEDULE',
      nextRunAt: { lte: now },
    },
    orderBy: { nextRunAt: 'asc' },
    take: MAX_AUTOMATIONS_PER_BATCH,
    include: {
      connector: true,
    },
  })

  const results: RunResult[] = []
  let succeeded = 0
  let failed = 0
  let skipped = 0

  for (const automation of dueAutomations) {
    try {
      const result = await executeAutomation(
        prisma,
        automation,
        automation.connector,
        'SCHEDULE'
      )
      results.push(result)

      switch (result.status) {
        case 'SUCCESS':
        case 'PARTIAL':
          succeeded++
          break
        case 'FAILED':
          failed++
          break
        case 'SKIPPED':
          skipped++
          break
      }

      // If this was a duplicate, count as skipped
      if (result.duplicate) {
        succeeded--
        skipped++
      }
    } catch (error) {
      const triggerConfig = automation.triggerConfig as Record<string, unknown>
      results.push({
        runId: '',
        status: 'FAILED',
        durationMs: 0,
        error: {
          code: 'UNKNOWN',
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        },
        recordsProcessed: 0,
        recordsFailed: 0,
        retryCount: 0,
      })
      failed++

      // Update automation to prevent tight failure loop
      await prisma.automation.update({
        where: { id: automation.id },
        data: {
          lastRunAt: now,
          lastRunOk: false,
          lastError: error instanceof Error ? error.message : String(error),
          consecutiveFailures: { increment: 1 },
          nextRunAt: computeNextRunAt(triggerConfig),
        },
      })
    }
  }

  return {
    processed: dueAutomations.length,
    succeeded,
    failed,
    skipped,
    results,
  }
}

/**
 * §5.8: Run pending (QUEUED) automation runs - for immediate execution via POST /:id/run
 */
export async function runPendingAutomations(prisma: PrismaClient): Promise<BatchRunResult> {
  const pendingRuns = await prisma.automationRun.findMany({
    where: { status: 'QUEUED' },
    orderBy: { startedAt: 'asc' },
    take: MAX_AUTOMATIONS_PER_BATCH,
    include: {
      automation: {
        include: {
          connector: true,
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
      if (!run.automation?.connector) {
        await prisma.automationRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            error: { code: 'PARSE_ERROR', message: 'Connector not found', retryable: false } as Prisma.InputJsonValue,
          },
        })
        results.push({
          runId: run.id,
          status: 'SKIPPED',
          durationMs: 0,
          error: { code: 'PARSE_ERROR', message: 'Connector not found', retryable: false },
          recordsProcessed: 0,
          recordsFailed: 0,
          retryCount: 0,
        })
        skipped++
        continue
      }

      const result = await executeAutomation(
        prisma,
        run.automation,
        run.automation.connector,
        run.trigger,
        run.inputSnapshot
      )

      results.push({ ...result, runId: run.id })

      switch (result.status) {
        case 'SUCCESS':
        case 'PARTIAL':
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
          error: {
            code: 'UNKNOWN',
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          } as Prisma.InputJsonValue,
        },
      })
      results.push({
        runId: run.id,
        status: 'FAILED',
        durationMs: 0,
        error: {
          code: 'UNKNOWN',
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        },
        recordsProcessed: 0,
        recordsFailed: 0,
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

/**
 * §5.8: Execute automation immediately (for POST /:id/run endpoint)
 */
export async function executeAutomationNow(
  prisma: PrismaClient,
  automation: Automation,
  connector: Integration
): Promise<RunResult> {
  return executeAutomation(prisma, automation, connector, 'MANUAL')
}

/**
 * §5.8: Handle incoming webhook, lookup by Integration.config.webhookId
 * Returns {duplicate: true, runId} if already processed
 */
export async function runWebhookAutomation(
  prisma: PrismaClient,
  webhookId: string,
  payload: unknown,
  signature?: string
): Promise<RunResult & { duplicate?: boolean }> {
  // §5.8: Find connector by webhookId in its config
  const connectors = await prisma.integration.findMany({
    where: { type: 'GENERIC_WEBHOOK' },
  })

  let matchingConnector: Integration | null = null
  for (const c of connectors) {
    const config = c.config as Record<string, unknown>
    if (config?.webhookId === webhookId) {
      matchingConnector = c
      break
    }
  }

  if (!matchingConnector) {
    return {
      runId: '',
      status: 'FAILED',
      durationMs: 0,
      error: { code: 'PARSE_ERROR', message: 'Webhook not found', retryable: false },
      recordsProcessed: 0,
      recordsFailed: 0,
      retryCount: 0,
    }
  }

  // Find active automation for this connector
  const automation = await prisma.automation.findFirst({
    where: {
      connectorId: matchingConnector.id,
      status: 'ACTIVE',
      triggerType: 'WEBHOOK',
    },
  })

  if (!automation) {
    return {
      runId: '',
      status: 'FAILED',
      durationMs: 0,
      error: { code: 'PARSE_ERROR', message: 'No active automation for this webhook', retryable: false },
      recordsProcessed: 0,
      recordsFailed: 0,
      retryCount: 0,
    }
  }

  // Check for duplicate by computing idempotency key from payload
  const payloadStr = JSON.stringify(payload)
  const idempotencyKey = `webhook:${webhookId}:${Buffer.from(payloadStr).toString('base64').slice(0, 32)}`

  const dupCheck = await checkDuplicate(prisma, automation.id, idempotencyKey)
  if (dupCheck.duplicate) {
    // §5.8: Return 200 {duplicate:true, runId} without second run
    return {
      runId: dupCheck.existingRunId!,
      status: 'SUCCESS',
      durationMs: 0,
      recordsProcessed: 0,
      recordsFailed: 0,
      retryCount: 0,
      duplicate: true,
    }
  }

  return executeAutomation(prisma, automation, matchingConnector, 'WEBHOOK', payload)
}
