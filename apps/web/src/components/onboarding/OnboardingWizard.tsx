import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Check, Building2, Plus, X, ArrowRight, ArrowLeft } from 'lucide-react'
import type { IndustryKey, TierKey, BillingInterval } from '@nexus/shared'
import { INDUSTRY_OPTIONS } from '@nexus/shared'

interface TierInfo {
  key: TierKey
  displayName: string
  description: string
  unitAmountMonthlyCents: number
  unitAmountAnnualCents: number
  minSeats: number
  maxSeats: number | null
  isCustomQuote: boolean
}

interface OnboardingData {
  name: string
  industry: IndustryKey | ''
  brands: string[]
  tierKey: TierKey
  seats: number
  interval: BillingInterval
}

interface Props {
  pendingUser: { email: string; name: string }
  onSuccess: () => void
}

const INITIAL_DATA: OnboardingData = {
  name: '',
  industry: '',
  brands: [],
  tierKey: 'starter',
  seats: 5,
  interval: 'monthly',
}

const LOADING_MESSAGES = [
  'Creating your workspace...',
  'Setting up departments...',
  'Configuring brands...',
  'Almost ready...',
]

export function OnboardingWizard({ pendingUser, onSuccess }: Props) {
  const [step, setStep] = useState<'org' | 'plan'>('org')
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA)
  const [showSuccess, setShowSuccess] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const { data: tiersData } = useQuery({
    queryKey: ['billing', 'tiers'],
    queryFn: async () => {
      const res = await api.get('/billing/tiers')
      return res.data as { tiers: TierInfo[] }
    },
  })

  const tiers = tiersData?.tiers ?? []

  const submitMutation = useMutation({
    mutationFn: async (payload: OnboardingData) => {
      const cleanBrands = payload.brands.filter((b) => b.trim())
      return api.post('/onboarding', {
        name: payload.name.trim(),
        industry: payload.industry,
        brands: cleanBrands.length > 0 ? cleanBrands : undefined,
        tierKey: payload.tierKey,
        seats: payload.seats,
        interval: payload.interval,
      }).then((r) => r.data)
    },
    onSuccess: () => {
      setShowSuccess(true)
      setTimeout(() => {
        onSuccess()
      }, 2000)
    },
    onError: (err: any) => {
      const response = err?.response?.data
      if (response?.fields) {
        setFieldErrors(response.fields)
      }
    },
  })

  const handleSubmit = async () => {
    setFieldErrors({})
    let msgIndex = 0
    setLoadingMessage(LOADING_MESSAGES[0])
    const interval = setInterval(() => {
      msgIndex++
      if (msgIndex < LOADING_MESSAGES.length) {
        setLoadingMessage(LOADING_MESSAGES[msgIndex])
      }
    }, 1500)

    try {
      await submitMutation.mutateAsync(data)
    } finally {
      clearInterval(interval)
    }
  }

  const update = <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }))
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const markTouched = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  // Validation
  const nameValid = data.name.trim().length >= 2
  const industryValid = data.industry !== ''

  // For step navigation
  const canProceedToPlans = nameValid && industryValid
  const selectedTier = tiers.find((t) => t.key === data.tierKey)
  const canCreate = canProceedToPlans && selectedTier && !selectedTier.isCustomQuote

  // Inline errors
  const nameError = touched.name && !nameValid ? 'Company name must be at least 2 characters' : fieldErrors.name
  const industryError = touched.industry && !industryValid ? 'Please select an industry' : fieldErrors.industry

  // Brand management
  const addBrand = () => {
    if (data.brands.length < 20) {
      update('brands', [...data.brands, ''])
    }
  }

  const removeBrand = (index: number) => {
    const next = data.brands.filter((_, i) => i !== index)
    update('brands', next)
  }

  const updateBrand = (index: number, newValue: string) => {
    const next = [...data.brands]
    next[index] = newValue
    update('brands', next)
  }

  // Handle tier selection
  const handleSelectTier = (key: TierKey) => {
    const tier = tiers.find((t) => t.key === key)
    if (!tier || tier.isCustomQuote) return
    update('tierKey', key)
    if (data.seats < tier.minSeats) {
      update('seats', tier.minSeats)
    }
    if (tier.maxSeats && data.seats > tier.maxSeats) {
      update('seats', tier.maxSeats)
    }
  }

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`

  // Success screen (3.3)
  if (showSuccess) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)' }}>
            <Check size={40} style={{ color: 'var(--success)' }} />
          </div>
          <h2 className="text-[28px] font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
            Welcome to NEXUS
          </h2>
          <p className="text-[15px]" style={{ color: 'var(--text-secondary)' }}>
            Your workspace is ready. Taking you to your dashboard...
          </p>
        </div>
      </div>
    )
  }

  // Loading screen (3.2)
  if (submitMutation.isPending) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 relative">
            <div className="absolute inset-0 rounded-full border-[3px]" style={{ borderColor: 'var(--border-subtle)' }} />
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent animate-spin" style={{ borderTopColor: 'var(--accent)' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
            </div>
          </div>
          <p className="text-[17px] font-medium tracking-tight animate-fade-in" style={{ color: 'var(--text-primary)' }}>
            {loadingMessage}
          </p>
        </div>
      </div>
    )
  }

  // Main form with steps: Organization -> Plan
  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-base)' }}>
      {/* Left panel — brand / context */}
      <div
        className="hidden md:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, var(--accent) 0%, #5b21b6 60%, #1e1b4b 100%)',
        }}
      >
        <div className="text-white">
          <div className="text-[22px] font-bold tracking-tight">NEXUS</div>
          <div className="text-[13px] opacity-80 mt-1">Company Onboarding</div>
        </div>

        <div className="text-white max-w-md">
          <h1 className="text-[36px] font-bold leading-[1.1] tracking-tight">
            {step === 'org' ? 'Set up your workspace' : 'Choose your plan'}
          </h1>
          <p className="text-[16px] opacity-85 mt-5 leading-relaxed">
            {step === 'org'
              ? 'Enter your company details to create your NEXUS workspace.'
              : 'Select a plan that fits your team\'s needs.'}
          </p>
        </div>

        <div className="text-white/70 text-[12px]">
          Signed in as {pendingUser.email}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-lg">
          {/* Mobile header */}
          <div className="md:hidden mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={20} style={{ color: 'var(--accent)' }} />
              <div className="text-[18px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                NEXUS
              </div>
            </div>
            <div className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
              Step {step === 'org' ? '1' : '2'} of 2
            </div>
          </div>

          {/* Error banner */}
          {submitMutation.isError && Object.keys(fieldErrors).length === 0 && (
            <div
              className="mb-6 rounded-lg px-4 py-3 text-[13px]"
              style={{
                background: 'color-mix(in srgb, #ef4444 12%, transparent)',
                color: '#ef4444',
                border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)',
              }}
            >
              Failed to create workspace. Please try again.
            </div>
          )}

          {/* Step 1: Organization details */}
          {step === 'org' && (
            <div
              className="rounded-xl p-6 space-y-6"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div>
                <h2 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  Create your workspace
                </h2>
                <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Fill in your company details to get started.
                </p>
              </div>

              {/* Company Name */}
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Business name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Acme Corporation"
                  value={data.name}
                  onChange={(e) => update('name', e.target.value)}
                  onBlur={() => markTouched('name')}
                  className="w-full rounded-lg px-3 py-2.5 text-[14px] transition-colors focus:outline-none"
                  style={{
                    background: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    border: `1px solid ${nameError ? 'var(--danger)' : 'var(--border-default)'}`,
                  }}
                />
                {nameError && (
                  <span className="block mt-1.5 text-[11px]" style={{ color: 'var(--danger)' }}>
                    {nameError}
                  </span>
                )}
              </div>

              {/* Industry */}
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Industry *
                </label>
                <div className="flex flex-wrap gap-2">
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        update('industry', opt.key)
                        markTouched('industry')
                      }}
                      className="px-3 py-2 rounded-lg text-[13px] font-medium transition-all"
                      style={{
                        background: data.industry === opt.key ? 'var(--accent)' : 'var(--bg-base)',
                        color: data.industry === opt.key ? 'white' : 'var(--text-primary)',
                        border: `1px solid ${data.industry === opt.key ? 'var(--accent)' : 'var(--border-default)'}`,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {industryError && (
                  <span className="block mt-1.5 text-[11px]" style={{ color: 'var(--danger)' }}>
                    {industryError}
                  </span>
                )}
              </div>

              {/* Brands (optional) */}
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Brands <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>(optional)</span>
                </label>
                <div className="space-y-2">
                  {data.brands.map((brand, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={`Brand ${index + 1}`}
                        value={brand}
                        onChange={(e) => updateBrand(index, e.target.value)}
                        className="flex-1 rounded-lg px-3 py-2 text-[13px] focus:outline-none"
                        style={{
                          background: 'var(--bg-base)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-default)',
                        }}
                      />
                      {data.brands.length > 0 && (
                        <button
                          type="button"
                          onClick={() => removeBrand(index)}
                          className="p-1.5 rounded-lg hover:opacity-70"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {data.brands.length < 20 && (
                  <button
                    type="button"
                    onClick={addBrand}
                    className="mt-2 flex items-center gap-1.5 text-[12px] font-medium hover:opacity-80"
                    style={{ color: 'var(--accent)' }}
                  >
                    <Plus size={14} />
                    Add brand
                  </button>
                )}
              </div>

              {/* Continue button */}
              <button
                type="button"
                onClick={() => setStep('plan')}
                disabled={!canProceedToPlans}
                className="w-full py-3 rounded-lg text-[14px] font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                Continue <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Step 2: Plan selection */}
          {step === 'plan' && (
            <div
              className="rounded-xl p-6 space-y-6"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep('org')}
                  className="p-2 rounded-lg hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <h2 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    Choose your plan
                  </h2>
                  <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                    Select a plan for {data.name}
                  </p>
                </div>
              </div>

              {/* Billing interval toggle */}
              <div className="flex justify-center">
                <div className="inline-flex rounded-lg p-1" style={{ background: 'var(--bg-base)' }}>
                  <button
                    type="button"
                    onClick={() => update('interval', 'monthly')}
                    className="px-4 py-2 rounded-md text-sm font-medium"
                    style={{
                      background: data.interval === 'monthly' ? 'var(--bg-surface)' : 'transparent',
                      color: data.interval === 'monthly' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => update('interval', 'annual')}
                    className="px-4 py-2 rounded-md text-sm font-medium"
                    style={{
                      background: data.interval === 'annual' ? 'var(--bg-surface)' : 'transparent',
                      color: data.interval === 'annual' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    Annual <span className="text-xs ml-1" style={{ color: 'var(--success)' }}>Save 17%</span>
                  </button>
                </div>
              </div>

              {/* Plan cards */}
              <div className="space-y-3">
                {tiers.filter(t => !t.isCustomQuote).map((tier) => {
                  const price = data.interval === 'monthly' ? tier.unitAmountMonthlyCents : tier.unitAmountAnnualCents / 12
                  const isSelected = data.tierKey === tier.key
                  return (
                    <button
                      type="button"
                      key={tier.key}
                      onClick={() => handleSelectTier(tier.key)}
                      className="w-full text-left rounded-xl p-4 transition-all"
                      style={{
                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border-default)'}`,
                        background: isSelected ? 'var(--accent-subtle)' : 'var(--bg-base)',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {tier.displayName}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            {tier.minSeats}-{tier.maxSeats ?? '∞'} seats
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            {formatPrice(price)}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>/seat/mo</span>
                        </div>
                      </div>
                      <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                        {tier.description}
                      </p>
                    </button>
                  )
                })}

                {/* Enterprise card */}
                {tiers.filter(t => t.isCustomQuote).map((tier) => (
                  <div
                    key={tier.key}
                    className="rounded-xl p-4"
                    style={{ border: '1px solid var(--border-default)', background: 'var(--bg-base)' }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {tier.displayName}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          Custom pricing
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => window.open('mailto:sales@nexus.app?subject=Enterprise%20inquiry', '_blank')}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                      >
                        Contact sales
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Seats selector */}
              {selectedTier && (
                <div className="flex items-center justify-center gap-4 py-2">
                  <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Number of seats:
                  </label>
                  <input
                    type="number"
                    value={data.seats}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (!isNaN(val) && val >= selectedTier.minSeats) {
                        if (selectedTier.maxSeats === null || val <= selectedTier.maxSeats) {
                          update('seats', val)
                        }
                      }
                    }}
                    min={selectedTier.minSeats}
                    max={selectedTier.maxSeats ?? undefined}
                    className="w-20 px-3 py-2 rounded-lg text-sm text-center"
                    style={{
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              )}

              {/* Total */}
              {selectedTier && (
                <div className="text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Total: {formatPrice((data.interval === 'monthly' ? selectedTier.unitAmountMonthlyCents : selectedTier.unitAmountAnnualCents / 12) * data.seats)}/month
                </div>
              )}

              {/* Create button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canCreate}
                className="w-full py-3 rounded-lg text-[14px] font-semibold text-white disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                Create workspace & subscribe
              </button>

              <p className="text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                T2 GATE: Sandbox mode — no real charges will be made
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
