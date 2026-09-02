import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Check, Building2, Plus, X, Search } from 'lucide-react'

const INDUSTRIES = [
  'Contract Manufacturing',
  'Beauty & Cosmetics',
  'Hair Care',
  'Fragrances & Perfumery',
  'Retail',
  'Technology',
  'Healthcare',
  'Education',
  'Finance',
  'Food & Beverage',
]

interface OnboardingData {
  name: string
  industry: string
  brands: string[]
}

interface Props {
  pendingUser: { email: string; name: string }
  onSuccess: () => void
}

const INITIAL_DATA: OnboardingData = {
  name: '',
  industry: '',
  brands: [''],
}

const LOADING_MESSAGES = [
  'Creating your workspace...',
  'Setting up departments...',
  'Configuring brands...',
  'Almost ready...',
]

export function OnboardingWizard({ pendingUser, onSuccess }: Props) {
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA)
  const [showSuccess, setShowSuccess] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [industrySearch, setIndustrySearch] = useState('')
  const [showOtherIndustry, setShowOtherIndustry] = useState(false)
  const [customIndustry, setCustomIndustry] = useState('')

  const submitMutation = useMutation({
    mutationFn: async (payload: OnboardingData) => {
      const cleanBrands = payload.brands.filter((b) => b.trim())
      return api.post('/onboarding', {
        name: payload.name.trim(),
        industry: payload.industry.trim(),
        brands: cleanBrands,
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
  const industryValid = data.industry.trim().length > 0
  const filledBrands = data.brands.filter((b) => b.trim().length > 0)
  const brandsValid = filledBrands.length > 0

  const canCreate = nameValid && industryValid && brandsValid

  // Inline errors (shown when field is touched and invalid)
  const nameError = touched.name && !nameValid ? 'Company name must be at least 2 characters' : fieldErrors.name
  const industryError = touched.industry && !industryValid ? 'Please select an industry' : fieldErrors.industry
  const brandsError = touched.brands && !brandsValid ? 'Add at least one brand' : fieldErrors.brands

  // Brand management
  const addBrand = () => {
    if (data.brands.length < 20) {
      update('brands', [...data.brands, ''])
    }
  }

  const removeBrand = (index: number) => {
    const next = data.brands.filter((_, i) => i !== index)
    if (next.length === 0) {
      update('brands', [''])
    } else {
      update('brands', next)
    }
  }

  const updateBrand = (index: number, newValue: string) => {
    const next = [...data.brands]
    next[index] = newValue
    update('brands', next)
    markTouched('brands')
  }

  // Industry selection
  const filteredIndustries = INDUSTRIES.filter((i) =>
    i.toLowerCase().includes(industrySearch.toLowerCase())
  )

  const handleSelectIndustry = (industry: string) => {
    update('industry', industry)
    markTouched('industry')
    setShowOtherIndustry(false)
  }

  const handleOtherIndustry = () => {
    setShowOtherIndustry(true)
    update('industry', customIndustry)
    markTouched('industry')
  }

  const handleCustomIndustryChange = (val: string) => {
    setCustomIndustry(val)
    update('industry', val)
  }

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

  // Main form (3.1 - single card with all fields)
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
            Set up your workspace
          </h1>
          <p className="text-[16px] opacity-85 mt-5 leading-relaxed">
            Enter your company details to create your NEXUS workspace with departments, brands, and team ready to go.
          </p>
        </div>

        <div className="text-white/70 text-[12px]">
          Signed in as {pendingUser.email}
        </div>
      </div>

      {/* Right panel — single form card */}
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
              Company Onboarding
            </div>
          </div>

          {/* Error banner (3.4 - fields preserved) */}
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

          {/* Form card */}
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

            {/* Company Name (3.5 inline error) */}
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Company name *
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

            {/* Industry (3.7 inline error) */}
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Industry *
              </label>

              {/* Search */}
              <div className="relative mb-2">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-tertiary)' }}
                />
                <input
                  type="text"
                  placeholder="Search industries..."
                  value={industrySearch}
                  onChange={(e) => setIndustrySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-[13px] transition-colors focus:outline-none"
                  style={{
                    background: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                  }}
                />
              </div>

              {/* Industry chips */}
              <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
                {filteredIndustries.map((industry) => (
                  <button
                    key={industry}
                    type="button"
                    onClick={() => handleSelectIndustry(industry)}
                    className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
                    style={{
                      background: data.industry === industry
                        ? 'var(--accent)'
                        : 'var(--bg-base)',
                      color: data.industry === industry
                        ? 'white'
                        : 'var(--text-primary)',
                      border: `1px solid ${data.industry === industry ? 'var(--accent)' : 'var(--border-default)'}`,
                    }}
                  >
                    {industry}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleOtherIndustry}
                  className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
                  style={{
                    background: showOtherIndustry && !INDUSTRIES.includes(data.industry)
                      ? 'var(--accent)'
                      : 'var(--bg-base)',
                    color: showOtherIndustry && !INDUSTRIES.includes(data.industry)
                      ? 'white'
                      : 'var(--text-primary)',
                    border: `1px solid ${showOtherIndustry && !INDUSTRIES.includes(data.industry) ? 'var(--accent)' : 'var(--border-default)'}`,
                  }}
                >
                  Other
                </button>
              </div>

              {showOtherIndustry && (
                <input
                  type="text"
                  placeholder="Enter your industry..."
                  value={customIndustry}
                  onChange={(e) => handleCustomIndustryChange(e.target.value)}
                  autoFocus
                  className="w-full mt-2 rounded-lg px-3 py-2 text-[13px] transition-colors focus:outline-none"
                  style={{
                    background: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                  }}
                />
              )}

              {industryError && (
                <span className="block mt-1.5 text-[11px]" style={{ color: 'var(--danger)' }}>
                  {industryError}
                </span>
              )}
            </div>

            {/* Brands (3.8 inline error) */}
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Brands * <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>(at least one)</span>
              </label>

              <div className="space-y-2">
                {data.brands.map((brand, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Brand ${index + 1}`}
                      value={brand}
                      onChange={(e) => updateBrand(index, e.target.value)}
                      className="flex-1 rounded-lg px-3 py-2 text-[13px] transition-colors focus:outline-none"
                      style={{
                        background: 'var(--bg-base)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-default)',
                      }}
                    />
                    {data.brands.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBrand(index)}
                        className="p-1.5 rounded-lg transition-colors hover:opacity-70"
                        style={{ color: 'var(--text-tertiary)' }}
                        aria-label="Remove brand"
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
                  className="mt-2 flex items-center gap-1.5 text-[12px] font-medium transition-colors hover:opacity-80"
                  style={{ color: 'var(--accent)' }}
                >
                  <Plus size={14} />
                  Add another brand
                </button>
              )}

              {brandsError && (
                <span className="block mt-1.5 text-[11px]" style={{ color: 'var(--danger)' }}>
                  {brandsError}
                </span>
              )}

              {filledBrands.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {filledBrands.map((brand, index) => (
                    <span
                      key={index}
                      className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{
                        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                        color: 'var(--accent)',
                      }}
                    >
                      {brand}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Create button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canCreate}
              className="w-full py-3 rounded-lg text-[14px] font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)' }}
            >
              Create workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
