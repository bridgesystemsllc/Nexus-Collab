import { Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface SelectableCardProps {
  icon?: LucideIcon
  iconUrl?: string
  label: string
  description?: string
  selected: boolean
  onClick: () => void
}

export function SelectableCard({
  icon: Icon,
  iconUrl,
  label,
  description,
  selected,
  onClick,
}: SelectableCardProps) {
  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col items-start gap-2 p-4 rounded-[12px] border text-left
        transition-all duration-200 cursor-pointer group
        ${selected
          ? 'bg-[var(--accent-subtle)] border-[var(--accent)] shadow-[0_0_20px_var(--accent-glow)]'
          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] hover:-translate-y-[1px]'
        }
      `}
      style={{ transition: 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
    >
      {/* Selected checkmark */}
      {selected && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center">
          <Check size={12} className="text-white" strokeWidth={3} />
        </div>
      )}

      {/* Icon */}
      {Icon && (
        <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center ${
          selected ? 'bg-[var(--accent)]/20' : 'bg-[var(--bg-elevated)]'
        }`}>
          <Icon size={20} className={selected ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'} />
        </div>
      )}
      {iconUrl && (
        <div className="w-10 h-10 rounded-[10px] flex items-center justify-center bg-white/10 overflow-hidden">
          <img src={iconUrl} alt={label} className="w-6 h-6 object-contain" />
        </div>
      )}

      {/* Label */}
      <span className={`text-[14px] font-medium tracking-[-0.01em] ${
        selected ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
      }`}>
        {label}
      </span>

      {/* Description */}
      {description && (
        <span className="text-[12px] text-[var(--text-tertiary)] leading-[1.4] -mt-1">
          {description}
        </span>
      )}
    </button>
  )
}
