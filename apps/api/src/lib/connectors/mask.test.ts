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

  it('masks sensitive fields in config', () => {
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

    expect(sanitized.config).toBeDefined()
    expect(sanitized.config.baseUrl).toBe('https://api.example.com')
    expect(sanitized.config.apiKey).toBe('••••2345')
    expect(sanitized.config.token).toBe('••••c123')
    expect(sanitized.config.password).toBe('••••-pwd')
  })

  it('handles encrypted blobs', () => {
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
    expect(sanitized.config.secrets).toEqual({ encrypted: true, masked: true })
  })

  it('handles null config', () => {
    const integration = {
      ...baseIntegration,
      config: null,
    }

    const sanitized = sanitizeIntegration(integration)
    expect(sanitized.config).toEqual({})
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

  it('masks webhook secrets (underscore format)', () => {
    const integration = {
      ...baseIntegration,
      config: {
        webhookId: 'wh_123',
        webhook_secret: 'secret_456789',
      },
    }

    const sanitized = sanitizeIntegration(integration)
    expect(sanitized.config.webhookId).toBe('wh_123')
    expect(sanitized.config.webhook_secret).toBe('••••6789')
  })

  it('masks secret fields', () => {
    const integration = {
      ...baseIntegration,
      config: {
        secret: 'my-secret-value',
      },
    }

    const sanitized = sanitizeIntegration(integration)
    expect(sanitized.config.secret).toBe('••••alue')
  })
})

describe('sanitizeAutomation', () => {
  const baseAutomation = {
    id: 'auto-1',
    orgId: 'org-1',
    integrationId: 'int-1',
    name: 'Test Automation',
    description: 'Test description',
    trigger: 'SCHEDULE',
    schedule: '*/5 * * * *',
    webhookId: null,
    status: 'ACTIVE',
    nextRunAt: new Date('2024-01-01T00:05:00Z'),
    lastRunAt: new Date('2024-01-01T00:00:00Z'),
    lastRunOk: true,
    lastError: null,
    consecutiveFailures: 0,
    retryPolicy: { maxAttempts: 3, baseDelayMs: 1000 },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    config: {},
  }

  it('masks config secrets', () => {
    const automation = {
      ...baseAutomation,
      config: {
        method: 'POST',
        path: '/api/webhook',
        headers: { Authorization: 'Bearer secret-token' },
        apiKey: 'secret-key-12345',
      },
    }

    const sanitized = sanitizeAutomation(automation)
    expect(sanitized.id).toBe('auto-1')
    expect(sanitized.config.method).toBe('POST')
    expect(sanitized.config.path).toBe('/api/webhook')
    expect(sanitized.config.apiKey).toBe('••••2345')
  })

  it('preserves non-sensitive config', () => {
    const automation = {
      ...baseAutomation,
      config: {
        method: 'GET',
        path: '/status',
        timeout: 5000,
      },
    }

    const sanitized = sanitizeAutomation(automation)
    expect(sanitized.config.method).toBe('GET')
    expect(sanitized.config.path).toBe('/status')
    expect(sanitized.config.timeout).toBe(5000)
  })
})

describe('sanitizeAutomationRun', () => {
  const baseRun = {
    id: 'run-1',
    automationId: 'auto-1',
    status: 'SUCCESS',
    triggeredBy: 'SCHEDULE',
    requestId: 'req_123',
    startedAt: new Date('2024-01-01T00:00:00Z'),
    completedAt: new Date('2024-01-01T00:00:01Z'),
    durationMs: 1000,
    httpStatus: 200,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    inputSnapshot: {},
    outputSnapshot: {},
  }

  it('masks sensitive data in snapshots', () => {
    const run = {
      ...baseRun,
      inputSnapshot: {
        url: 'https://api.example.com/webhook',
        headers: { Authorization: 'Bearer secret-token' },
        body: { apiKey: 'secret-key-12345' },
      },
      outputSnapshot: {
        status: 200,
        body: { token: 'response-token-abc', data: 'public' },
      },
    }

    const sanitized = sanitizeAutomationRun(run)
    expect(sanitized.id).toBe('run-1')
    expect(sanitized.inputSnapshot?.url).toBe('https://api.example.com/webhook')
    expect(sanitized.inputSnapshot?.body?.apiKey).toBe('••••2345')
    expect(sanitized.outputSnapshot?.body?.token).toBe('••••-abc')
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
})
