import axios from 'axios'

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Add auth token interceptor when Clerk is configured
// api.interceptors.request.use(async (config) => {
//   const token = await window.Clerk?.session?.getToken()
//   if (token) config.headers.Authorization = `Bearer ${token}`
//   return config
// })
