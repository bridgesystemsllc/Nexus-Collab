// ─── Mask Tests ──────────────────────────────────────────────
// §5.2: Tests for sanitizeIntegration, sanitizeAutomation, sanitizeAutomationRun
// These functions DROP sensitive fields rather than masking them.

import { describe, it, expect } from 'vitest'
import { sanitizeIntegration, sanitizeAutomation, sanitizeAutomationRun } from './mask'

describe('sanitizeIntegration', () => {
  const baseIntegration = {
    id: 'int-1',
    type: 'GENERIC_HTTP',
    name: 'Test Connector',
    status: 'CONNECTED',
    orgId: 'org-1',
    paused: false,
    authType: 'API_KEY',
    lastSyncAt: new Date('2024-01-01T00:00:00Z'),
    syncCount: 42,
    lastTestAt: new Date('2024-01-01T00:00:00Z'),
    lastTestOk: true,
    lastError: null,
    consecutiveFailures: 0,
    circuitOpenUntil: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    config: {},
  }

  it('drops sensitive fields from config', () => {
    const integration = {
      ...baseIntegration,
      config: {
        baseUrl: 'https://api.example.com',
        apiKey: 'secret-key-12345',
        token: 'bearer-token-abc123',
        password: 'super-secret-pwd',
      },
    }

    const sanitized = sanitizeIntegration(integration)

    // Should keep baseUrl
    expect(sanitized.config.baseUrl).toBe('https://api.example.com')
    // Should DROP sensitive fields
    expect(sanitized.config).not.toHaveProperty('apiKey')
    expect(sanitized.config).not.toHaveProperty('token')
    expect(sanitized.config).not.toHaveProperty('password')
  })

  it('drops encrypted blobs entirely', () => {
    const integration = {
      ...baseIntegration,
      config: {
        baseUrl: 'https://api.example.com',
        secrets: {
          iv: 'initialization-vector',
          encrypted: 'encrypted-data',
          tag: 'auth-tag',
        },
      },
    }

    const sanitized = sanitizeIntegration(integration)
    // Should DROP the secrets blob
    expect(sanitized.config).not.toHaveProperty('secrets')
    // Should keep baseUrl
    expect(sanitized.config.baseUrl).toBe('https://api.example.com')
    // Should emit hasCredentials
    expect(sanitized.hasCredentials).toBe(true)
  })

  it('handles null config', () => {
    const integration = {
      ...baseIntegration,
      config: null,
    }

    const sanitized = sanitizeIntegration(integration)
    expect(sanitized.config).toEqual({})
    expect(sanitized.hasCredentials).toBe(false)
  })

  it('preserves non-sensitive fields', () => {
    const integration = {
      ...baseIntegration,
      config: {
        baseUrl: 'https://api.example.com',
        authType: 'API_KEY',
        timeout: 5000,
      },
    }

    const sanitized = sanitizeIntegration(integration)
    expect(sanitized.id).toBe('int-1')
    expect(sanitized.name).toBe('Test Connector')
    expect(sanitized.type).toBe('GENERIC_HTTP')
    expect(sanitized.status).toBe('CONNECTED')
    expect(sanitized.syncCount).toBe(42)
    expect(sanitized.config.authType).toBe('API_KEY')
    expect(sanitized.config.timeout).toBe(5000)
  })

  it('drops webhook secrets', () => {
    const integration = {
      ...baseIntegration,
      config: {
        webhookId: 'wh_123',
        webhookSecret: 'secret_456789',
      },
    }

    const sanitized = sanitizeIntegration(integration)
    // Should keep webhookId (not a secret)
    expect(sanitized.config.webhookId).toBe('wh_123')
    // Should DROP webhookSecret
    expect(sanitized.config).not.toHaveProperty('webhookSecret')
  })

  it('drops secret fields at any nesting level', () => {
    const integration = {
      ...baseIntegration,
      config: {
        nested: {
          apiKey: 'nested-secret',
          otherField: 'keep-this',
        },
      },
    }

    const sanitized = sanitizeIntegration(integration)
    expect(sanitized.config.nested).not.toHaveProperty('apiKey')
    expect(sanitized.config.nested?.otherField).toBe('keep-this')
  })
})

describe('sanitizeAutomation', () => {
  const baseAutomation = {
    id: 'auto-1',
    orgId: 'org-1',
    connectorId: 'int-1',
    name: 'Test Automation',
    description: 'Test description',
    triggerType: 'SCHEDULE',
    triggerConfig: { everyMinutes: 15, timezone: 'UTC' },
    actionType: 'HTTP_REQUEST',
    actionConfig: { method: 'POST', path: '/api/data' },
    status: 'ACTIVE',
    nextRunAt: new Date('2024-01-01T00:05:00Z'),
    lastRunAt: new Date('2024-01-01T00:00:00Z'),
    lastRunOk: true,
    lastError: null,
    consecutiveFailures: 0,
    retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }

  it('drops secrets from actionConfig', () => {
    const automation = {
      ...baseAutomation,
      actionConfig: {
        method: 'POST',
        path: '/api/webhook',
        headers: { 'Content-Type': 'application/json' },
        apiKey: 'secret-key-12345',
      },
    }

    const sanitized = sanitizeAutomation(automation)
    expect(sanitized.id).toBe('auto-1')
    expect(sanitized.actionConfig.method).toBe('POST')
    expect(sanitized.actionConfig.path).toBe('/api/webhook')
    // Should DROP apiKey
    expect(sanitized.actionConfig).not.toHaveProperty('apiKey')
  })

  it('preserves non-sensitive actionConfig', () => {
    const automation = {
      ...baseAutomation,
      actionConfig: {
        method: 'GET',
        path: '/status',
      },
    }

    const sanitized = sanitizeAutomation(automation)
    expect(sanitized.actionConfig.method).toBe('GET')
    expect(sanitized.actionConfig.path).toBe('/status')
  })

  it('exposes connectorId, triggerType, triggerConfig, actionType', () => {
    const sanitized = sanitizeAutomation(baseAutomation)
    expect(sanitized.connectorId).toBe('int-1')
    expect(sanitized.triggerType).toBe('SCHEDULE')
    expect(sanitized.triggerConfig).toEqual({ everyMinutes: 15, timezone: 'UTC' })
    expect(sanitized.actionType).toBe('HTTP_REQUEST')
  })
})

describe('sanitizeAutomationRun', () => {
  const baseRun = {
    id: 'run-1',
    automationId: 'auto-1',
    orgId: 'org-1',
    trigger: 'SCHEDULE',
    idempotencyKey: 'schedule:auto-1:2024-01-01T00:00:00.000Z',
    status: 'SUCCESS',
    error: null,
    requestSummary: { method: 'POST', host: 'api.example.com', path: '/data' },
    recordsProcessed: 1,
    recordsFailed: 0,
    inputSnapshot: {},
    outputSnapshot: {},
    httpStatus: 200,
    durationMs: 1000,
    retryCount: 0,
    startedAt: new Date('2024-01-01T00:00:00Z'),
    completedAt: new Date('2024-01-01T00:00:01Z'),
  }

  it('drops sensitive data from snapshots', () => {
    const run = {
      ...baseRun,
      inputSnapshot: {
        url: 'https://api.example.com/webhook',
        headers: { 'Content-Type': 'application/json' },
        body: { apiKey: 'secret-key-12345', data: 'public' },
      },
      outputSnapshot: {
        status: 200,
        body: { token: 'response-token-abc', data: 'public' },
      },
    }

    const sanitized = sanitizeAutomationRun(run)
    expect(sanitized.id).toBe('run-1')
    expect(sanitized.inputSnapshot?.url).toBe('https://api.example.com/webhook')
    // Should DROP apiKey
    expect(sanitized.inputSnapshot?.body).not.toHaveProperty('apiKey')
    expect(sanitized.inputSnapshot?.body?.data).toBe('public')
    // Should DROP token
    expect(sanitized.outputSnapshot?.body).not.toHaveProperty('token')
    expect(sanitized.outputSnapshot?.body?.data).toBe('public')
  })

  it('handles null snapshots', () => {
    const run = {
      ...baseRun,
      inputSnapshot: null,
      outputSnapshot: null,
    }

    const sanitized = sanitizeAutomationRun(run)
    expect(sanitized.inputSnapshot).toBeNull()
    expect(sanitized.outputSnapshot).toBeNull()
  })

  it('exposes idempotencyKey, error object, requestSummary, records', () => {
    const run = {
      ...baseRun,
      error: { code: 'TIMEOUT', message: 'Request timed out', retryable: true },
      recordsProcessed: 5,
      recordsFailed: 2,
    }

    const sanitized = sanitizeAutomationRun(run)
    expect(sanitized.idempotencyKey).toBe('schedule:auto-1:2024-01-01T00:00:00.000Z')
    expect(sanitized.error).toEqual({ code: 'TIMEOUT', message: 'Request timed out', retryable: true })
    expect(sanitized.requestSummary).toEqual({ method: 'POST', host: 'api.example.com', path: '/data' })
    expect(sanitized.recordsProcessed).toBe(5)
    expect(sanitized.recordsFailed).toBe(2)
  })
})
