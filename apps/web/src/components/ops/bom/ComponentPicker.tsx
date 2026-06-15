import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, ChevronDown, X, Plus, Loader2, Package } from 'lucide-react'
import { api } from '@/lib/api'
import { PART_TYPES, type PartType } from './bomTypes'

export interface ComponentPickerValue {
  componentId: string | null
  partNumber: string
  description: string
  supplier: string
  partType: string
}

interface ComponentPickerProps {
  value: ComponentPickerValue
  onChange: (v: ComponentPickerValue) => void
  /** Part-master items from the COMPONENTS module. */
  components: any[]
  /** COMPONENTS module id — required for inline create. */
  moduleId: string | null
  /** Department id — kept for parity / future use by callers. */
  departmentId: string | null
  /** Called after a new part is created so the parent can refetch the list. */
  onComponentCreated?: () => void
}

// Read a display name off either the part-master shape (name/description) or
// the legacy migrated shape ({component}). Components hold mixed shapes.
function compLabel(d: any): string {
  return d?.description || d?.name || d?.component || ''
}
function compSupplier(d: any): string {
  return d?.vendor || d?.vendors?.[0]?.vendorName || ''
}

/**
 * Dual-mode part selector for BOM lines.
 *  - Mode A "Select existing": searchable combobox over the COMPONENTS module.
 *  - Mode B "Create new": inline mini-form that POSTs a new part-master item,
 *    then selects it on the line and triggers a parent refetch.
 * Styled with the CSS-var design system; keyboard accessible (CMPicker pattern).
 */
export function ComponentPicker({
  value,
  onChange,
  components,
  moduleId,
  departmentId: _departmentId,
  onComponentCreated,
}: ComponentPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ partNumber: '', description: '', type: 'other' as PartType, supplier: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
        setCreating(false)
        setSaveError('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return components
    return components.filter((c: any) => {
      const d = c?.data || {}
      return (
        (d.partNumber ?? '').toLowerCase().includes(q) ||
        compLabel(d).toLowerCase().includes(q)
      )
    })
  }, [components, search])

  useEffect(() => {
    setHighlightIdx(0)
  }, [search])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, open])

  const handleSelect = (c: any) => {
    const d = c?.data || {}
    onChange({
      componentId: c.id,
      partNumber: d.partNumber ?? '',
      description: compLabel(d),
      supplier: compSupplier(d),
      partType: (d.type as string) ?? value.partType ?? 'other',
    })
    setOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange({ componentId: null, partNumber: '', description: '', supplier: '', partType: value.partType })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((p) => Math.min(p + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((p) => Math.max(p - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlightIdx]) handleSelect(filtered[highlightIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setSearch('')
    }
  }

  const startCreate = () => {
    setCreating(true)
    setSaveError('')
    setDraft({
      partNumber: search.trim() && !value.partNumber ? search.trim() : '',
      description: '',
      type: (value.partType as PartType) || 'other',
      supplier: '',
    })
  }

  const submitCreate = async () => {
    if (!moduleId) {
      setSaveError('No Components module available to create a part.')
      return
    }
    if (!draft.partNumber.trim() && !draft.description.trim()) {
      setSaveError('Enter a part number or description.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const res = await api.post(`/departments/_/modules/${moduleId}/items`, {
        data: {
          partNumber: draft.partNumber.trim(),
          name: draft.description.trim(),
          description: draft.description.trim(),
          type: draft.type,
          vendor: draft.supplier.trim(),
          status: 'Approved',
        },
        status: 'Approved',
      })
      const created = res?.data
      const newId = created?.id ?? null
      onChange({
        componentId: newId,
        partNumber: draft.partNumber.trim(),
        description: draft.description.trim(),
        supplier: draft.supplier.trim(),
        partType: draft.type,
      })
      onComponentCreated?.()
      setCreating(false)
      setOpen(false)
      setSearch('')
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || err?.message || 'Failed to create part')
    } finally {
      setSaving(false)
    }
  }

  const hasValue = !!(value.partNumber || value.description)

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between bg-[var(--bg-input)] border rounded-lg px-2.5 py-2 text-[13px] text-left transition-all ${
          open
            ? 'border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-glow)]'
            : 'border-[var(--border-default)] hover:border-[var(--accent)]'
        }`}
      >
        {hasValue ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-mono text-[12px] text-[var(--accent-secondary)] shrink-0">{value.partNumber || '—'}</span>
            <span className="text-[var(--text-primary)] truncate">{value.description}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClear(e as unknown as React.MouseEvent) }}
              className="ml-auto p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0 cursor-pointer"
            >
              <X size={13} />
            </span>
          </div>
        ) : (
          <span className="text-[var(--text-tertiary)]">Select or create a part…</span>
        )}
        <ChevronDown size={15} className="text-[var(--text-tertiary)] shrink-0 ml-1.5" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 w-[360px] max-w-[80vw] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg overflow-hidden">
          {creating ? (
            // ─── Mode B: inline create ───
            <div className="p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">New part</p>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setSaveError('') }}
                  className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  Back to search
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={draft.partNumber}
                  onChange={(e) => setDraft((d) => ({ ...d, partNumber: e.target.value }))}
                  placeholder="Part #"
                  autoFocus
                  className="px-2.5 py-2 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
                />
                <select
                  value={draft.type}
                  onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as PartType }))}
                  className="px-2.5 py-2 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] capitalize"
                >
                  {PART_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <input
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Item description"
                className="w-full px-2.5 py-2 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
              />
              <input
                value={draft.supplier}
                onChange={(e) => setDraft((d) => ({ ...d, supplier: e.target.value }))}
                placeholder="Supplier"
                className="w-full px-2.5 py-2 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
              />
              {saveError && <p className="text-[12px] text-[var(--danger)]">{saveError}</p>}
              <button
                type="button"
                onClick={submitCreate}
                disabled={saving}
                className="w-full flex items-center justify-center gap-1.5 btn-primary px-3 py-2 rounded-lg text-[13px] disabled:opacity-50"
              >
                {saving ? <><Loader2 size={13} className="animate-spin" /> Creating…</> : <><Plus size={13} /> Create & select</>}
              </button>
            </div>
          ) : (
            // ─── Mode A: select existing ───
            <>
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)]">
                <Search size={14} className="text-[var(--text-tertiary)] shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search part # or description…"
                  autoFocus
                  className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
                />
              </div>
              <div ref={listRef} className="max-h-[240px] overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]">No matching parts</p>
                ) : (
                  filtered.map((c: any, idx: number) => {
                    const d = c?.data || {}
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelect(c)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                          idx === highlightIdx ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        <div className="w-6 h-6 rounded-md bg-[var(--accent-subtle)] flex items-center justify-center text-[var(--accent)] shrink-0">
                          <Package size={13} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-mono text-[var(--accent-secondary)] shrink-0">{d.partNumber || '—'}</span>
                            {d.type && <span className="text-[11px] text-[var(--text-tertiary)] capitalize shrink-0">{d.type}</span>}
                          </div>
                          <p className="text-[12px] text-[var(--text-secondary)] truncate">{compLabel(d) || '—'}</p>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
              <div className="border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={startCreate}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <Plus size={14} /> New part
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
