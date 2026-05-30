import { useState, useEffect, useRef } from 'react'
import { X, Search, ChevronDown, Plus, Package } from 'lucide-react'
import { useCreateProduct } from '@/hooks/useData'

interface Product {
  id: string
  name: string
  brand: string
  sku?: string
  imageUrl?: string
}

interface ProductSelectProps {
  value: { productId: string; productName: string }
  onChange: (val: { productId: string; productName: string }) => void
  products: Product[]
}

const BRANDS = ["Carol's Daughter", 'Dermablend', 'Baxter of California', 'Ambi', 'AcneFree']
const CATEGORIES = ['Skincare', 'Haircare', 'Bodycare', 'OTC Drug', 'Color Cosmetics']

export function ProductSelect({ value, onChange, products }: ProductSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBrand, setNewBrand] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newSku, setNewSku] = useState('')
  const [createError, setCreateError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const createProduct = useCreateProduct()

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = products.filter((p) => {
    const q = search.toLowerCase()
    return (
      (p.name ?? '').toLowerCase().includes(q) ||
      (p.sku ?? '').toLowerCase().includes(q) ||
      (p.brand ?? '').toLowerCase().includes(q)
    )
  })

  const handleSelect = (p: Product) => {
    onChange({ productId: p.id, productName: p.name })
    setOpen(false)
    setSearch('')
    setCreating(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange({ productId: '', productName: '' })
  }

  const handleCreate = async () => {
    if (!newName.trim() || !newBrand || !newCategory) return
    setCreateError('')
    try {
      const created = await createProduct.mutateAsync({
        name: newName.trim(),
        brand: newBrand,
        category: newCategory,
        sku: newSku.trim() || undefined,
      })
      onChange({ productId: created.id, productName: created.name })
      setOpen(false)
      setCreating(false)
      setNewName('')
      setNewBrand('')
      setNewCategory('')
      setNewSku('')
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setCreateError('SKU already exists')
      } else {
        setCreateError('Failed to create product')
      }
    }
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
        {value.productName ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
              <Package size={12} className="text-[var(--text-tertiary)]" />
            </div>
            <span className="text-[var(--text-primary)] truncate">{value.productName}</span>
            <button
              type="button"
              onClick={handleClear}
              className="ml-auto p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <span className="text-[var(--text-tertiary)]">Select product</span>
        )}
        <ChevronDown size={16} className="text-[var(--text-tertiary)] shrink-0 ml-2" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg overflow-hidden">
          {!creating ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)]">
                <Search size={14} className="text-[var(--text-tertiary)] shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products..."
                  autoFocus
                  className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
                />
              </div>

              <div className="max-h-[200px] overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]">No products found</p>
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

              <button
                type="button"
                onClick={() => { setCreating(true); setSearch('') }}
                className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-[var(--border-subtle)] text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <Plus size={14} />
                Create New Product
              </button>
            </>
          ) : (
            <div className="p-3 space-y-2.5">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">New Product</p>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Product name"
                autoFocus
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
              />
              <select
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Select brand</option>
                {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Select category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="text"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                placeholder="SKU (optional)"
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
              />
              {createError && (
                <p className="text-[12px] text-[var(--danger)]">{createError}</p>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName(''); setNewBrand(''); setNewCategory(''); setNewSku(''); setCreateError('') }}
                  className="px-3 py-1.5 rounded-lg text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newName.trim() || !newBrand || !newCategory || createProduct.isPending}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createProduct.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
