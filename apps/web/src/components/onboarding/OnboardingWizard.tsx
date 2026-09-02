import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ChevronLeft, ChevronRight, Check, Building2 } from 'lucide-react'
import { StepCompanyName } from './steps/StepCompanyName'
import { StepIndustry } from './steps/StepIndustry'
import { StepBrands } from './steps/StepBrands'

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

const TOTAL_STEPS = 3

const LOADING_MESSAGES = [
  'Creating your workspace...',
  'Setting up departments...',
  'Configuring brands...',
  'Almost ready...',
]

export function OnboardingWizard({ pendingUser, onSuccess }: Props) {
  const [step, setStep] = useState(1)
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA)
  const [showSuccess, setShowSuccess] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const submitMutation = useMutation({
    mutationFn: async (payload: OnboardingData) => {
      const cleanBrands = payload.brands.filter((b) => b.trim())
      return api.post('/onboarding', {
        name: payload.name,
        industry: payload.industry,
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

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const back = () => setStep((s) => Math.max(s - 1, 1))

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

  // Validation for each step
  const canContinue = () => {
    switch (step) {
      case 1:
        return data.name.trim().length > 0
      case 2:
        return data.industry.trim().length > 0
      case 3:
        return data.brands.some((b) => b.trim().length > 0)
      default:
        return false
    }
  }

  // Success screen
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

  // Loading screen
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
            In just a few steps, you'll have a fully configured workspace with your departments, brands, and team ready to go.
          </p>

          <div className="mt-8 space-y-3">
            <StepIndicator number={1} label="Company name" active={step === 1} completed={step > 1} />
            <StepIndicator number={2} label="Industry" active={step === 2} completed={step > 2} />
            <StepIndicator number={3} label="Brands" active={step === 3} completed={step > 3} />
          </div>
        </div>

        <div className="text-white/70 text-[12px]">
          Signed in as {pendingUser.email}
        </div>
      </div>

      {/* Right panel — wizard form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile header */}
          <div className="md:hidden mb-8">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={20} style={{ color: 'var(--accent)' }} />
              <div className="text-[18px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                NEXUS
              </div>
            </div>
            <div className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
              Company Onboarding • Step {step} of {TOTAL_STEPS}
            </div>
          </div>

          {/* Progress bar (mobile) */}
          <div className="md:hidden mb-6">
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${(step / TOTAL_STEPS) * 100}%`,
                  background: 'var(--accent)',
                }}
              />
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

          {/* Step content */}
          <div className="min-h-[320px]">
            {step === 1 && (
              <StepCompanyName
                value={data.name}
                onChange={(v) => update('name', v)}
                error={fieldErrors.name}
              />
            )}
            {step === 2 && (
              <StepIndustry
                value={data.industry}
                onChange={(v) => update('industry', v)}
                error={fieldErrors.industry}
              />
            )}
            {step === 3 && (
              <StepBrands
                value={data.brands}
                onChange={(v) => update('brands', v)}
                error={fieldErrors.brands}
              />
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-6 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <div>
              {step > 1 && (
                <button
                  onClick={back}
                  className="flex items-center gap-1 text-[14px] transition-colors hover:opacity-80"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <ChevronLeft size={16} />
                  Back
                </button>
              )}
            </div>

            <button
              onClick={step === TOTAL_STEPS ? handleSubmit : next}
              disabled={!canContinue()}
              className="btn-primary flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step === TOTAL_STEPS ? 'Create workspace' : 'Continue'}
              {step < TOTAL_STEPS && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StepIndicator({
  number,
  label,
  active,
  completed,
}: {
  number: number
  label: string
  active: boolean
  completed: boolean
}) {
  return (
    <div className={`flex items-center gap-3 ${active ? 'opacity-100' : 'opacity-60'}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-medium ${
          completed ? 'bg-white/20' : active ? 'bg-white text-[#5b21b6]' : 'bg-white/10'
        }`}
      >
        {completed ? <Check size={14} /> : number}
      </div>
      <span className={`text-[14px] ${active ? 'font-medium' : ''}`}>{label}</span>
    </div>
  )
}
