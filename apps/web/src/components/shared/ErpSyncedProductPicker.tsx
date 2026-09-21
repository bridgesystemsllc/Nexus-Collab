import { useState, useEffect, useRef, useMemo } from 'react'
import { X, Search, ChevronDown, Package, Loader2 } from 'lucide-react'
import { useProducts } from '@/hooks/useData'

interface Product {
  id: string
  name: string
  brand: string
  sku?: string | null
  kareveId?: string | null
  imageUrl?: string | null
}

export interface SelectedProduct {
  productId: string
  sku: string | null
  name: string
  brand: string
  kareveId: string
}

interface ErpSyncedProductPickerProps {
  value: SelectedProduct | null
  onChange: (val: SelectedProduct | null) => void
  error?: string | null
  disabled?: boolean
}

export function ErpSyncedProductPicker({
  value,
  onChange,
  error,
  disabled = false,
}: ErpSyncedProductPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const { data: products, isLoading } = useProducts({ erpSynced: '1' })

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
    if (!products) return []
    const q = search.toLowerCase()
    return (products as Product[]).filter((p) => {
      if (!p.kareveId) return false
      return (
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.brand ?? '').toLowerCase().includes(q)
      )
    })
  }, [products, search])

  const handleSelect = (p: Product) => {
    if (!p.kareveId) return
    onChange({
      productId: p.id,
      sku: p.sku ?? null,
      name: p.name,
      brand: p.brand,
      kareveId: p.kareveId,
    })
    setOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
  }

  const isEmpty = !isLoading && (!products || products.length === 0)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`w-full flex items-center justify-between bg-[var(--bg-input)] border rounded-lg px-3.5 py-2.5 text-[14px] text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
          error
            ? 'border-[var(--danger)] focus:border-[var(--danger)]'
            : open
              ? 'border-[var(--accent)] shadow-[0_0_0_3px_rgba(47,128,237,0.12)]'
              : 'border-[var(--border-default)] hover:border-[var(--accent)]'
        }`}
      >
        {value ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
              <Package size={12} className="text-[var(--text-tertiary)]" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[var(--text-primary)] truncate block">{value.name}</span>
              <span className="text-[11px] text-[var(--text-tertiary)] truncate block">
                {value.brand}{value.sku ? ` · ${value.sku}` : ''}
              </span>
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="ml-auto p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ) : (
          <span className="text-[var(--text-tertiary)]">Select ERP product</span>
        )}
        <ChevronDown size={16} className="text-[var(--text-tertiary)] shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)]">
            <Search size={14} className="text-[var(--text-tertiary)] shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ERP products..."
              autoFocus
              className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
            />
          </div>

          <div className="max-h-[200px] overflow-y-auto">
            {isLoading ? (
              <div className="px-3 py-4 flex items-center justify-center gap-2 text-[13px] text-[var(--text-tertiary)]">
                <Loader2 size={14} className="animate-spin" />
                Loading products…
              </div>
            ) : isEmpty ? (
              <div className="px-4 py-4 text-center">
                <p className="text-[13px] text-[var(--text-secondary)]">
                  No ERP-synced products.
                </p>
                <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
                  Sync products from Integrations first.
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]">No products match your search</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="w-7 h-7 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 overflow-hidden">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[11px] font-semibold text-[var(--text-tertiary)]">
                        {p.name?.[0]?.toUpperCase() ?? '?'}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{p.name}</p>
                    <p className="text-[11px] text-[var(--text-tertiary)] truncate">
                      {p.brand}{p.sku ? ` · ${p.sku}` : ''}
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
