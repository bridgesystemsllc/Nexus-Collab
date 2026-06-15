import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useMoqCosts } from '@/hooks/useData'
import { fmtCurrency, fmtInt, fmtPct } from './financeFormat'

export function MoqCostingTab() {
  const { data: rows = [], isLoading } = useMoqCosts()
  const [search, setSearch] = useState('')

  const q = search.toLowerCase()
  // Group/sort by part: order by part number, then ascending MOQ quantity.
  const sorted = useMemo(() => {
    return (rows as any[])
      .filter((r) => !q || [r.partNumber, r.name, r.quoteReference].some((v: any) => (v ?? '').toString().toLowerCase().includes(q)))
      .sort((a, b) => {
        const pa = (a.partNumber || '').localeCompare(b.partNumber || '')
        if (pa !== 0) return pa
        return (a.moqQuantity ?? 0) - (b.moqQuantity ?? 0)
      })
  }, [rows, q])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">MOQ Tier Costs</h2>
          <span className="text-xs text-[var(--text-tertiary)]">{sorted.length}</span>
        </div>
        <div className="relative min-w-[260px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            placeholder="Search part #, name, quote ref…"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">No MOQ tiers found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Part #</th>
                <th>Name</th>
                <th className="text-right">MOQ Qty</th>
                <th className="text-right">Unit Cost</th>
                <th className="text-right">Tooling</th>
                <th className="text-right">Shipping/unit</th>
                <th className="text-right">Duty %</th>
                <th className="text-right">Landed Unit</th>
                <th>Quote Ref</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r: any, idx: number) => (
                <tr key={`${r.componentId}-${r.moqQuantity}-${idx}`}>
                  <td className="font-mono text-xs text-[var(--accent)]">{r.partNumber || '—'}</td>
                  <td className="font-medium text-[var(--text-primary)]">{r.name || '—'}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtInt(r.moqQuantity)}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtCurrency(r.unitCost, 4)}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtCurrency(r.toolingCost, 2)}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtCurrency(r.shippingCostPerUnit, 4)}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtPct(r.dutyRatePct, 0)}</td>
                  <td className="text-right tabular-nums font-medium text-[var(--text-primary)]">{fmtCurrency(r.landedUnitCost, 4)}</td>
                  <td className="font-mono text-xs text-[var(--text-tertiary)]">{r.quoteReference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
