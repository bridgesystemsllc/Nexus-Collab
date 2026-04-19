import { useState, useEffect, useRef } from 'react'
import { X, Search, ChevronDown, FileText } from 'lucide-react'

interface BriefAutocompleteProps {
  value: { briefId: string; briefTitle: string }
  onChange: (val: { briefId: string; briefTitle: string }) => void
  briefItems?: any[]
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Submitted: { bg: 'rgba(245,158,11,0.15)', text: 'rgb(180,115,0)' },
  'In Progress': { bg: 'rgba(99,102,241,0.15)', text: 'rgb(79,70,229)' },
  Approved: { bg: 'rgba(34,197,94,0.15)', text: 'rgb(22,163,74)' },
  Draft: { bg: 'rgba(156,163,175,0.15)', text: 'rgb(107,114,128)' },
}

function StatusPill({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.Draft
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {status}
    </span>
  )
}

export function BriefAutocomplete({ value, onChange, briefItems }: BriefAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const items = briefItems ?? []

  const filtered = items.filter((b: any) => {
    const q = search.toLowerCase()
    return (
      (b.title ?? '').toLowerCase().includes(q) ||
      (b.productName ?? '').toLowerCase().includes(q) ||
      (b.ownerName ?? '').toLowerCase().includes(q)
    )
  })

  const handleSelect = (b: any) => {
    onChange({ briefId: b.id, briefTitle: b.title })
    setOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange({ briefId: '', briefTitle: '' })
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between bg-[var(--bg-input)] border rounded-lg px-3.5 py-2.5 text-[14px] text-left transition-all ${
          open
            ? 'border-[var(--accent)] shadow-[0_0_0_3px_rgba(47,128,237,0.12)]'
            : 'border-[var(--border-default)] hover:border-[var(--accent)]'
        }`}
      >
        {value.briefTitle ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[13px] font-medium text-[var(--text-primary)] truncate">
              <FileText size={12} className="text-[var(--text-tertiary)] shrink-0" />
              {value.briefTitle}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="ml-auto p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <span className="text-[var(--text-tertiary)]">Search briefs...</span>
        )}
        <ChevronDown size={16} className="text-[var(--text-tertiary)] shrink-0 ml-2" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)]">
            <Search size={14} className="text-[var(--text-tertiary)] shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, product, or owner..."
              autoFocus
              className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
            />
          </div>

          {/* Brief list */}
          <div className="max-h-[240px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]">No briefs available</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]">No briefs found</p>
            ) : (
              filtered.map((b: any) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleSelect(b)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{b.title}</p>
                      {b.status && <StatusPill status={b.status} />}
                    </div>
                    <p className="text-[11px] text-[var(--text-tertiary)] truncate">
                      {[b.productName, b.ownerName].filter(Boolean).join(' \u00b7 ')}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
