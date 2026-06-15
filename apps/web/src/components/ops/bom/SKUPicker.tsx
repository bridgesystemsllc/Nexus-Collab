import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, ChevronDown, X, Package, Pencil } from 'lucide-react'
import { brandLabel } from '@/components/ops/brandLabel'

export interface SKUPickerValue {
  /** Finished-good SKU / part number. */
  sku: string
  /** Marketing product name. */
  productName: string
  /** Resolved full brand name. */
  brand: string
}

interface SKUPickerProps {
  value: SKUPickerValue
  onChange: (v: SKUPickerValue) => void
  /** SKU_PIPELINE module items, each with .data.{sku,name,brand}. */
  skuItems: any[]
  placeholder?: string
}

/**
 * Searchable, select-only combobox over the SKU Pipeline. Unlike ComponentPicker
 * there is no inline create — finished-good SKUs originate from the pipeline / ERP.
 * A "type manually" escape hatch lets a BOM use a free part number not yet in the
 * pipeline; manual mode renders plain inputs writing the same fields.
 * Keyboard accessible (Arrow/Enter/Escape) and styled with the CSS-var system.
 */
export function SKUPicker({ value, onChange, skuItems, placeholder }: SKUPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  // Manual mode: the picked SKU isn't in the pipeline — free-type instead.
  const [manual, setManual] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return skuItems
    return skuItems.filter((it: any) => {
      const d = it?.data || {}
      return (
        (d.sku ?? '').toLowerCase().includes(q) ||
        (d.name ?? '').toLowerCase().includes(q) ||
        (d.brand ?? '').toLowerCase().includes(q) ||
        brandLabel(d.brand ?? '').toLowerCase().includes(q)
      )
    })
  }, [skuItems, search])

  useEffect(() => setHighlightIdx(0), [search])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, open])

  const handleSelect = (it: any) => {
    const d = it?.data || {}
    onChange({
      sku: d.sku ?? '',
      productName: d.name ?? '',
      brand: brandLabel(d.brand ?? ''),
    })
    setOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange({ sku: '', productName: '', brand: '' })
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

  const inputCls =
    'w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors'

  // ─── Manual mode: plain inputs writing the same fields ───
  if (manual) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <input
            value={value.sku}
            onChange={(e) => onChange({ ...value, sku: e.target.value })}
            placeholder="K8120000"
            className={`${inputCls} font-mono`}
          />
          <input
            value={value.brand}
            onChange={(e) => onChange({ ...value, brand: e.target.value })}
            placeholder="Brand"
            className={inputCls}
          />
        </div>
        <input
          value={value.productName}
          onChange={(e) => onChange({ ...value, productName: e.target.value })}
          placeholder="Product name"
          className={inputCls}
        />
        <button
          type="button"
          onClick={() => setManual(false)}
          className="flex items-center gap-1.5 text-[12px] text-[var(--accent)] hover:underline"
        >
          <Search size={12} /> Pick from SKU Pipeline
        </button>
      </div>
    )
  }

  const hasValue = !!(value.sku || value.productName)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between bg-[var(--bg-input)] border rounded-lg px-3 py-2 text-[13px] text-left transition-all ${
          open ? 'border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-glow)]' : 'border-[var(--border-default)] hover:border-[var(--accent)]'
        }`}
      >
        {hasValue ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-mono text-[12px] text-[var(--accent-secondary)] shrink-0">{value.sku || '—'}</span>
            <span className="text-[var(--text-primary)] truncate">{value.productName}</span>
            {value.brand && <span className="badge badge-accent shrink-0">{value.brand}</span>}
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
          <span className="text-[var(--text-tertiary)]">{placeholder || 'Pick a SKU from the pipeline…'}</span>
        )}
        <ChevronDown size={15} className="text-[var(--text-tertiary)] shrink-0 ml-1.5" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-[400px] max-w-[80vw] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)]">
            <Search size={14} className="text-[var(--text-tertiary)] shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search SKU, product, or brand…"
              autoFocus
              className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
            />
          </div>
          <div ref={listRef} className="max-h-[240px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]">No matching SKUs in pipeline</p>
            ) : (
              filtered.map((it: any, idx: number) => {
                const d = it?.data || {}
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => handleSelect(it)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                      idx === highlightIdx ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-md bg-[var(--accent-subtle)] flex items-center justify-center text-[var(--accent)] shrink-0">
                      <Package size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-mono text-[var(--accent-secondary)] shrink-0">{d.sku || '—'}</span>
                        {d.brand && <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">{brandLabel(d.brand)}</span>}
                      </div>
                      <p className="text-[12px] text-[var(--text-secondary)] truncate">{d.name || '—'}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
          <div className="border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => { setManual(true); setOpen(false); setSearch('') }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <Pencil size={14} /> Type a part number manually
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
