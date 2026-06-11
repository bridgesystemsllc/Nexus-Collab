import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { BRIEF_STATUSES, BRIEF_STATUS_COLORS, type BriefStatus } from '@/lib/briefStatus'

// ─── Inline brief status dropdown ────────────────────────────
// Renders the current status as its colored badge with a chevron;
// opens a menu of all BRIEF_STATUSES. Keyboard accessible
// (arrows navigate, Enter selects, Esc closes) — matches
// UserPicker's conventions.

const FALLBACK_COLORS = { bg: 'var(--bg-hover)', text: '#6B7280' }

interface BriefStatusSelectProps {
  value: string
  onChange: (status: string) => void
  disabled?: boolean
}

export function BriefStatusSelect({ value, onChange, disabled }: BriefStatusSelectProps) {
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Highlight the current value when opening
  useEffect(() => {
    if (open) {
      const idx = BRIEF_STATUSES.indexOf(value as BriefStatus)
      setHighlightIdx(idx >= 0 ? idx : 0)
    }
  }, [open, value])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, open])

  const handleSelect = (status: string) => {
    setOpen(false)
    if (status !== value) onChange(status)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((prev) => Math.min(prev + 1, BRIEF_STATUSES.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const status = BRIEF_STATUSES[highlightIdx]
      if (status) handleSelect(status)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const colors = BRIEF_STATUS_COLORS[value] || FALLBACK_COLORS

  return (
    <div ref={ref} className="relative inline-block">
      {/* Trigger — current status as colored badge with chevron */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full text-[12px] font-semibold transition-all ${
          disabled
            ? 'opacity-60 cursor-default'
            : 'cursor-pointer hover:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]'
        }`}
        style={{ background: colors.bg, color: colors.text }}
      >
        {value}
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Menu — all statuses, each rendered with its badge colors */}
      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-50 top-full left-0 mt-1.5 min-w-[210px] py-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg overflow-y-auto max-h-[280px]"
        >
          {BRIEF_STATUSES.map((status, idx) => {
            const c = BRIEF_STATUS_COLORS[status] || FALLBACK_COLORS
            const selected = status === value
            return (
              <button
                key={status}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => handleSelect(status)}
                onMouseEnter={() => setHighlightIdx(idx)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                  idx === highlightIdx ? 'bg-[var(--bg-hover)]' : ''
                }`}
              >
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold"
                  style={{ background: c.bg, color: c.text }}
                >
                  {status}
                </span>
                {selected && <Check size={14} className="text-[var(--accent)] shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
