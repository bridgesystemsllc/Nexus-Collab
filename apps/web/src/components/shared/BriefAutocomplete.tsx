import { useState, useEffect, useRef } from 'react'
import { X, Search, ChevronDown, FileText } from 'lucide-react'
import { BRIEF_STATUS_COLORS } from '@/lib/briefStatus'

interface BriefAutocompleteProps {
  value: { briefId: string; briefTitle: string }
  /** Called with the selection (or empty values on clear). The second
   *  argument is the raw selected item so callers can read extra fields
   *  (e.g. brand) for autofill. */
  onChange: (val: { briefId: string; briefTitle: string }, item?: any) => void
  briefItems?: any[]
  /** Statuses to hide from the dropdown (matched against
   *  item.data.briefStatus ?? item.data.status). */
  excludeStatuses?: string[]
  placeholder?: string
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Submitted: { bg: 'rgba(245,158,11,0.15)', text: 'rgb(180,115,0)' },
  'In Progress': { bg: 'rgba(99,102,241,0.15)', text: 'rgb(79,70,229)' },
  Approved: { bg: 'rgba(34,197,94,0.15)', text: 'rgb(22,163,74)' },
  Draft: { bg: 'rgba(156,163,175,0.15)', text: 'rgb(107,114,128)' },
  ...BRIEF_STATUS_COLORS,
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

// Brief items arrive either as raw ModuleItems ({ id, data: {...} }) or as
// pre-flattened objects. Normalize so both shapes render correctly.
function briefData(item: any): any {
  return item?.data ?? item ?? {}
}

function briefName(item: any): string {
  const d = briefData(item)
  return d.projectName || d.name || d.title || 'Untitled Brief'
}

function briefStatus(item: any): string {
  const d = briefData(item)
  return d.briefStatus ?? d.status ?? ''
}

export function BriefAutocomplete({
  value,
  onChange,
  briefItems,
  excludeStatuses,
  placeholder = 'Search open briefs...',
}: BriefAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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

  const items = (briefItems ?? []).filter((item: any) => {
    if (!excludeStatuses || excludeStatuses.length === 0) return true
    return !excludeStatuses.includes(briefStatus(item))
  })

  const filtered = items.filter((item: any) => {
    const q = search.toLowerCase()
    if (!q) return true
    const d = briefData(item)
    return (
      briefName(item).toLowerCase().includes(q) ||
      (d.brand ?? '').toLowerCase().includes(q) ||
      (d.productName ?? '').toLowerCase().includes(q) ||
      (d.ownerName ?? '').toLowerCase().includes(q)
    )
  })

  // Keep highlight within bounds as the filtered list changes
  useEffect(() => {
    setHighlighted((h) => Math.min(h, Math.max(filtered.length - 1, 0)))
  }, [filtered.length])

  const handleSelect = (item: any) => {
    onChange({ briefId: item.id, briefTitle: briefName(item) }, item)
    setOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange({ briefId: '', briefTitle: '' })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlighted]) handleSelect(filtered[highlighted])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      setSearch('')
    }
  }

  // Keep the highlighted option scrolled into view
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, open])

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          setHighlighted(0)
        }}
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
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear linked brief"
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  onChange({ briefId: '', briefTitle: '' })
                }
              }}
              className="ml-auto p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
            >
              <X size={14} />
            </span>
          </div>
        ) : (
          <span className="text-[var(--text-tertiary)]">{placeholder}</span>
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
              onChange={(e) => {
                setSearch(e.target.value)
                setHighlighted(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              autoFocus
              className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
            />
          </div>

          {/* Brief list */}
          <div ref={listRef} role="listbox" className="max-h-[240px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]">No open briefs available</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]">No briefs found</p>
            ) : (
              filtered.map((item: any, i: number) => {
                const d = briefData(item)
                const status = briefStatus(item)
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={item.id === value.briefId}
                    data-index={i}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                      i === highlighted ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                          {briefName(item)}
                        </p>
                        {status && <StatusPill status={status} />}
                      </div>
                      {(d.brand || d.ownerName) && (
                        <p className="text-[11px] text-[var(--text-tertiary)] truncate">
                          {[d.brand, d.ownerName].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
