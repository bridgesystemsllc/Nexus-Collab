import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { TierKey, BillingInterval } from '@nexus/shared'

interface TierInfo {
  key: TierKey
  displayName: string
  description: string
  unitAmountMonthlyCents: number
  unitAmountAnnualCents: number
  minSeats: number
  maxSeats: number | null
  isCustomQuote: boolean
  features: { featureKey: string; isEnabled: boolean; limitValue: number | null }[]
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`
}

export function PlansPicker() {
  const queryClient = useQueryClient()
  const [selectedTier, setSelectedTier] = useState<TierKey | null>(null)
  const [seats, setSeats] = useState(5)
  const [interval, setInterval] = useState<BillingInterval>('monthly')

  const { data: tiersData, isLoading } = useQuery({
    queryKey: ['billing', 'tiers'],
    queryFn: async () => {
      const res = await api.get('/billing/tiers')
      return res.data as { tiers: TierInfo[] }
    },
  })

  const checkout = useMutation({
    mutationFn: async () => {
      if (!selectedTier) throw new Error('No tier selected')
      const res = await api.post('/billing/checkout-session', {
        tierKey: selectedTier,
        seats,
        interval,
        successUrl: window.location.origin + '/?checkout=success',
        cancelUrl: window.location.origin + '/billing?checkout=canceled',
      })
      return res.data as { checkoutUrl: string }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['billing'] })
      // In sandbox mode, just redirect to success
      if (data.checkoutUrl.includes('sandbox=true')) {
        window.location.href = data.checkoutUrl
      } else {
        window.location.href = data.checkoutUrl
      }
    },
  })

  const tiers = tiersData?.tiers ?? []
  const selectedTierInfo = tiers.find((t) => t.key === selectedTier)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin" size={24} style={{ color: 'var(--text-tertiary)' }} />
      </div>
    )
  }

  const handleSelectTier = (key: TierKey) => {
    setSelectedTier(key)
    const tier = tiers.find((t) => t.key === key)
    if (tier && seats < tier.minSeats) {
      setSeats(tier.minSeats)
    }
    if (tier && tier.maxSeats && seats > tier.maxSeats) {
      setSeats(tier.maxSeats)
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          Choose a plan for your workspace
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Select a plan that fits your team's needs
        </p>
      </div>

      {/* Billing interval toggle */}
      <div className="flex justify-center">
        <div
          className="inline-flex rounded-lg p-1"
          style={{ background: 'var(--bg-surface)' }}
        >
          <button
            onClick={() => setInterval('monthly')}
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              background: interval === 'monthly' ? 'var(--bg-base)' : 'transparent',
              color: interval === 'monthly' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: interval === 'monthly' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            }}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval('annual')}
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              background: interval === 'annual' ? 'var(--bg-base)' : 'transparent',
              color: interval === 'annual' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: interval === 'annual' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            }}
          >
            Annual <span className="text-xs ml-1" style={{ color: 'var(--success)' }}>Save 17%</span>
          </button>
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiers.map((tier) => {
          const price = interval === 'monthly' ? tier.unitAmountMonthlyCents : tier.unitAmountAnnualCents / 12
          const isSelected = selectedTier === tier.key
          const isEnterprise = tier.isCustomQuote

          return (
            <div
              key={tier.key}
              onClick={() => !isEnterprise && handleSelectTier(tier.key)}
              className={`relative rounded-xl border p-5 transition-all ${
                isEnterprise ? 'cursor-default' : 'cursor-pointer hover:border-[var(--accent)]'
              }`}
              style={{
                borderColor: isSelected ? 'var(--accent)' : 'var(--border-default)',
                background: isSelected ? 'var(--accent-subtle)' : 'var(--bg-base)',
              }}
            >
              {isSelected && (
                <div
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--accent)' }}
                >
                  <Check size={14} className="text-white" />
                </div>
              )}

              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {tier.displayName}
              </h3>

              <div className="mt-3">
                {isEnterprise ? (
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Custom pricing
                  </span>
                ) : (
                  <>
                    <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {formatPrice(price)}
                    </span>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      /seat/mo
                    </span>
                  </>
                )}
              </div>

              <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {tier.description}
              </p>

              <div className="mt-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {tier.minSeats}-{tier.maxSeats ?? '∞'} seats
              </div>

              {isEnterprise && (
                <button
                  className="mt-4 w-full py-2 rounded-lg text-sm font-medium"
                  style={{
                    background: 'var(--bg-hover)',
                    color: 'var(--text-secondary)',
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    window.open('mailto:sales@nexus.app?subject=Enterprise%20inquiry', '_blank')
                  }}
                >
                  Contact sales
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Seats selector */}
      {selectedTier && selectedTierInfo && !selectedTierInfo.isCustomQuote && (
        <div className="flex flex-col items-center gap-4 py-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-4">
            <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Number of seats:
            </label>
            <input
              type="number"
              value={seats}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val) && val >= (selectedTierInfo.minSeats)) {
                  if (selectedTierInfo.maxSeats === null || val <= selectedTierInfo.maxSeats) {
                    setSeats(val)
                  }
                }
              }}
              min={selectedTierInfo.minSeats}
              max={selectedTierInfo.maxSeats ?? undefined}
              className="w-20 px-3 py-2 rounded-lg text-sm text-center"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Total: {formatPrice((interval === 'monthly' ? selectedTierInfo.unitAmountMonthlyCents : selectedTierInfo.unitAmountAnnualCents / 12) * seats)}/month
          </div>

          <button
            onClick={() => checkout.mutate()}
            disabled={checkout.isPending}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
            style={{ background: 'var(--accent)' }}
          >
            {checkout.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="animate-spin" size={16} />
                Processing...
              </span>
            ) : (
              'Continue to checkout'
            )}
          </button>

          {checkout.isError && (
            <p className="text-sm" style={{ color: 'var(--danger)' }}>
              {(checkout.error as any)?.response?.data?.error?.message ?? 'Something went wrong'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
