import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { FlaskConical } from 'lucide-react'
import { useCostAnalysis, useProductCosts } from '@/hooks/useData'
import { fmtCurrency, fmtPct, toNum } from './financeFormat'

// Dark-theme palette for chart slices/bars (CSS-var hex equivalents — recharts
// cannot read CSS custom properties for fills, so the literal hexes mirror
// design-system.css).
const CHART_COLORS = ['#2F80ED', '#9B59B6', '#0F7B6C', '#D97706', '#E74C8B', '#EB5757', '#7C3AED']
const GRID = '#E8E5E0'
const AXIS = '#7A7A7A'

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="data-cell">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3>
        {subtitle && <p className="text-xs text-[var(--text-tertiary)]">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function ChartTooltip({ active, payload, valueFmt }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-[var(--text-primary)]">{p.payload.name || p.payload.label}</p>
      <p className="text-[var(--text-secondary)] tabular-nums">{valueFmt ? valueFmt(p.value) : p.value}</p>
    </div>
  )
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-[220px] text-xs text-[var(--text-tertiary)]">{text}</div>
  )
}

export function CostAnalysisTab() {
  const { data: analysis = [], isLoading } = useCostAnalysis()
  const { data: costs = [] } = useProductCosts()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const list = analysis as any[]
  const selected = useMemo(() => {
    if (!list.length) return null
    return list.find((f) => f.formulationId === selectedId) || list[0]
  }, [list, selectedId])

  // Margin-by-SKU bar data (from product-costs).
  const marginData = useMemo(
    () =>
      (costs as any[])
        .map((c) => ({
          label: c.fgPartNumber,
          name: c.productName || c.fgPartNumber,
          marginPct: toNum(c.marginPct) ?? 0,
          belowTarget: (toNum(c.marginVsTarget) ?? 0) < 0,
        }))
        .sort((a, b) => b.marginPct - a.marginPct),
    [costs],
  )

  const driverData = (selected?.topDrivers || []).map((d: any, i: number) => ({
    name: d.inciName || d.phase || `Driver ${i + 1}`,
    value: toNum(d.costContribution) ?? 0,
  }))
  const phaseData = (selected?.byPhase || []).map((p: any) => ({
    name: p.phase,
    label: p.phase,
    value: toNum(p.cost) ?? 0,
  }))

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-48 w-full" />)}</div>
  }

  return (
    <div className="space-y-5">
      {/* Formulation selector */}
      {list.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <FlaskConical size={15} className="text-[var(--accent)]" />
          {list.map((f) => {
            const active = (selected?.formulationId === f.formulationId)
            return (
              <button
                key={f.formulationId}
                onClick={() => setSelectedId(f.formulationId)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-[var(--accent)] text-white border-transparent'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                }`}
              >
                {f.productName}
              </button>
            )
          })}
        </div>
      )}

      {/* Per-formulation cost/kg + charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Top Cost Drivers"
          subtitle={selected ? `${selected.productName} — ${fmtCurrency(selected.totalCostPerKg, 2)}/kg` : undefined}
        >
          {driverData.length === 0 ? (
            <EmptyChart text="No ingredient cost breakdown available for this formulation." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={driverData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                  {driverData.map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip valueFmt={(v: number) => fmtCurrency(v, 4)} />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Cost by Phase" subtitle={selected?.productName}>
          {phaseData.length === 0 ? (
            <EmptyChart text="No phase cost breakdown available for this formulation." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={phaseData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <XAxis dataKey="name" stroke={AXIS} fontSize={11} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis stroke={AXIS} fontSize={11} tickLine={false} axisLine={{ stroke: GRID }} />
                <Tooltip cursor={{ fill: 'var(--bg-hover)' }} content={<ChartTooltip valueFmt={(v: number) => fmtCurrency(v, 4)} />} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} fill={CHART_COLORS[0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Margin by SKU */}
      <ChartCard title="Margin by SKU" subtitle="Gross margin % across costed finished goods">
        {marginData.length === 0 ? (
          <EmptyChart text="No product cost data available." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={marginData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis stroke={AXIS} fontSize={11} tickLine={false} axisLine={{ stroke: GRID }} unit="%" />
              <Tooltip cursor={{ fill: 'var(--bg-hover)' }} content={<ChartTooltip valueFmt={(v: number) => fmtPct(v)} />} />
              <Bar dataKey="marginPct" radius={[4, 4, 0, 0]}>
                {marginData.map((d, i) => (
                  <Cell key={i} fill={d.belowTarget ? '#EB5757' : '#0F7B6C'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
