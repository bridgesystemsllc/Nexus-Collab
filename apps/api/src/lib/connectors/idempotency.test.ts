import { describe, it, expect } from 'vitest'
import {
  generateIdempotencyKey,
  generateRequestId,
  generateWebhookId,
  generateWebhookSecret,
  computeWebhookSignature,
  verifyWebhookSignature,
  parseWindowKey,
} from './idempotency'

describe('generateIdempotencyKey', () => {
  it('generates a unique key per automation and window', () => {
    const key1 = generateIdempotencyKey({ automationId: 'auto-1', trigger: 'SCHEDULE', windowKey: 'window-1' })
    const key2 = generateIdempotencyKey({ automationId: 'auto-1', trigger: 'SCHEDULE', windowKey: 'window-2' })
    const key3 = generateIdempotencyKey({ automationId: 'auto-2', trigger: 'SCHEDULE', windowKey: 'window-1' })

    expect(key1).not.toBe(key2)
    expect(key1).not.toBe(key3)
    expect(key2).not.toBe(key3)
  })

  it('generates deterministic keys for the same inputs', () => {
    const key1 = generateIdempotencyKey({ automationId: 'auto-1', trigger: 'SCHEDULE', windowKey: 'window-1' })
    const key2 = generateIdempotencyKey({ automationId: 'auto-1', trigger: 'SCHEDULE', windowKey: 'window-1' })

    expect(key1).toBe(key2)
  })

  it('produces 32 character hex keys', () => {
    const key = generateIdempotencyKey({ automationId: 'auto-1', trigger: 'WEBHOOK' })
    expect(key).toMatch(/^[a-f0-9]{32}$/)
  })
})

describe('generateRequestId', () => {
  it('generates a unique request ID', () => {
    const id1 = generateRequestId()
    const id2 = generateRequestId()

    expect(id1).not.toBe(id2)
  })

  it('has the correct prefix format', () => {
    const id = generateRequestId()
    expect(id).toMatch(/^req_[a-f0-9]{24}$/)
  })
})

describe('generateWebhookId', () => {
  it('generates a unique webhook ID', () => {
    const id1 = generateWebhookId()
    const id2 = generateWebhookId()

    expect(id1).not.toBe(id2)
  })

  it('has the correct prefix format', () => {
    const id = generateWebhookId()
    expect(id).toMatch(/^whk_[a-f0-9]{24}$/)
  })
})

describe('generateWebhookSecret', () => {
  it('generates a unique webhook secret', () => {
    const secret1 = generateWebhookSecret()
    const secret2 = generateWebhookSecret()

    expect(secret1).not.toBe(secret2)
  })

  it('has the correct prefix', () => {
    const secret = generateWebhookSecret()
    expect(secret).toMatch(/^whsec_/)
    expect(secret.length).toBeGreaterThan(30)
  })
})

describe('webhook signature', () => {
  const secret = 'whsec_test_secret'
  const payload = '{"test": true}'

  it('computes a valid signature', () => {
    const signature = computeWebhookSignature(payload, secret)
    expect(signature).toBeTruthy()
    expect(signature).toMatch(/^[a-f0-9]{64}$/)
  })

  it('verifies a valid signature', () => {
    const signature = computeWebhookSignature(payload, secret)
    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true)
  })

  it('rejects an invalid signature', () => {
    expect(verifyWebhookSignature(payload, 'invalid_signature', secret)).toBe(false)
  })

  it('rejects a signature with wrong secret', () => {
    const signature = computeWebhookSignature(payload, secret)
    expect(verifyWebhookSignature(payload, signature, 'wrong_secret')).toBe(false)
  })

  it('rejects a signature for modified payload', () => {
    const signature = computeWebhookSignature(payload, secret)
    expect(verifyWebhookSignature('{"modified": true}', signature, secret)).toBe(false)
  })

  it('supports hmac-sha1 algorithm', () => {
    const signature = computeWebhookSignature(payload, secret, 'hmac-sha1')
    expect(signature).toMatch(/^[a-f0-9]{40}$/)
    expect(verifyWebhookSignature(payload, signature, secret, 'hmac-sha1')).toBe(true)
  })
})

describe('parseWindowKey', () => {
  it('returns ISO string for null schedule', () => {
    const now = new Date('2024-01-15T10:37:00Z')
    const result = parseWindowKey(null, now)
    expect(result).toBe('2024-01-15T10:37:00.000Z')
  })

  it('rounds to 5-minute windows for frequent schedules', () => {
    const now = new Date('2024-01-15T10:37:00Z')
    const result = parseWindowKey('*/5 * * * *', now)
    expect(result).toBe('2024-01-15T10:35')
  })

  it('rounds to 5-minute windows for schedules containing wildcards', () => {
    const now = new Date('2024-01-15T10:37:00Z')
    const result = parseWindowKey('0 * * * *', now)
    // Contains '* * *' so treated as frequent schedule
    expect(result).toBe('2024-01-15T10:35')
  })

  it('returns daily window for other schedules', () => {
    const now = new Date('2024-01-15T10:37:00Z')
    const result = parseWindowKey('0 9 * * 1', now)
    expect(result).toBe('2024-01-15T00:00')
  })
})
