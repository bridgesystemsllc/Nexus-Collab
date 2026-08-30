// apps/web/src/features/billing/lib/present.ts
import { daysUntil } from './format'

export type Tone = 'success' | 'warning' | 'danger' | 'accent' | 'neutral'

export interface StatusPresentation {
  label: string
  tone: Tone
  /// Whether to render the pulsing live dot. Only a genuinely healthy paying
  /// subscription earns it — it is a signal, not decoration.
  live: boolean
}

/**
 * Subscription status → what the pill says and how it looks.
 *
 * Takes accessLevel as well as status because the two together are what the
 * user actually experiences. A past_due subscription inside its grace period
 * and one past it are the same status and completely different situations; a
 * single amber pill across both hides the moment it starts to matter.
 */
export function statusPresentation(
  status: string | null,
  accessLevel: 'full' | 'read_only' | 'locked',
): StatusPresentation {
  if (!status) return { label: 'No subscription', tone: 'neutral', live: false }

  switch (status) {
    case 'active':   return { label: 'Active', tone: 'success', live: true }
    // A trial is not a paying state, and colouring it green tells the operator
    // revenue exists where it does not.
    case 'trialing': return { label: 'Trial', tone: 'accent', live: false }
    case 'past_due':
      return accessLevel === 'full'
        ? { label: 'Payment failed', tone: 'warning', live: false }
        : { label: 'Payment overdue', tone: 'danger', live: false }
    case 'canceled':
      return accessLevel === 'full'
        ? { label: 'Cancels at period end', tone: 'neutral', live: false }
        : { label: 'Canceled', tone: 'neutral', live: false }
    case 'paused':             return { label: 'Paused', tone: 'neutral', live: false }
    case 'incomplete':         return { label: 'Awaiting payment', tone: 'warning', live: false }
    case 'incomplete_expired': return { label: 'Setup expired', tone: 'danger', live: false }
    default:                   return { label: status, tone: 'neutral', live: false }
  }
}

/** The dunning banner's sentence. Never "in 0 days". */
export function graceCopy(endsAtIso: string | null, now: Date = new Date()): string {
  const days = daysUntil(endsAtIso, now)
  if (days === null) return 'Your workspace is read-only until the outstanding invoice is paid.'
  if (days === 0) {
    const past = endsAtIso ? new Date(endsAtIso).getTime() < now.getTime() : false
    return past
      ? 'Your workspace is now read-only until the outstanding invoice is paid.'
      : 'Full access ends today unless the outstanding invoice is paid.'
  }
  return `Full access continues for ${days} ${days === 1 ? 'day' : 'days'} while we retry the payment.`
}
