import { CreditCard } from 'lucide-react'

/**
 * The no-subscription empty state.
 *
 * Not a fallback — this is what Ahmad's own workspace actually returns from
 * `/entitlements` today (`tier: null`), so it is the state most likely to be
 * seen first, not an edge case bolted on after the "real" screen. It renders
 * alone: no KPI row sits beneath it, because a row of zeroed cells implies a
 * subscription that costs nothing, and that is a different claim than "there
 * is no subscription" — one this screen has no basis to make.
 */
export function NoSubscriptionState() {
  return (
    <div className="billing-card" style={{ padding: '48px 32px', textAlign: 'center' }}>
      <div
        className="mx-auto flex items-center justify-center rounded-full"
        style={{ width: '56px', height: '56px', background: 'var(--bg-surface)' }}
      >
        <CreditCard size={28} style={{ color: 'var(--text-tertiary)' }} />
      </div>
      <h2
        className="mt-4 text-xl font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        No subscription on this workspace
      </h2>
      <p
        className="mx-auto mt-2 leading-relaxed"
        style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '380px' }}
      >
        Nexus is running without a billing plan. Features that require a subscription are
        unavailable until one is chosen.
      </p>
      {/* Disabled on purpose — the Plans tab does not exist yet. Browsers
          suppress pointer events (and so hover-triggered tooltips) on disabled
          controls, and screen readers do not reliably announce `title` on one
          either, so the explanation lives as visible text below the button
          rather than in a tooltip that can never fire. */}
      <button
        type="button"
        disabled
        className="mt-5 rounded-lg px-4 py-2 text-sm font-medium"
        style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)', cursor: 'not-allowed' }}
      >
        Choose a plan
      </button>
      <p className="mt-2" style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
        Plans arrive in the next release
      </p>
    </div>
  )
}
