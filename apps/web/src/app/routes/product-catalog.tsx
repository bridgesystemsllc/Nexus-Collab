import { useState, useMemo } from 'react'
import { Boxes, Package, Search } from 'lucide-react'
import { ViewToggle, LayoutGrid, type ViewMode } from '../../components/shared/ViewToggle'
import { useDepartments, useDepartment } from '@/hooks/useData'
import { brandLabel } from '@/components/ops/brandLabel'

// Live running list of active items across all brands, sourced from the
// ERP-synced SKU Pipeline (Operations) so the catalog reflects what's in the ERP.
export function ProductCatalogPage() {
  const [view, setView] = useState<ViewMode>('table')
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('All')

  const { data: departments } = useDepartments()
  const opsDept = useMemo(
    () => (Array.isArray(departments) ? departments.find((d: any) => d.type === 'BUILTIN_OPS') : null),
    [departments],
  )
  const { data: opsDetail, isLoading } = useDepartment(opsDept?.id || '')

  const products = useMemo(() => {
    const modules = (opsDetail?.modules as any[]) || []
    const skuItems = modules.find((m: any) => m.type === 'SKU_PIPELINE')?.items || []
    return skuItems
      .map((item: any) => {
        const d = item.data || {}
        return {
          id: item.id,
          sku: d.sku || '',
          upc: d.upc || '',
          name: d.name || d.product || '—',
          brand: d.brand || '',
          status: d.status || '—',
          onHand: d.onHand,
        }
      })
      // "Active" = exclude clearly-discontinued items; otherwise include.
      .filter((p: any) => String(p.status).toLowerCase() !== 'discontinued')
  }, [opsDetail])

  const brands: string[] = ['All', ...Array.from(new Set(products.map((p: any) => p.brand as string).filter(Boolean) as string[]))]

  const q = search.toLowerCase()
  const filtered = products.filter((p: any) => {
    if (brandFilter !== 'All' && p.brand !== brandFilter) return false
    if (!q) return true
    return [p.sku, p.upc, p.name, p.brand].some((v: any) => (v ?? '').toString().toLowerCase().includes(q))
  })

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--accent-subtle)] text-[var(--accent)]">
          <Boxes size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Product Catalog</h1>
          <p className="text-sm text-[var(--text-tertiary)]">All active SKUs across brands · synced from the ERP</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-md flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            placeholder="Search SKU, UPC, product, brand..."
          />
        </div>
        <ViewToggle value={view} onChange={setView} icons={{ table: LayoutGrid }} />
      </div>

      {brands.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          {brands.map((brand) => (
            <button
              key={brand}
              onClick={() => setBrandFilter(brand)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                brandFilter === brand
                  ? 'bg-[var(--accent)] text-white border-transparent'
                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
              }`}
            >
              {brand === 'All' ? 'All' : brandLabel(brand)}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="text-[var(--text-tertiary)] text-sm py-12 text-center">Loading catalog…</div>
      ) : filtered.length === 0 ? (
        <div className="text-[var(--text-tertiary)] text-sm py-12 text-center">No active products found.</div>
      ) : view === 'table' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((product: any) => (
            <div key={product.id} className="data-cell flex items-start gap-4">
              <span className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--bg-elevated)] text-[var(--accent)]">
                <Package size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--text-primary)]">{product.name}</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                  <span className="font-mono">{product.sku}</span> / {brandLabel(product.brand)}
                  {product.onHand != null && <> · On-hand {Number(product.onHand).toLocaleString()}</>}
                </p>
              </div>
              <span className="badge badge-info">{product.status}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-left text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">UPC</th>
                <th className="px-4 py-3 font-medium">Brand</th>
                <th className="px-4 py-3 font-medium">On-Hand</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product: any) => (
                <tr
                  key={product.id}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--bg-elevated)] text-[var(--accent)] shrink-0">
                        <Package size={16} />
                      </span>
                      <span className="font-medium text-[var(--text-primary)]">{product.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{product.sku}</td>
                  <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{product.upc}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{brandLabel(product.brand)}</td>
                  <td className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">{product.onHand != null ? Number(product.onHand).toLocaleString() : '—'}</td>
                  <td className="px-4 py-3">
                    <span className="badge badge-info">{product.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
