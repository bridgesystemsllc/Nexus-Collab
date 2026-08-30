import { AlertCircle } from 'lucide-react'
import { graceCopy } from '../lib/present'

/**
 * The past_due banner.
 *
 * The parent decides *when* this renders (only `status === 'past_due'`) —
 * this component only decides *what it says*, via `graceCopy`. Deliberately
 * has no dismissed state: a failed payment is not something a user should be
 * able to make disappear by clicking an X. It comes back on every visit until
 * the invoice is actually paid, because that is the honest state of things.
 */
export function DunningBanner({ gracePeriodEndsAt }: { gracePeriodEndsAt: string | null }) {
  return (
    <div
      role="alert"
      className="billing-card"
      style={{
        borderLeft: '3px solid var(--danger)',
        background: 'var(--danger-light)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
      }}
    >
      <div className="flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Payment failed
          </div>
          <p className="mt-0.5" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {graceCopy(gracePeriodEndsAt)}
          </p>
          {/* Disabled on purpose — the Payment Methods tab does not exist yet.
              A button that looks live and leads nowhere reads as a broken
              product; an honest disabled one reads as an unfinished one, which
              is the truth. */}
          <button
            type="button"
            disabled
            title="Payment methods arrive in a later release"
            className="mt-2.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
            style={{ background: 'var(--danger)', cursor: 'not-allowed', opacity: 0.5 }}
          >
            Update payment method
          </button>
        </div>
      </div>
    </div>
  )
}
