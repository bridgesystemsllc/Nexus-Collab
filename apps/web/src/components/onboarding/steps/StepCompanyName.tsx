import { Building2 } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
  error?: string
}

export function StepCompanyName({ value, onChange, error }: Props) {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <Building2 size={24} style={{ color: 'var(--accent)' }} />
        <h2 className="text-[24px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          What's your company name?
        </h2>
      </div>
      <p className="text-[14px] mb-6" style={{ color: 'var(--text-secondary)' }}>
        This will be the name of your NEXUS workspace.
      </p>

      <label className="block">
        <span className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Company name
        </span>
        <input
          type="text"
          placeholder="e.g., Acme Corporation"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          className="w-full rounded-lg px-3 py-2.5 text-[14px] transition-colors focus:outline-none"
          style={{
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border-default)'}`,
          }}
        />
        {error && (
          <span className="block mt-1.5 text-[12px]" style={{ color: 'var(--danger)' }}>
            {error}
          </span>
        )}
      </label>
    </div>
  )
}
