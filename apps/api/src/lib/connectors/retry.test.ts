import { describe, it, expect, vi } from 'vitest'
import { withRetry, DEFAULT_RETRY_POLICY, parseRetryPolicy } from './retry'

describe('withRetry', () => {
  it('returns success result on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success')

    const result = await withRetry(fn, { maxAttempts: 3 })

    expect(result.success).toBe(true)
    expect(result.result).toBe('success')
    expect(result.attempts).toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on retryable failure and succeeds', async () => {
    const retryableError = Object.assign(new Error('fail'), { retryable: true })
    const fn = vi.fn()
      .mockRejectedValueOnce(retryableError)
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValue('success')

    const result = await withRetry(fn, { maxAttempts: 4, baseDelayMs: 10, maxDelayMs: 50 })

    expect(result.success).toBe(true)
    expect(result.result).toBe('success')
    expect(result.attempts).toBe(3)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('returns failure after all retries exhausted', async () => {
    const retryableError = Object.assign(new Error('persistent failure'), { retryable: true })
    const fn = vi.fn().mockRejectedValue(retryableError)

    const result = await withRetry(fn, { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 50 })

    expect(result.success).toBe(false)
    expect(result.error?.message).toBe('persistent failure')
    expect(result.attempts).toBe(2)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('stops retrying immediately on credentials rejection (401)', async () => {
    const credError = Object.assign(new Error('Unauthorized'), { status: 401 })
    const fn = vi.fn().mockRejectedValue(credError)

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })

    expect(result.success).toBe(false)
    expect(result.attempts).toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('stops retrying immediately on credentials rejection (403)', async () => {
    const credError = Object.assign(new Error('Forbidden'), { status: 403 })
    const fn = vi.fn().mockRejectedValue(credError)

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })

    expect(result.success).toBe(false)
    expect(result.attempts).toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on retryable status codes', async () => {
    const error429 = Object.assign(new Error('Rate Limited'), { status: 429 })
    const fn = vi.fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValue('success')

    const result = await withRetry(fn, { 
      maxAttempts: 3, 
      baseDelayMs: 10, 
      maxDelayMs: 50,
      retryableStatuses: [429, 502, 503, 504],
    })

    expect(result.success).toBe(true)
    expect(result.attempts).toBe(2)
  })

  it('retries on TIMEOUT code', async () => {
    const timeoutError = Object.assign(new Error('Timeout'), { code: 'TIMEOUT' })
    const fn = vi.fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValue('success')

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50 })

    expect(result.success).toBe(true)
    expect(result.attempts).toBe(2)
  })

  it('retries on NETWORK_ERROR code', async () => {
    const networkError = Object.assign(new Error('Network Error'), { code: 'NETWORK_ERROR' })
    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue('success')

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50 })

    expect(result.success).toBe(true)
    expect(result.attempts).toBe(2)
  })

  it('tracks total duration', async () => {
    const fn = vi.fn().mockResolvedValue('success')

    const result = await withRetry(fn)

    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0)
  })
})

describe('parseRetryPolicy', () => {
  it('returns default policy for invalid input', () => {
    expect(parseRetryPolicy(null)).toEqual(DEFAULT_RETRY_POLICY)
    expect(parseRetryPolicy(undefined)).toEqual(DEFAULT_RETRY_POLICY)
    expect(parseRetryPolicy('string')).toEqual(DEFAULT_RETRY_POLICY)
  })

  it('parses valid policy', () => {
    const policy = parseRetryPolicy({
      maxAttempts: 5,
      baseDelayMs: 2000,
      maxDelayMs: 60000,
      backoffMultiplier: 3,
      retryableStatuses: [429, 500],
    })

    expect(policy.maxAttempts).toBe(5)
    expect(policy.baseDelayMs).toBe(2000)
    expect(policy.maxDelayMs).toBe(60000)
    expect(policy.backoffMultiplier).toBe(3)
    expect(policy.retryableStatuses).toEqual([429, 500])
  })

  it('uses defaults for missing fields', () => {
    const policy = parseRetryPolicy({ maxAttempts: 5 })

    expect(policy.maxAttempts).toBe(5)
    expect(policy.baseDelayMs).toBe(DEFAULT_RETRY_POLICY.baseDelayMs)
    expect(policy.maxDelayMs).toBe(DEFAULT_RETRY_POLICY.maxDelayMs)
  })
})
