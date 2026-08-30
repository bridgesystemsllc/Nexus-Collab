import { CreditCard } from 'lucide-react'
import { OverviewSection } from '@/features/billing/sections/OverviewSection'

export function BillingPage() {
  return (
    <div className="billing-module mx-auto max-w-[1100px] space-y-4 p-6">
      <header>
        <div className="flex items-center gap-2">
          <CreditCard size={22} style={{ color: 'var(--accent)' }} />
          <h1 className="display-type text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Billing
          </h1>
        </div>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">
          Manage your workspace plan, seat usage, and subscription status.
        </p>
      </header>

      <OverviewSection />
    </div>
  )
}