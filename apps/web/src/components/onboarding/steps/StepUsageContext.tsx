import { Briefcase, User, GraduationCap, MoreHorizontal } from 'lucide-react'
import { SelectableCard } from '../shared/SelectableCard'
import { StepLayout } from '../shared/StepLayout'

const OPTIONS = [
  { value: 'work', label: 'Work', icon: Briefcase },
  { value: 'personal', label: 'Personal', icon: User },
  { value: 'school', label: 'School', icon: GraduationCap },
  { value: 'other', label: 'Other', icon: MoreHorizontal },
]

interface Props {
  value: string
  onChange: (value: string) => void
  onContinue: () => void
}

export function StepUsageContext({ value, onChange, onContinue }: Props) {
  return (
    <StepLayout
      step={1}
      totalSteps={8}
      heading="Where will you use Nexus Collab?"
      subheading="Help us personalize your workspace."
      canContinue={!!value}
      onBack={() => {}}
      onContinue={onContinue}
    >
      <div className="grid grid-cols-2 gap-3">
        {OPTIONS.map((opt) => (
          <SelectableCard
            key={opt.value}
            icon={opt.icon}
            label={opt.label}
            selected={value === opt.value}
            onClick={() => onChange(opt.value)}
          />
        ))}
      </div>
    </StepLayout>
  )
}
