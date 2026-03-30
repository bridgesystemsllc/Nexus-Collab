interface ProgressBarProps {
  currentStep: number
  totalSteps: number
}

const STEP_LABELS = [
  'Usage',
  'Industry',
  'Departments',
  'Integrations',
  'Features',
  'Workspace',
  'Team',
  'Finish',
]

export function ProgressBar({ currentStep, totalSteps }: ProgressBarProps) {
  const progress = (currentStep / totalSteps) * 100

  return (
    <div className="w-full">
      {/* Step counter */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-[0.06em]">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-[0.06em]">
          {STEP_LABELS[currentStep - 1]}
        </span>
      </div>

      {/* Progress track */}
      <div className="relative h-[3px] bg-[var(--border-subtle)] rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, var(--accent), var(--accent))`,
            boxShadow: '0 0 12px var(--accent-glow)',
          }}
        />
      </div>

      {/* Desktop step dots */}
      <div className="hidden md:flex items-center justify-between mt-3">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1
          const isActive = stepNum === currentStep
          const isCompleted = stepNum < currentStep

          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div
                className={`
                  w-2 h-2 rounded-full transition-all duration-300
                  ${isActive ? 'bg-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)] scale-125' : ''}
                  ${isCompleted ? 'bg-[var(--accent)]' : ''}
                  ${!isActive && !isCompleted ? 'bg-[var(--border-default)]' : ''}
                `}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
