import { Boxes, Package, Search } from 'lucide-react'

const products = [
  { sku: 'K6001100', name: 'CD Scalp Detox Shampoo 8oz', brand: "Carol's Daughter", status: 'Awaiting Artwork' },
  { sku: 'K6001200', name: 'CD Scalp Cleansing Oil 6oz', brand: "Carol's Daughter", status: 'Component Sourcing' },
  { sku: 'K4415110', name: 'Goddess Strength Shampoo 11oz', brand: "Carol's Daughter", status: 'Emergency' },
  { sku: 'K5036900', name: 'GS Cocoon Mask 12oz', brand: "Carol's Daughter", status: 'Overstock' },
]

export function ProductCatalogPage() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--accent-subtle)] text-[var(--accent)]">
          <Boxes size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Product Catalog</h1>
          <p className="text-sm text-[var(--text-tertiary)]">SKU master, brand ownership, launch readiness</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
          placeholder="Search SKU, UPC, product, brand..."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {products.map((product) => (
          <div key={product.sku} className="data-cell flex items-start gap-4">
            <span className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--bg-elevated)] text-[var(--accent)]">
              <Package size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[var(--text-primary)]">{product.name}</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                <span className="font-mono">{product.sku}</span> / {product.brand}
              </p>
            </div>
            <span className="badge badge-info">{product.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
