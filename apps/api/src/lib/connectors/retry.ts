// ─── Retry logic ─────────────────────────────────────────────
// Configurable retry with exponential backoff for transient failures.
// Does NOT retry on credentials rejection (401/403).

export interface RetryPolicy {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  retryableStatuses: number[]
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableStatuses: [429, 502, 503, 504],
}

export interface RetryResult<T> {
  success: boolean
  result?: T
  error?: Error
  attempts: number
  totalDurationMs: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function calculateDelay(attempt: number, policy: RetryPolicy): number {
  const delay = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1)
  const jitter = Math.random() * 0.2 * delay
  return Math.min(delay + jitter, policy.maxDelayMs)
}

export interface RetryableError extends Error {
  retryable?: boolean
  status?: number
  code?: string
}

function isRetryable(error: unknown, policy: RetryPolicy): boolean {
  if (!error) return false
  const err = error as RetryableError
  if (err.retryable === true) return true
  if (err.retryable === false) return false
  if (err.status && policy.retryableStatuses.includes(err.status)) return true
  if (err.code === 'TIMEOUT' || err.code === 'NETWORK_ERROR') return true
  return false
}

function isCredentialsRejected(error: unknown): boolean {
  const err = error as RetryableError
  return err?.status === 401 || err?.status === 403 || err?.code === 'CREDENTIALS_REJECTED'
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: Partial<RetryPolicy> = {}
): Promise<RetryResult<T>> {
  const fullPolicy = { ...DEFAULT_RETRY_POLICY, ...policy }
  const startTime = Date.now()
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= fullPolicy.maxAttempts; attempt++) {
    try {
      const result = await fn()
      return {
        success: true,
        result,
        attempts: attempt,
        totalDurationMs: Date.now() - startTime,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (isCredentialsRejected(error)) {
        return {
          success: false,
          error: lastError,
          attempts: attempt,
          totalDurationMs: Date.now() - startTime,
        }
      }

      if (attempt < fullPolicy.maxAttempts && isRetryable(error, fullPolicy)) {
        const delay = calculateDelay(attempt, fullPolicy)
        await sleep(delay)
        continue
      }

      break
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: fullPolicy.maxAttempts,
    totalDurationMs: Date.now() - startTime,
  }
}

export function parseRetryPolicy(policy: unknown): RetryPolicy {
  if (!policy || typeof policy !== 'object') {
    return DEFAULT_RETRY_POLICY
  }
  const raw = policy as Record<string, unknown>
  return {
    maxAttempts:
      typeof raw.maxAttempts === 'number' ? raw.maxAttempts : DEFAULT_RETRY_POLICY.maxAttempts,
    baseDelayMs:
      typeof raw.baseDelayMs === 'number' ? raw.baseDelayMs : DEFAULT_RETRY_POLICY.baseDelayMs,
    maxDelayMs:
      typeof raw.maxDelayMs === 'number' ? raw.maxDelayMs : DEFAULT_RETRY_POLICY.maxDelayMs,
    backoffMultiplier:
      typeof raw.backoffMultiplier === 'number'
        ? raw.backoffMultiplier
        : DEFAULT_RETRY_POLICY.backoffMultiplier,
    retryableStatuses: Array.isArray(raw.retryableStatuses)
      ? raw.retryableStatuses.filter((s) => typeof s === 'number')
      : DEFAULT_RETRY_POLICY.retryableStatuses,
  }
}
