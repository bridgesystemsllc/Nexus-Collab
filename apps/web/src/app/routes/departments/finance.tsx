import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { useDepartments } from '@/hooks/useData'

// NOTE: Foundation stub. The full Finance costing hub (tabs: Costing/COGS,
// Cost Analysis, Component Costing, MOQ Costing, CM Productivity) is built in FIN-4.
export function FinancePage() {
  const { data: departments } = useDepartments()
  const finDept = useMemo(() => {
    if (!Array.isArray(departments)) return null
    return departments.find((d: any) => d.type === 'BUILTIN_FINANCE') || null
  }, [departments])

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{ background: finDept?.color ? `${finDept.color}20` : 'var(--accent-subtle)' }}
        >
          {finDept?.icon || <BarChart3 size={20} />}
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Finance</h1>
          <p className="text-sm text-[var(--text-tertiary)]">
            COGS, cost analysis, component &amp; MOQ costing, CM productivity
          </p>
        </div>
      </div>
      <div className="text-[var(--text-tertiary)]">Finance costing hub — under construction.</div>
    </div>
  )
}
