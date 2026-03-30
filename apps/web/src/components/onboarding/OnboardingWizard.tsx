import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/appStore'
import { ProgressBar } from './shared/ProgressBar'
import { StepUsageContext } from './steps/StepUsageContext'
import { StepIndustry } from './steps/StepIndustry'
import { StepDepartments } from './steps/StepDepartments'
import { StepIntegrations } from './steps/StepIntegrations'
import { StepFeatures } from './steps/StepFeatures'
import { StepWorkspace } from './steps/StepWorkspace'
import { StepInviteTeam } from './steps/StepInviteTeam'
import { StepReferral } from './steps/StepReferral'

interface OnboardingData {
  usageContext: string
  industry: string
  departments: string[]
  integrations: string[]
  featureInterests: string[]
  workspaceName: string
  workspaceSlug: string
  workspaceColor: string
  workspaceLogoUrl: string
  invites: { email: string; role: string }[]
  phoneNumber: string
  referralSource: string
}

const INITIAL_DATA: OnboardingData = {
  usageContext: '',
  industry: '',
  departments: [],
  integrations: [],
  featureInterests: [],
  workspaceName: '',
  workspaceSlug: '',
  workspaceColor: '#7C3AED',
  workspaceLogoUrl: '',
  invites: [{ email: '', role: 'member' }],
  phoneNumber: '',
  referralSource: '',
}

const TOTAL_STEPS = 8

const LOADING_MESSAGES = [
  'Building your workspace...',
  'Setting up your departments...',
  'Configuring your integrations...',
  'Almost there...',
]

export function OnboardingWizard() {
  const [step, setStep] = useState(1)
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA)
  const [showSuccess, setShowSuccess] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const setPage = useAppStore((s) => s.setPage)

  const submitMutation = useMutation({
    mutationFn: async (payload: OnboardingData) => {
      // Filter out empty invites
      const cleanInvites = payload.invites.filter((i) => i.email.trim())
      return api.post('/onboarding', {
        ...payload,
        invites: cleanInvites,
        workspaceLogoUrl: payload.workspaceLogoUrl || undefined,
        phoneNumber: payload.phoneNumber || undefined,
        referralSource: payload.referralSource || undefined,
        workspaceColor: payload.workspaceColor || undefined,
      }).then((r) => r.data)
    },
    onSuccess: () => {
      // Store meeting bot banner flag if selected
      if (data.featureInterests.includes('meeting_ai_bot')) {
        localStorage.setItem('nexus-show-meeting-bot-banner', 'true')
      }
      setShowSuccess(true)
      setTimeout(() => {
        setPage('dashboard')
        // Force reload to pick up onboarding complete status
        window.location.reload()
      }, 2500)
    },
  })

  const handleSubmit = async () => {
    // Animate through loading messages
    let msgIndex = 0
    setLoadingMessage(LOADING_MESSAGES[0])
    const interval = setInterval(() => {
      msgIndex++
      if (msgIndex < LOADING_MESSAGES.length) {
        setLoadingMessage(LOADING_MESSAGES[msgIndex])
      }
    }, 2000)

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
  }

  // Success screen
  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-[var(--bg-base)] flex items-center justify-center z-50">
        <div className="text-center animate-step-enter">
          {/* Animated checkmark */}
          <div className="w-20 h-20 rounded-full bg-[var(--success)]/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-[var(--success)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" className="animate-check-draw" style={{ strokeDasharray: 30, strokeDashoffset: 30 }} />
            </svg>
          </div>
          <h2 className="text-[28px] font-semibold text-[var(--text-primary)] tracking-[-0.04em] mb-2">
            Welcome to Nexus Collab
          </h2>
          <p className="text-[15px] text-[var(--text-secondary)]">
            Your workspace is ready. Redirecting to your dashboard...
          </p>
        </div>
      </div>
    )
  }

  // Loading screen (during submission)
  if (submitMutation.isPending) {
    return (
      <div className="fixed inset-0 bg-[var(--bg-base)] flex items-center justify-center z-50">
        <div className="text-center">
          {/* Spinner */}
          <div className="w-16 h-16 mx-auto mb-6 relative">
            <div className="absolute inset-0 rounded-full border-[3px] border-[var(--border-subtle)]" />
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[var(--accent)] animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
            </div>
          </div>
          <p className="text-[17px] text-[var(--text-primary)] font-medium tracking-[-0.02em] animate-fade-in">
            {loadingMessage}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[var(--bg-base)] flex items-center justify-center z-50">
      {/* Background subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Main card */}
      <div className="relative w-full max-w-[640px] mx-4 max-h-[90vh] flex flex-col">
        {/* Glass card container */}
        <div className="glass-card p-8 flex flex-col max-h-[85vh]">
          {/* Progress */}
          <div className="mb-6 flex-shrink-0">
            <ProgressBar currentStep={step} totalSteps={TOTAL_STEPS} />
          </div>

          {/* Step content */}
          <div className="flex-1 overflow-hidden">
            {step === 1 && (
              <StepUsageContext
                value={data.usageContext}
                onChange={(v) => update('usageContext', v)}
                onContinue={next}
              />
            )}
            {step === 2 && (
              <StepIndustry
                value={data.industry}
                onChange={(v) => update('industry', v)}
                onBack={back}
                onContinue={next}
              />
            )}
            {step === 3 && (
              <StepDepartments
                value={data.departments}
                onChange={(v) => update('departments', v)}
                onBack={back}
                onContinue={next}
              />
            )}
            {step === 4 && (
              <StepIntegrations
                value={data.integrations}
                onChange={(v) => update('integrations', v)}
                onBack={back}
                onContinue={next}
                onSkip={next}
              />
            )}
            {step === 5 && (
              <StepFeatures
                value={data.featureInterests}
                onChange={(v) => update('featureInterests', v)}
                onBack={back}
                onContinue={next}
                onSkip={next}
              />
            )}
            {step === 6 && (
              <StepWorkspace
                value={{
                  workspaceName: data.workspaceName,
                  workspaceSlug: data.workspaceSlug,
                  workspaceColor: data.workspaceColor,
                  workspaceLogoUrl: data.workspaceLogoUrl,
                }}
                onChange={(v) => setData((prev) => ({ ...prev, ...v }))}
                onBack={back}
                onContinue={next}
              />
            )}
            {step === 7 && (
              <StepInviteTeam
                invites={data.invites}
                phoneNumber={data.phoneNumber}
                onChangeInvites={(v) => update('invites', v)}
                onChangePhone={(v) => update('phoneNumber', v)}
                onBack={back}
                onContinue={next}
                onSkip={next}
              />
            )}
            {step === 8 && (
              <StepReferral
                value={data.referralSource}
                onChange={(v) => update('referralSource', v)}
                onBack={back}
                onSubmit={handleSubmit}
                isLoading={submitMutation.isPending}
              />
            )}
          </div>
        </div>

        {/* Error toast */}
        {submitMutation.isError && (
          <div className="mt-4 p-4 bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-[12px] text-[14px] text-[var(--danger)] animate-fade-in">
            Failed to create workspace. Please try again.
          </div>
        )}
      </div>
    </div>
  )
}
