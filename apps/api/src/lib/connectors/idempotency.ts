// ─── Idempotency key handling ────────────────────────────────
// Generate and validate idempotency keys for deduplication.
// Unique window keys ensure duplicate webhooks are processed once.

import crypto from 'crypto'
import type { PrismaClient } from '@prisma/client'

export interface IdempotencyKeyParts {
  automationId: string
  trigger: string
  windowKey?: string
}

export function generateIdempotencyKey(parts: IdempotencyKeyParts): string {
  const content = [
    parts.automationId,
    parts.trigger,
    parts.windowKey || new Date().toISOString(),
  ].join(':')
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 32)
}

export function generateRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

export function generateWebhookId(): string {
  return `whk_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('base64url')}`
}

export function computeWebhookSignature(
  payload: string,
  secret: string,
  algorithm: 'hmac-sha256' | 'hmac-sha1' = 'hmac-sha256'
): string {
  const alg = algorithm === 'hmac-sha1' ? 'sha1' : 'sha256'
  return crypto.createHmac(alg, secret).update(payload).digest('hex')
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: 'hmac-sha256' | 'hmac-sha1' = 'hmac-sha256'
): boolean {
  const expected = computeWebhookSignature(payload, secret, algorithm)
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function isDuplicateRun(
  prisma: PrismaClient,
  automationId: string,
  idempotencyKey: string,
  windowMs: number = 300000
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs)
  const existing = await prisma.automationRun.findFirst({
    where: {
      automationId,
      idempotencyKey,
      startedAt: { gte: windowStart },
    },
    select: { id: true },
  })
  return existing !== null
}

export async function getLastRunInWindow(
  prisma: PrismaClient,
  automationId: string,
  trigger: string,
  windowMs: number = 300000
): Promise<{ id: string; status: string; startedAt: Date } | null> {
  const windowStart = new Date(Date.now() - windowMs)
  return prisma.automationRun.findFirst({
    where: {
      automationId,
      trigger,
      startedAt: { gte: windowStart },
    },
    orderBy: { startedAt: 'desc' },
    select: { id: true, status: true, startedAt: true },
  })
}

export function parseWindowKey(schedule: string | null, now: Date = new Date()): string {
  if (!schedule) return now.toISOString()

  const minuteWindow = Math.floor(now.getMinutes() / 5) * 5
  const hourWindow = now.getUTCHours()
  const dateStr = now.toISOString().slice(0, 10)

  if (schedule.includes('* * *') || schedule.startsWith('*/')) {
    return `${dateStr}T${hourWindow.toString().padStart(2, '0')}:${minuteWindow.toString().padStart(2, '0')}`
  }
  if (schedule.includes('0 * * *')) {
    return `${dateStr}T${hourWindow.toString().padStart(2, '0')}:00`
  }
  return `${dateStr}T00:00`
}
