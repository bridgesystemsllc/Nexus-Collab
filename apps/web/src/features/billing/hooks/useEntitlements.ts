import { useQuery } from '@tanstack/react-query'
import { fetchEntitlements } from '../api/billingApi'

// 60s stale time mirrors the server's own entitlement cache TTL. Refetching
// faster would not produce fresher data — it would just add load for an answer
// the API is already holding.
export function useEntitlements() {
  return useQuery({
    queryKey: ['billing', 'entitlements'],
    queryFn: fetchEntitlements,
    staleTime: 60_000,
  })
}
