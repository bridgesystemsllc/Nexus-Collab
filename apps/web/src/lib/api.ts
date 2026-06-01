import axios from 'axios'

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
