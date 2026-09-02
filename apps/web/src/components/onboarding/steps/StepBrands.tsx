import { Plus, X, Tag } from 'lucide-react'

interface Props {
  value: string[]
  onChange: (value: string[]) => void
  error?: string
}

export function StepBrands({ value, onChange, error }: Props) {
  const addBrand = () => {
    onChange([...value, ''])
  }

  const removeBrand = (index: number) => {
    const next = value.filter((_, i) => i !== index)
    if (next.length === 0) {
      onChange([''])
    } else {
      onChange(next)
    }
  }

  const updateBrand = (index: number, newValue: string) => {
    const next = [...value]
    next[index] = newValue
    onChange(next)
  }

  const filledBrands = value.filter((b) => b.trim().length > 0)

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <Tag size={24} style={{ color: 'var(--accent)' }} />
        <h2 className="text-[24px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          What brands do you manage?
        </h2>
      </div>
      <p className="text-[14px] mb-6" style={{ color: 'var(--text-secondary)' }}>
        Add at least one brand. You can add more later.
      </p>

      {error && (
        <div className="mb-3 text-[12px]" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div className="space-y-2">
        {value.map((brand, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              placeholder={`Brand ${index + 1}`}
              value={brand}
              onChange={(e) => updateBrand(index, e.target.value)}
              autoFocus={index === value.length - 1}
              className="flex-1 rounded-lg px-3 py-2.5 text-[14px] transition-colors focus:outline-none"
              style={{
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
              }}
            />
            {value.length > 1 && (
              <button
                type="button"
                onClick={() => removeBrand(index)}
                className="p-2 rounded-lg transition-colors hover:opacity-70"
                style={{ color: 'var(--text-tertiary)' }}
                aria-label="Remove brand"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addBrand}
        className="mt-3 flex items-center gap-2 text-[13px] font-medium transition-colors hover:opacity-80"
        style={{ color: 'var(--accent)' }}
      >
        <Plus size={16} />
        Add another brand
      </button>

      {filledBrands.length > 0 && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="text-[11px] font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>
            {filledBrands.length} brand{filledBrands.length !== 1 ? 's' : ''} added
          </div>
          <div className="flex flex-wrap gap-2">
            {filledBrands.map((brand, index) => (
              <span
                key={index}
                className="px-2.5 py-1 rounded-full text-[12px] font-medium"
                style={{
                  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                  color: 'var(--accent)',
                }}
              >
                {brand}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
