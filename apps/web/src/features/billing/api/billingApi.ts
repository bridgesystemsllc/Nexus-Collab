import { api } from '@/lib/api'
import { ApiError } from '@/features/users/api/usersApi'

export type TierKey = 'starter' | 'growth' | 'professional' | 'enterprise'
export type SubscriptionStatus =
  | 'trialing' | 'active' | 'past_due' | 'canceled'
  | 'incomplete' | 'incomplete_expired' | 'paused'
export type AccessLevel = 'full' | 'read_only' | 'locked'

export interface Entitlements {
  tier: TierKey | null
  status: SubscriptionStatus | null
  accessLevel: AccessLevel
  features: Record<string, boolean>
  limits: {
    seats: { purchased: number; consumed: number; available: number }
    activeBriefs: number | null
    apiCallsPerMonth: number | null
  }
  inGracePeriod: boolean
  gracePeriodEndsAt: string | null
}

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
