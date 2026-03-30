import { useState } from 'react'
import { Search } from 'lucide-react'
import { StepLayout } from '../shared/StepLayout'

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

interface Props {
  value: string
  onChange: (value: string) => void
  onBack: () => void
  onContinue: () => void
}

export function StepIndustry({ value, onChange, onBack, onContinue }: Props) {
  const [search, setSearch] = useState('')
  const [showOther, setShowOther] = useState(false)
  const [customValue, setCustomValue] = useState('')

  const filtered = INDUSTRIES.filter((i) =>
    i.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelect = (industry: string) => {
    if (industry === value) {
      onChange('')
    } else {
      onChange(industry)
      setShowOther(false)
    }
  }

  const handleOtherToggle = () => {
    setShowOther(true)
    onChange(customValue || '')
  }

  const handleCustomChange = (val: string) => {
    setCustomValue(val)
    onChange(val)
  }

  return (
    <StepLayout
      step={2}
      totalSteps={8}
      heading="What industry are you in?"
      subheading="We'll tailor your workspace features accordingly."
      canContinue={!!value}
      onBack={onBack}
      onContinue={onContinue}
    >
      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="text"
          placeholder="Search industries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[10px] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
      </div>

      {/* Industry list */}
      <div className="flex flex-col gap-1 max-h-[320px] overflow-y-auto">
        {filtered.map((industry) => (
          <button
            key={industry}
            onClick={() => handleSelect(industry)}
            className={`
              flex items-center px-4 py-3 rounded-[10px] text-[14px] font-medium text-left
              transition-all duration-150 cursor-pointer
              ${value === industry
                ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]'
                : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-transparent hover:bg-[var(--bg-elevated)]'
              }
            `}
          >
            {industry}
          </button>
        ))}

        {/* Other option */}
        <button
          onClick={handleOtherToggle}
          className={`
            flex items-center px-4 py-3 rounded-[10px] text-[14px] font-medium text-left
            transition-all duration-150 cursor-pointer
            ${showOther && !INDUSTRIES.includes(value)
              ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]'
              : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-transparent hover:bg-[var(--bg-elevated)]'
            }
          `}
        >
          Other
        </button>

        {showOther && (
          <input
            type="text"
            placeholder="Enter your industry..."
            value={customValue}
            onChange={(e) => handleCustomChange(e.target.value)}
            autoFocus
            className="px-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[10px] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors mt-1"
          />
        )}
      </div>
    </StepLayout>
  )
}
