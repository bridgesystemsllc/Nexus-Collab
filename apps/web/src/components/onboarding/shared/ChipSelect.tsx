import { Check } from 'lucide-react'

interface ChipSelectProps {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
}

export function ChipSelect({ options, selected, onChange }: ChipSelectProps) {
  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option))
    } else {
      onChange([...selected, option])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selected.includes(option)
        return (
          <button
            key={option}
            onClick={() => toggle(option)}
            className={`
              inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium
              border transition-all duration-150 cursor-pointer
              ${isSelected
                ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)] shadow-[0_0_12px_var(--accent-glow)]'
                : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
              }
            `}
          >
            {isSelected && <Check size={14} strokeWidth={2.5} />}
            {option}
          </button>
        )
      })}
    </div>
  )
}
