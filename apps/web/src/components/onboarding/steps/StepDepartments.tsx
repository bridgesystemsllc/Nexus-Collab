import { ChipSelect } from '../shared/ChipSelect'
import { StepLayout } from '../shared/StepLayout'

const DEPARTMENTS = [
  'Sales',
  'Operations',
  'Marketing',
  'Finance & Accounting',
  'Human Resources',
  'Product Development',
  'Supply Chain / Procurement',
  'Customer Service',
  'IT / Technology',
  'Legal & Compliance',
  'Executive / Leadership',
]

interface Props {
  value: string[]
  onChange: (value: string[]) => void
  onBack: () => void
  onContinue: () => void
}

export function StepDepartments({ value, onChange, onBack, onContinue }: Props) {
  return (
    <StepLayout
      step={3}
      totalSteps={8}
      heading="What would you like to manage?"
      subheading="Select all departments that apply to your workspace."
      canContinue={value.length > 0}
      onBack={onBack}
      onContinue={onContinue}
    >
      <ChipSelect
        options={DEPARTMENTS}
        selected={value}
        onChange={onChange}
      />

      {value.length > 0 && (
        <p className="mt-4 text-[12px] text-[var(--text-tertiary)]">
          {value.length} department{value.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </StepLayout>
  )
}
