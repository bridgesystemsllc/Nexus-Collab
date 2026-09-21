import axios from 'axios'

/**
 * Extract a human-readable error message from an Axios error or unknown value.
 *
 * The API envelope returns `{ error: { code, message, requestId } }`. This
 * helper safely extracts the `message` string regardless of shape, falling
 * back to the provided default when the error is missing or malformed.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err == null) return fallback

  const errObj = err as Record<string, unknown>

  // Axios error with response.data.error (object or string)
  const axiosError = (errObj.response as Record<string, unknown> | undefined)?.data as
    | Record<string, unknown>
    | undefined
  const envelope = axiosError?.error

  if (typeof envelope === 'string') {
    return envelope
  }
  if (envelope != null && typeof envelope === 'object') {
    const msg = (envelope as Record<string, unknown>).message
    if (typeof msg === 'string') return msg
  }

  // Plain error with .message
  if (typeof errObj.message === 'string' && errObj.message) {
    return errObj.message
  }

  return fallback
}

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  // Send the session cookie with every request so the API can identify the user.
  withCredentials: true,
})

// When the session is missing/expired, send the user to the Replit login flow.
// The /auth/me probe is exempt so AuthGate can render the landing page instead
// of triggering an immediate redirect on first load.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status
    const url: string = error?.config?.url || ''
    if (status === 401 && !url.includes('/auth/me')) {
      window.location.href = '/api/login'
    }
    return Promise.reject(error)
  },
)
