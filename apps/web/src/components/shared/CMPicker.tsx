import { useState, useEffect, useRef } from 'react'
import { X, Search, ChevronDown, Factory } from 'lucide-react'
import { useCMs, type CMOption } from '@/hooks/useData'

interface CMPickerProps {
  /**
   * cmId references a CM_PRODUCTIVITY ModuleItem; cmName is the denormalized
   * display name. Legacy briefs may carry only a free-text cmName — that text
   * is shown as the selected label until a real CM is picked.
   */
  value: { cmId: string; cmName: string }
  onChange: (v: { cmId: string; cmName: string }) => void
  label?: string
  placeholder?: string
}

/** Searchable dropdown of Contract Manufacturer profiles (CM Productivity module). */
export function CMPicker({ value, onChange, label, placeholder }: CMPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { data: cms = [] } = useCMs()

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

  const filtered = cms.filter((cm) => {
    const q = search.toLowerCase()
    return (
      (cm.name ?? '').toLowerCase().includes(q) ||
      (cm.brands ?? []).some((b) => (b ?? '').toLowerCase().includes(q))
    )
  })

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIdx(0)
  }, [search])

  const handleSelect = (cm: CMOption) => {
    onChange({ cmId: cm.id, cmName: cm.name })
    setOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange({ cmId: '', cmName: '' })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((prev) => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlightIdx]) {
        handleSelect(filtered[highlightIdx])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setSearch('')
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, open])

  // Legacy text-only value (no id): still render the name so old briefs read correctly.
  const isLegacyText = !value.cmId && !!value.cmName

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
          {label}
        </label>
      )}

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
        {value.cmName ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-md bg-[var(--accent-subtle)] flex items-center justify-center text-[var(--accent)] shrink-0">
              <Factory size={13} />
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[var(--text-primary)] truncate">{value.cmName}</span>
              {isLegacyText && (
                <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">unlinked</span>
              )}
            </div>
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClear(e as unknown as React.MouseEvent) }}
              className="ml-auto p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0 cursor-pointer"
            >
              <X size={14} />
            </span>
          </div>
        ) : (
          <span className="text-[var(--text-tertiary)]">{placeholder ?? label ?? 'Select CM'}</span>
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
              onKeyDown={handleKeyDown}
              placeholder="Search by name or brand..."
              autoFocus
              className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
            />
          </div>

          {/* CM list */}
          <div ref={listRef} className="max-h-[240px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]">No contract manufacturers found</p>
            ) : (
              filtered.map((cm, idx) => (
                <button
                  key={cm.id}
                  type="button"
                  onClick={() => handleSelect(cm)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                    idx === highlightIdx
                      ? 'bg-[var(--bg-hover)]'
                      : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <div className="w-7 h-7 rounded-md bg-[var(--accent-subtle)] flex items-center justify-center text-[var(--accent)] shrink-0">
                    <Factory size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{cm.name}</p>
                      {cm.status && (
                        <span className="text-[11px] text-[var(--text-tertiary)] capitalize shrink-0">{cm.status}</span>
                      )}
                    </div>
                    {cm.brands?.length > 0 && (
                      <p className="text-[11px] text-[var(--text-tertiary)] truncate">{cm.brands.join(', ')}</p>
                    )}
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
