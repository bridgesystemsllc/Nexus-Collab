import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useComponentCosts } from '@/hooks/useData'
import { fmtCurrency, fmtInt } from './financeFormat'

export function ComponentCostingTab() {
  const { data: rows = [], isLoading } = useComponentCosts()
  const [search, setSearch] = useState('')

  const q = search.toLowerCase()
  const filtered = useMemo(
    () =>
      (rows as any[]).filter(
        (r) => !q || [r.partNumber, r.name, r.vendor, r.type].some((v: any) => (v ?? '').toString().toLowerCase().includes(q)),
      ),
    [rows, q],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">Component Costs</h2>
          <span className="text-xs text-[var(--text-tertiary)]">{filtered.length}</span>
        </div>
        <div className="relative min-w-[260px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            placeholder="Search part #, name, vendor…"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">No components found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Part #</th>
                <th>Name</th>
                <th>Type</th>
                <th>Vendor</th>
                <th className="text-right">Target Cost</th>
                <th className="text-right">Best Landed Unit</th>
                <th className="text-right">MOQ Tiers</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs text-[var(--accent)]">{r.partNumber || '—'}</td>
                  <td className="font-medium text-[var(--text-primary)]">{r.name || '—'}</td>
                  <td className="text-[var(--text-secondary)]">{r.type ? <span className="badge badge-accent">{r.type}</span> : '—'}</td>
                  <td className="text-[var(--text-secondary)]">{r.vendor || '—'}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtCurrency(r.targetCostPerUnit, 4)}</td>
                  <td className="text-right tabular-nums font-medium text-[var(--text-primary)]">{fmtCurrency(r.bestLandedUnitCost, 4)}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtInt(r.moqTierCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
