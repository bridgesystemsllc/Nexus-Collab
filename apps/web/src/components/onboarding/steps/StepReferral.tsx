import { StepLayout } from '../shared/StepLayout'

const REFERRAL_OPTIONS = [
  'Social Media (LinkedIn, Instagram, TikTok, X)',
  'Friend or Colleague',
  'Google Search',
  'YouTube',
  'Podcast',
  'Industry Event or Conference',
  'Email / Newsletter',
  'Other',
]

interface Props {
  value: string
  onChange: (value: string) => void
  onBack: () => void
  onSubmit: () => void
  isLoading: boolean
}

export function StepReferral({ value, onChange, onBack, onSubmit, isLoading }: Props) {
  return (
    <StepLayout
      step={8}
      totalSteps={8}
      heading="Almost done!"
      subheading="A couple last things before we build your workspace."
      canContinue={true}
      onBack={onBack}
      onContinue={onSubmit}
      isLoading={isLoading}
      ctaLabel="Create My Workspace"
    >
      <div>
        <label className="block text-[12px] font-medium text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-2">
          How did you hear about Nexus Collab?
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[10px] text-[14px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors appearance-none cursor-pointer"
        >
          <option value="" disabled>Select an option...</option>
          {REFERRAL_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    </StepLayout>
  )
}
