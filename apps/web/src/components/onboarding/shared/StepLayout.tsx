import { ChevronLeft, ChevronRight } from 'lucide-react'

interface StepLayoutProps {
  step: number
  totalSteps: number
  heading: string
  subheading: string
  children: React.ReactNode
  canContinue: boolean
  onBack: () => void
  onContinue: () => void
  isOptional?: boolean
  onSkip?: () => void
  isLoading?: boolean
  ctaLabel?: string
}

export function StepLayout({
  step,
  totalSteps,
  heading,
  subheading,
  children,
  canContinue,
  onBack,
  onContinue,
  isOptional,
  onSkip,
  isLoading,
  ctaLabel,
}: StepLayoutProps) {
  return (
    <div className="flex flex-col h-full animate-step-enter">
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-2 py-6">
        <h1
          className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)] mb-2"
        >
          {heading}
        </h1>
        <p className="text-[15px] text-[var(--text-secondary)] mb-8 tracking-[-0.01em]">
          {subheading}
        </p>

        {children}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 pb-2 border-t border-[var(--border-subtle)]">
        <div>
          {step > 1 && (
            <button
              onClick={onBack}
              disabled={isLoading}
              className="flex items-center gap-1 text-[14px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
            >
              <ChevronLeft size={16} />
              Back
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
          {isOptional && onSkip && (
            <button
              onClick={onSkip}
              disabled={isLoading}
              className="text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50"
            >
              Skip for now
            </button>
          )}

          <button
            onClick={onContinue}
            disabled={!canContinue || isLoading}
            className="btn-primary flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:filter-none"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </span>
            ) : (
              <>
                {ctaLabel || 'Continue'}
                {!ctaLabel && <ChevronRight size={16} />}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
