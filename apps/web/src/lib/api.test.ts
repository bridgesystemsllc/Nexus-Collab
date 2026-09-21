import { describe, it, expect } from 'vitest'
import { getApiErrorMessage } from './api'

describe('getApiErrorMessage', () => {
  it('extracts message from API error envelope', () => {
    const axiosError = {
      response: {
        data: {
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to do that.',
            requestId: 'req_abc123',
          },
        },
      },
    }
    expect(getApiErrorMessage(axiosError, 'fallback')).toBe(
      'You do not have permission to do that.'
    )
  })

  it('returns error string directly if error is already a string', () => {
    const axiosError = {
      response: {
        data: {
          error: 'Legacy string error',
        },
      },
    }
    expect(getApiErrorMessage(axiosError, 'fallback')).toBe('Legacy string error')
  })

  it('falls back to err.message if no response data', () => {
    const plainError = { message: 'Network error' }
    expect(getApiErrorMessage(plainError, 'fallback')).toBe('Network error')
  })

  it('returns fallback if error is null', () => {
    expect(getApiErrorMessage(null, 'fallback')).toBe('fallback')
  })

  it('returns fallback if error is undefined', () => {
    expect(getApiErrorMessage(undefined, 'fallback')).toBe('fallback')
  })

  it('returns fallback if error is empty object', () => {
    expect(getApiErrorMessage({}, 'fallback')).toBe('fallback')
  })

  it('returns fallback if error has no extractable message', () => {
    const axiosError = {
      response: {
        data: {
          error: { code: 'SOME_CODE' }, // message missing
        },
      },
    }
    expect(getApiErrorMessage(axiosError, 'fallback')).toBe('fallback')
  })

  it('never returns a non-string', () => {
    const testCases = [
      { response: { data: { error: { code: 'X', message: 'msg', requestId: 'r' } } } },
      { response: { data: { error: 'str' } } },
      { message: 'plain' },
      {},
      null,
      undefined,
      42,
      [],
    ]

    for (const input of testCases) {
      const result = getApiErrorMessage(input, 'fb')
      expect(typeof result).toBe('string')
    }
  })

  it('handles 403 FORBIDDEN error correctly', () => {
    // This is the exact error that caused the crash
    const forbiddenError = {
      response: {
        status: 403,
        data: {
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to do that.',
            required: 'modules:write',
            requestId: 'req_abcdef123456789012345678',
          },
        },
      },
    }
    const result = getApiErrorMessage(forbiddenError, 'Failed to save brief')
    expect(result).toBe('You do not have permission to do that.')
    expect(typeof result).toBe('string')
  })
})
