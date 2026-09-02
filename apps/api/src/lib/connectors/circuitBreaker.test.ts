import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getCircuitState,
  isCircuitOpen,
  shouldSkipExecution,
} from './circuitBreaker'
import type { Integration } from '@prisma/client'

const createIntegration = (overrides: Partial<Integration> = {}): Integration => ({
  id: 'int-1',
  type: 'GENERIC_HTTP',
  name: 'Test',
  status: 'CONNECTED',
  orgId: 'org-1',
  paused: false,
  authType: null,
  lastSyncAt: null,
  syncCount: 0,
  lastTestAt: null,
  lastTestOk: null,
  lastError: null,
  consecutiveFailures: 0,
  circuitOpenUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  config: {},
  ...overrides,
})

describe('getCircuitState', () => {
  it('returns CLOSED when circuitOpenUntil is null', () => {
    const integration = createIntegration({ circuitOpenUntil: null })
    expect(getCircuitState(integration)).toBe('CLOSED')
  })

  it('returns OPEN when circuitOpenUntil is in the future', () => {
    const futureTime = new Date(Date.now() + 60000)
    const integration = createIntegration({ circuitOpenUntil: futureTime })
    expect(getCircuitState(integration)).toBe('OPEN')
  })

  it('returns HALF_OPEN when circuitOpenUntil is in the past', () => {
    const pastTime = new Date(Date.now() - 1000)
    const integration = createIntegration({ circuitOpenUntil: pastTime })
    expect(getCircuitState(integration)).toBe('HALF_OPEN')
  })
})

describe('isCircuitOpen', () => {
  it('returns false when circuit is closed', () => {
    const integration = createIntegration({ circuitOpenUntil: null })
    expect(isCircuitOpen(integration)).toBe(false)
  })

  it('returns true when circuit is open', () => {
    const futureTime = new Date(Date.now() + 60000)
    const integration = createIntegration({ circuitOpenUntil: futureTime })
    expect(isCircuitOpen(integration)).toBe(true)
  })

  it('returns false when circuit is half-open', () => {
    const pastTime = new Date(Date.now() - 1000)
    const integration = createIntegration({ circuitOpenUntil: pastTime })
    expect(isCircuitOpen(integration)).toBe(false)
  })
})

describe('shouldSkipExecution', () => {
  it('returns skip:false when integration is healthy', () => {
    const integration = createIntegration({
      paused: false,
      status: 'CONNECTED',
      circuitOpenUntil: null,
    })
    expect(shouldSkipExecution(integration)).toEqual({ skip: false })
  })

  it('returns skip:true with reason PAUSED when integration is paused', () => {
    const integration = createIntegration({
      paused: true,
      status: 'CONNECTED',
      circuitOpenUntil: null,
    })
    const result = shouldSkipExecution(integration)
    expect(result.skip).toBe(true)
    expect(result.reason).toBe('PAUSED')
  })

  it('returns skip:true with reason ERROR_STATUS when status is ERROR', () => {
    const integration = createIntegration({
      paused: false,
      status: 'ERROR',
      circuitOpenUntil: null,
    })
    const result = shouldSkipExecution(integration)
    expect(result.skip).toBe(true)
    expect(result.reason).toBe('ERROR_STATUS')
  })

  it('returns skip:true with CIRCUIT_OPEN reason when circuit is open', () => {
    const futureTime = new Date(Date.now() + 60000)
    const integration = createIntegration({
      paused: false,
      status: 'CONNECTED',
      circuitOpenUntil: futureTime,
    })
    const result = shouldSkipExecution(integration)
    expect(result.skip).toBe(true)
    expect(result.reason).toContain('CIRCUIT_OPEN')
  })

  it('allows execution when circuit is half-open', () => {
    const pastTime = new Date(Date.now() - 1000)
    const integration = createIntegration({
      paused: false,
      status: 'CONNECTED',
      circuitOpenUntil: pastTime,
    })
    expect(shouldSkipExecution(integration)).toEqual({ skip: false })
  })

  it('checks paused before circuit state', () => {
    const futureTime = new Date(Date.now() + 60000)
    const integration = createIntegration({
      paused: true,
      status: 'CONNECTED',
      circuitOpenUntil: futureTime,
    })
    const result = shouldSkipExecution(integration)
    expect(result.reason).toBe('PAUSED')
  })
})
