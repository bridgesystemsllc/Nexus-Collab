// ─── Circuit breaker ─────────────────────────────────────────
// Prevents repeated calls to failing integrations.
// Opens circuit after consecutive failures; auto-closes after cooldown.

import type { PrismaClient, Integration } from '@prisma/client'

export interface CircuitBreakerConfig {
  failureThreshold: number
  cooldownMs: number
}

// §5.2: 5 failures → circuitOpenUntil now + 15 minutes
export const CIRCUIT_THRESHOLD = 5
export const CIRCUIT_OPEN_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: CIRCUIT_THRESHOLD,
  cooldownMs: CIRCUIT_OPEN_DURATION_MS,
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export function getCircuitState(integration: Integration): CircuitState {
  if (!integration.circuitOpenUntil) return 'CLOSED'
  const now = new Date()
  if (integration.circuitOpenUntil <= now) return 'HALF_OPEN'
  return 'OPEN'
}

export function isCircuitOpen(integration: Integration): boolean {
  return getCircuitState(integration) === 'OPEN'
}

export function shouldSkipExecution(integration: Integration): {
  skip: boolean
  reason?: string
} {
  if (integration.paused) {
    return { skip: true, reason: 'PAUSED' }
  }
  if (integration.status === 'ERROR') {
    return { skip: true, reason: 'ERROR_STATUS' }
  }
  const state = getCircuitState(integration)
  if (state === 'OPEN') {
    return {
      skip: true,
      reason: `CIRCUIT_OPEN until ${integration.circuitOpenUntil?.toISOString()}`,
    }
  }
  return { skip: false }
}

export async function recordSuccess(
  prisma: PrismaClient,
  integrationId: string
): Promise<void> {
  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      consecutiveFailures: 0,
      circuitOpenUntil: null,
      status: 'CONNECTED',
      lastError: null,
    },
  })
}

export async function recordFailure(
  prisma: PrismaClient,
  integrationId: string,
  error: string,
  config: Partial<CircuitBreakerConfig> = {}
): Promise<{ circuitOpened: boolean }> {
  const fullConfig = { ...DEFAULT_CIRCUIT_CONFIG, ...config }

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  })
  if (!integration) return { circuitOpened: false }

  const newFailures = integration.consecutiveFailures + 1
  const shouldOpenCircuit = newFailures >= fullConfig.failureThreshold

  const circuitOpenUntil = shouldOpenCircuit
    ? new Date(Date.now() + fullConfig.cooldownMs)
    : integration.circuitOpenUntil

  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      consecutiveFailures: newFailures,
      circuitOpenUntil,
      status: shouldOpenCircuit ? 'ERROR' : integration.status,
      lastError: error,
    },
  })

  return { circuitOpened: shouldOpenCircuit }
}

export async function resetCircuit(
  prisma: PrismaClient,
  integrationId: string
): Promise<void> {
  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      consecutiveFailures: 0,
      circuitOpenUntil: null,
      status: 'CONNECTED',
    },
  })
}

export async function openCircuit(
  prisma: PrismaClient,
  integrationId: string,
  error: string,
  cooldownMs: number = DEFAULT_CIRCUIT_CONFIG.cooldownMs
): Promise<void> {
  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      circuitOpenUntil: new Date(Date.now() + cooldownMs),
      status: 'ERROR',
      lastError: error,
    },
  })
}
