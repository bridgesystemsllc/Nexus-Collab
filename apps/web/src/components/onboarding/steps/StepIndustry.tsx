import { useState } from 'react'
import { Search, Factory } from 'lucide-react'

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
  error?: string
}

export function StepIndustry({ value, onChange, error }: Props) {
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
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <Factory size={24} style={{ color: 'var(--accent)' }} />
        <h2 className="text-[24px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          What industry are you in?
        </h2>
      </div>
      <p className="text-[14px] mb-6" style={{ color: 'var(--text-secondary)' }}>
        We'll tailor your workspace features accordingly.
      </p>

      {/* Search */}
      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-tertiary)' }}
        />
        <input
          type="text"
          placeholder="Search industries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg text-[14px] transition-colors focus:outline-none"
          style={{
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
          }}
        />
      </div>

      {error && (
        <div className="mb-3 text-[12px]" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {/* Industry list */}
      <div className="flex flex-col gap-1 max-h-[240px] overflow-y-auto">
        {filtered.map((industry) => (
          <button
            key={industry}
            type="button"
            onClick={() => handleSelect(industry)}
            className="flex items-center px-4 py-2.5 rounded-lg text-[14px] font-medium text-left transition-all duration-150 cursor-pointer"
            style={{
              background: value === industry ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-surface)',
              color: value === industry ? 'var(--accent)' : 'var(--text-primary)',
              border: value === industry ? '1px solid var(--accent)' : '1px solid transparent',
            }}
          >
            {industry}
          </button>
        ))}

        {/* Other option */}
        <button
          type="button"
          onClick={handleOtherToggle}
          className="flex items-center px-4 py-2.5 rounded-lg text-[14px] font-medium text-left transition-all duration-150 cursor-pointer"
          style={{
            background: showOther && !INDUSTRIES.includes(value)
              ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
              : 'var(--bg-surface)',
            color: showOther && !INDUSTRIES.includes(value)
              ? 'var(--accent)'
              : 'var(--text-primary)',
            border: showOther && !INDUSTRIES.includes(value)
              ? '1px solid var(--accent)'
              : '1px solid transparent',
          }}
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
            className="px-4 py-2.5 rounded-lg text-[14px] mt-1 transition-colors focus:outline-none"
            style={{
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
            }}
          />
        )}
      </div>
    </div>
  )
}
