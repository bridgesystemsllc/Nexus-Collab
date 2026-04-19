import { useState, useEffect, useRef } from 'react'
import { X, Search, ChevronDown } from 'lucide-react'
import { useMembers } from '@/hooks/useData'

interface UserPickerProps {
  value: { userId: string; userName: string; userRole?: string }
  onChange: (val: { userId: string; userName: string; userRole?: string }) => void
  label?: string
  placeholder?: string
}

export function UserPicker({ value, onChange, label, placeholder }: UserPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { data: members = [] } = useMembers()

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

  const filtered = (members as any[]).filter((m: any) => {
    const q = search.toLowerCase()
    return (
      (m.name ?? '').toLowerCase().includes(q) ||
      (m.email ?? '').toLowerCase().includes(q)
    )
  })

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIdx(0)
  }, [search])

  const handleSelect = (m: any) => {
    onChange({ userId: m.id, userName: m.name, userRole: m.role })
    setOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange({ userId: '', userName: '', userRole: undefined })
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
        {value.userName ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-[11px] font-semibold shrink-0">
              {value.userName[0]?.toUpperCase()}
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[var(--text-primary)] truncate">{value.userName}</span>
              {value.userRole && (
                <span className="text-[11px] text-[var(--text-tertiary)] truncate">{value.userRole}</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="ml-auto p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <span className="text-[var(--text-tertiary)]">{placeholder ?? label ?? 'Select user'}</span>
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
              placeholder="Search by name or email..."
              autoFocus
              className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
            />
          </div>

          {/* Member list */}
          <div ref={listRef} className="max-h-[240px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]">No users found</p>
            ) : (
              filtered.map((m: any, idx: number) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelect(m)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                    idx === highlightIdx
                      ? 'bg-[var(--bg-hover)]'
                      : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-[12px] font-semibold shrink-0">
                    {m.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{m.name}</p>
                      {m.role && (
                        <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">{m.role}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-tertiary)] truncate">{m.email}</p>
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
