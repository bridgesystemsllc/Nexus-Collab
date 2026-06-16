import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  DollarSign,
  Layers,
  Loader2,
  Percent,
  Search,
  TrendingDown,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useFinanceSummary, useProductCosts } from '@/hooks/useData'
import { fmtCurrency, fmtInt, fmtPct, toNum } from './financeFormat'
import { PushToErpButton } from '@/components/shared/PushToErpButton'

// Finance-owned fields editable from the cost drawer (everything else on a
// product-cost row is a live roll-up from BOM / formulation and is read-only).
interface EditableCost {
  labelCost: string
  freightPerUnit: string
  overheadPerUnit: string
  targetMarginPct: string
  cogsOverride: string
  retailPrice: string
  notes: string
}

const EMPTY_EDIT: EditableCost = {
  labelCost: '',
  freightPerUnit: '',
  overheadPerUnit: '',
  targetMarginPct: '',
  cogsOverride: '',
  retailPrice: '',
  notes: '',
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone = 'var(--accent)',
}: {
  icon: React.ElementType
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="data-cell flex items-center gap-3 py-4">
      <Icon size={18} style={{ color: tone }} />
      <div>
        <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  )
}

// ─── Editable cost drawer ──────────────────────────────────
function CostDrawer({
  row,
  financeModuleId,
  existingItem,
  onClose,
  onSaved,
}: {
  row: any
  financeModuleId: string | null
  // The matching FINANCE_COSTING ModuleItem (by fgPartNumber), if one exists.
  existingItem: { id: string; data: any } | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<EditableCost>(() => {
    const src = existingItem?.data || {}
    const s = (v: unknown) => (v == null ? '' : String(v))
    return {
      labelCost: s(src.labelCost),
      freightPerUnit: s(src.freightPerUnit),
      overheadPerUnit: s(src.overheadPerUnit),
      targetMarginPct: s(src.targetMarginPct),
      cogsOverride: s(src.cogsOverride),
      retailPrice: s(src.retailPrice),
      notes: s(src.notes ?? ''),
    }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof EditableCost, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!financeModuleId) {
      setError('Finance costing module not found')
      return
    }
    setSaving(true)
    setError('')
    // Number fields → null when blank so the API roll-up treats them as unset.
    const numOrNull = (v: string) => (v.trim() === '' ? null : toNum(v))
    const data = {
      // Identity + display fields the API joins/echoes by.
      fgPartNumber: row.fgPartNumber,
      productName: row.productName ?? existingItem?.data?.productName ?? null,
      brand: row.brand ?? existingItem?.data?.brand ?? null,
      labelCost: numOrNull(form.labelCost),
      freightPerUnit: numOrNull(form.freightPerUnit),
      overheadPerUnit: numOrNull(form.overheadPerUnit),
      targetMarginPct: numOrNull(form.targetMarginPct),
      cogsOverride: numOrNull(form.cogsOverride),
      retailPrice: numOrNull(form.retailPrice),
      notes: form.notes.trim() || null,
    }
    try {
      if (existingItem) {
        // PATCH the existing FINANCE_COSTING row (matched by fgPartNumber).
        await api.patch(`/departments/_/modules/${financeModuleId}/items/${existingItem.id}`, { data })
      } else {
        // POST a brand-new finance-owned cost row for this SKU.
        await api.post(`/departments/_/modules/${financeModuleId}/items`, { data, status: 'active' })
      }
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save costs')
    } finally {
      setSaving(false)
    }
  }

  const numField = (label: string, key: keyof EditableCost, prefix = '$') => (
    <label className="block">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      <div className="relative mt-1">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">{prefix}</span>
        )}
        <input
          type="number"
          step="0.0001"
          value={form[key]}
          onChange={(e) => set(key, e.target.value)}
          className={`w-full ${prefix ? 'pl-7' : 'pl-3'} pr-3 py-2 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]`}
          placeholder="0.00"
        />
      </div>
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-xl h-full overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] px-6 py-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--text-primary)] truncate">{row.productName || row.fgPartNumber}</h3>
            <p className="text-xs font-mono text-[var(--text-tertiary)]">{row.fgPartNumber}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Live roll-up (read-only) */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2">
            <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Live roll-up (read-only)</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <span className="text-[var(--text-secondary)]">Component Cost</span>
              <span className="text-right tabular-nums">{fmtCurrency(row.componentCost, 4)}</span>
              <span className="text-[var(--text-secondary)]">Bulk Cost</span>
              <span className="text-right tabular-nums">{fmtCurrency(row.bulkCost, 4)}</span>
              <span className="text-[var(--text-secondary)] font-medium">Rolled COGS</span>
              <span className="text-right tabular-nums font-medium">{fmtCurrency(row.rolledCogs, 4)}</span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--danger-light)] text-[var(--danger)] text-xs">
              <AlertTriangle size={13} />
              {error}
            </div>
          )}

          {/* Editable finance-owned fields */}
          <div className="grid grid-cols-2 gap-3">
            {numField('Label Cost / unit', 'labelCost')}
            {numField('Freight / unit', 'freightPerUnit')}
            {numField('Overhead / unit', 'overheadPerUnit')}
            {numField('Retail Price', 'retailPrice')}
            {numField('Target Margin %', 'targetMarginPct', '')}
            {numField('COGS Override', 'cogsOverride')}
          </div>
          <label className="block">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              className="mt-1 w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-none"
              placeholder="Costing assumptions, quote refs…"
            />
          </label>
        </div>

        <div className="sticky bottom-0 bg-[var(--bg-elevated)] border-t border-[var(--border-subtle)] px-6 py-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 px-5 py-2 text-sm rounded-lg disabled:opacity-60">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save Costs
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Costing (COGS) tab ────────────────────────────────────
export function CostingTab({
  financeModuleId,
  financeItems,
  financeDeptId,
}: {
  financeModuleId: string | null
  // Raw FINANCE_COSTING ModuleItems (for matching the edit target by fgPartNumber).
  financeItems: any[]
  financeDeptId: string | null
}) {
  const qc = useQueryClient()
  const { data: summary, isLoading: sumLoading } = useFinanceSummary()
  const { data: costs = [], isLoading: costsLoading } = useProductCosts()
  const [search, setSearch] = useState('')
  const [editRow, setEditRow] = useState<any>(null)

  const q = search.toLowerCase()
  const filtered = useMemo(
    () =>
      (costs as any[]).filter((c) =>
        !q ||
        [c.fgPartNumber, c.productName, c.brand].some((v: any) => (v ?? '').toString().toLowerCase().includes(q)),
      ),
    [costs, q],
  )

  // Match the FINANCE_COSTING ModuleItem for the row being edited, by fgPartNumber.
  const existingItem = useMemo(() => {
    if (!editRow) return null
    const found = (financeItems || []).find((i) => i?.data?.fgPartNumber === editRow.fgPartNumber)
    return found ? { id: found.id, data: found.data || {} } : null
  }, [editRow, financeItems])

  // After a save, refetch BOTH the live roll-up (finance.product-costs/summary)
  // and the source FINANCE_COSTING module so the margin updates everywhere.
  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ['finance'] })
    if (financeDeptId) qc.invalidateQueries({ queryKey: ['department', financeDeptId] })
  }

  const marginColor = (row: any) => {
    const vs = toNum(row.marginVsTarget)
    if (vs == null) return 'var(--text-secondary)'
    return vs >= 0 ? 'var(--success)' : 'var(--danger)'
  }

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {sumLoading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="data-cell h-[76px]"><div className="skeleton h-full w-full" /></div>)
        ) : (
          <>
            <KpiCard icon={Layers} label="SKUs Costed" value={fmtInt(summary?.skuCount)} />
            <KpiCard icon={Percent} label="Avg Margin" value={fmtPct(summary?.avgMarginPct)} tone="var(--success)" />
            <KpiCard icon={DollarSign} label="Total Rolled COGS" value={fmtCurrency(summary?.totalRolledCogs, 2)} tone="var(--warning)" />
            <KpiCard icon={TrendingDown} label="Below Target" value={fmtInt(summary?.belowTargetCount)} tone={summary?.belowTargetCount > 0 ? 'var(--danger)' : 'var(--text-tertiary)'} />
          </>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">Product COGS &amp; Margins</h2>
          <span className="text-xs text-[var(--text-tertiary)]">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <PushToErpButton feedKey="finance" label="Finance costing" />
          <div className="relative min-w-[260px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="Search SKU, product, brand…"
            />
          </div>
        </div>
      </div>

      {/* Product cost table */}
      {costsLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">No product costs found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Brand</th>
                <th className="text-right">Component</th>
                <th className="text-right">Bulk</th>
                <th className="text-right">Label</th>
                <th className="text-right">Freight</th>
                <th className="text-right">Overhead</th>
                <th className="text-right">Rolled COGS</th>
                <th className="text-right">COGS</th>
                <th className="text-right">Retail</th>
                <th className="text-right">Margin %</th>
                <th className="text-right">vs Target</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row: any) => (
                <tr key={row.fgPartNumber} className="clickable-row" onClick={() => setEditRow(row)}>
                  <td className="font-mono text-xs text-[var(--accent)]">{row.fgPartNumber}</td>
                  <td className="font-medium text-[var(--text-primary)]">
                    <div className="flex items-center gap-2">
                      {row.productName || '—'}
                      {row.incomplete && (
                        <span className="badge badge-critical" title="Cost roll-up incomplete">
                          <AlertTriangle size={10} /> incomplete
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-[var(--text-secondary)]">{row.brand || '—'}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtCurrency(row.componentCost, 4)}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtCurrency(row.bulkCost, 4)}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtCurrency(row.labelCost, 4)}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtCurrency(row.freightPerUnit, 4)}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtCurrency(row.overheadPerUnit, 4)}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtCurrency(row.rolledCogs, 4)}</td>
                  <td className="text-right tabular-nums font-medium text-[var(--text-primary)]">{fmtCurrency(row.cogs, 4)}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtCurrency(row.retail, 2)}</td>
                  <td className="text-right tabular-nums" style={{ color: marginColor(row) }}>{fmtPct(row.marginPct)}</td>
                  <td className="text-right tabular-nums" style={{ color: marginColor(row) }}>
                    {row.marginVsTarget == null ? '—' : `${toNum(row.marginVsTarget)! >= 0 ? '+' : ''}${fmtPct(row.marginVsTarget)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editRow && (
        <CostDrawer
          row={editRow}
          financeModuleId={financeModuleId}
          existingItem={existingItem}
          onClose={() => setEditRow(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
