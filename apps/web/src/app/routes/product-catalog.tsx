import { useState } from 'react'
import { Package, Plus, Search, RefreshCw, ExternalLink } from 'lucide-react'
import { useProducts, useSyncKareve, useDeleteProduct } from '@/hooks/useData'
import { useIntegrations } from '@/hooks/useData'
import { ProductFormModal } from '@/components/products/ProductFormModal'

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  IN_DEVELOPMENT: 'bg-amber-100 text-amber-700',
  DISCONTINUED: 'bg-gray-100 text-gray-500',
}

export function ProductCatalogPage() {
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<any>(null)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const params: Record<string, string> = {}
  if (search) params.search = search
  if (brandFilter) params.brand = brandFilter
  if (statusFilter) params.status = statusFilter
  if (categoryFilter) params.category = categoryFilter

  const { data: products = [], isLoading } = useProducts(params)
  const { data: integrations = [] } = useIntegrations()
  const syncKareve = useSyncKareve()
  const deleteProduct = useDeleteProduct()

  const kareveIntegration = integrations.find((i: any) => i.type === 'ERP_KAREVE_SYNC')
  const isKareveConnected = kareveIntegration?.status === 'CONNECTED'
  const lastSyncAt = kareveIntegration?.lastSyncAt

  // Get unique brands and categories from products for filters
  const allBrands = [...new Set(products.map((p: any) => p.brand).filter(Boolean))].sort()
  const allCategories = [...new Set(products.map((p: any) => p.category).filter(Boolean))].sort()

  const handleSync = async () => {
    setSyncResult(null)
    try {
      const result = await syncKareve.mutateAsync()
      setSyncResult(`Synced: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged`)
      setTimeout(() => setSyncResult(null), 5000)
    } catch (err: any) {
      setSyncResult(err?.response?.data?.error || 'Sync failed')
      setTimeout(() => setSyncResult(null), 5000)
    }
  }

  const handleEdit = (product: any) => {
    setEditProduct(product)
    setFormOpen(true)
  }

  const handleNew = () => {
    setEditProduct(null)
    setFormOpen(true)
  }

  const handleCloseForm = () => {
    setFormOpen(false)
    setEditProduct(null)
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)] flex items-center justify-center">
              <Package size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-[20px] font-bold text-[var(--text-primary)]">Product Catalog</h1>
              <p className="text-[13px] text-[var(--text-tertiary)]">
                {products.length} product{products.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={handleNew}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-all"
          >
            <Plus size={16} /> New Product
          </button>
        </div>

        {/* KarEve Sync Banner */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${isKareveConnected ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            <span className="text-[13px] text-[var(--text-secondary)]">
              KarEve Dashboard
            </span>
            {lastSyncAt && (
              <span className="text-[12px] text-[var(--text-tertiary)]">
                Last synced: {new Date(lastSyncAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {!lastSyncAt && isKareveConnected && (
              <span className="text-[12px] text-[var(--text-tertiary)]">Never synced</span>
            )}
            {syncResult && (
              <span className={`text-[12px] font-medium ${syncResult.startsWith('Synced') ? 'text-emerald-600' : 'text-[var(--danger)]'}`}>
                {syncResult}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isKareveConnected && (
              <span className="text-[12px] text-[var(--text-tertiary)]">Not connected</span>
            )}
            <button
              onClick={handleSync}
              disabled={!isKareveConnected || syncKareve.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={14} className={syncKareve.isPending ? 'animate-spin' : ''} />
              {syncKareve.isPending ? 'Syncing...' : 'Sync from KarEve'}
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5">
            <Search size={16} className="text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, SKU, or brand..."
              className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
            />
          </div>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none"
          >
            <option value="">All Brands</option>
            {allBrands.map((b: string) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none"
          >
            <option value="">All Categories</option>
            {allCategories.map((c: string) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="IN_DEVELOPMENT">In Development</option>
            <option value="DISCONTINUED">Discontinued</option>
          </select>
        </div>

        {/* Product Table */}
        <div className="rounded-xl border border-[var(--border-default)] overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[48px_1fr_140px_140px_120px_100px] gap-4 px-4 py-3 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
            <span />
            <span className="text-[13px] font-semibold text-[var(--text-secondary)]">Product</span>
            <span className="text-[13px] font-semibold text-[var(--text-secondary)]">Brand</span>
            <span className="text-[13px] font-semibold text-[var(--text-secondary)]">Category</span>
            <span className="text-[13px] font-semibold text-[var(--text-secondary)]">SKU</span>
            <span className="text-[13px] font-semibold text-[var(--text-secondary)]">Status</span>
          </div>

          {/* Rows */}
          {isLoading ? (
            <div className="px-4 py-8 text-center text-[13px] text-[var(--text-tertiary)]">Loading products...</div>
          ) : products.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] text-[var(--text-tertiary)]">No products yet.</p>
              <p className="text-[13px] text-[var(--text-tertiary)] mt-1">Create one or sync from KarEve.</p>
            </div>
          ) : (
            products.map((product: any, i: number) => (
              <button
                key={product.id}
                onClick={() => handleEdit(product)}
                className={`w-full grid grid-cols-[48px_1fr_140px_140px_120px_100px] gap-4 px-4 py-3 items-center text-left hover:bg-[var(--bg-hover)] transition-colors ${
                  i < products.length - 1 ? 'border-b border-[var(--border-subtle)]' : ''
                }`}
              >
                {/* Image / Initial */}
                <div className="w-10 h-10 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center overflow-hidden">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[14px] font-semibold text-[var(--text-tertiary)]">
                      {product.name?.[0]?.toUpperCase() || '?'}
                    </span>
                  )}
                </div>

                {/* Name */}
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{product.name}</p>
                  {product.upc && (
                    <p className="text-[11px] text-[var(--text-tertiary)] truncate">UPC: {product.upc}</p>
                  )}
                </div>

                {/* Brand */}
                <span className="text-[13px] text-[var(--text-secondary)] truncate">{product.brand}</span>

                {/* Category */}
                <span className="text-[13px] text-[var(--text-secondary)] truncate">{product.category}</span>

                {/* SKU */}
                <span className="text-[13px] text-[var(--text-secondary)] font-mono truncate">{product.sku || '--'}</span>

                {/* Status */}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[product.status] || 'bg-gray-100 text-gray-500'}`}>
                  {product.status === 'IN_DEVELOPMENT' ? 'In Dev' : product.status === 'DISCONTINUED' ? 'Disc.' : 'Active'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Product Form Modal */}
      <ProductFormModal open={formOpen} onClose={handleCloseForm} product={editProduct} />
    </div>
  )
}
