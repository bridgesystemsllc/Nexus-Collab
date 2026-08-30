import { api } from '@/lib/api'
import { ApiError } from '@/features/users/api/usersApi'
import type { Entitlements } from '@nexus/shared'

export type { Entitlements }

function normalise(err: any): never {
  const status = err?.response?.status ?? 0
  const e = err?.response?.data?.error
  if (e) {
    const { code, message, fields, requestId, ...extra } = e
    throw new ApiError(status, code ?? 'UNKNOWN', message ?? 'Request failed', fields, extra)
  }
  throw new ApiError(status, 'NETWORK', err?.message ?? 'Could not reach the server')
}

export async function fetchEntitlements(): Promise<Entitlements> {
  try {
    return (await api.get('/billing/entitlements')).data as Entitlements
  } catch (err) { return normalise(err) }
}
