import { useMemo, useState } from 'react'
import {
  BarChart3,
  Boxes,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Layers,
  Loader2,
  Users,
} from 'lucide-react'
import { useDepartments, useDepartment, useProductCosts, useComponentCosts, useMoqCosts, useCostAnalysis } from '@/hooks/useData'
import { CostingTab } from '@/components/finance/CostingTab'
import { CostAnalysisTab } from '@/components/finance/CostAnalysisTab'
import { ComponentCostingTab } from '@/components/finance/ComponentCostingTab'
import { MoqCostingTab } from '@/components/finance/MoqCostingTab'
import { exportCostingXlsx, exportCostingPdf } from '@/components/finance/financeReport'
import { CMTab } from '@/components/cm/CMTab'

type FinanceTab = 'costing' | 'analysis' | 'components' | 'moq' | 'cm'

const TABS: { key: FinanceTab; label: string; icon: React.ElementType }[] = [
  { key: 'costing', label: 'Costing (COGS)', icon: DollarSign },
  { key: 'analysis', label: 'Cost Analysis', icon: FlaskConical },
  { key: 'components', label: 'Component Costing', icon: Boxes },
  { key: 'moq', label: 'MOQ Costing', icon: Layers },
  { key: 'cm', label: 'CM Productivity', icon: Users },
]

// Export menu: builds a costing report from the live finance payloads. Lives in
// the page header so all four datasets are available regardless of active tab.
function ExportMenu() {
  const { data: productCosts = [] } = useProductCosts()
  const { data: componentCosts = [] } = useComponentCosts()
  const { data: moqCosts = [] } = useMoqCosts()
  const { data: costAnalysis = [] } = useCostAnalysis()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const payload = { productCosts, componentCosts, moqCosts, costAnalysis }

  const runXlsx = async () => {
    setBusy(true)
    try {
      await exportCostingXlsx(payload)
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }
  const runPdf = () => {
    exportCostingPdf(payload)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-primary flex items-center gap-2 px-4 py-2 text-sm rounded-lg"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
        Export Costing Report
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-52 z-20 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-lg py-1 animate-fade-in">
            <button onClick={runXlsx} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
              <FileSpreadsheet size={15} className="text-[var(--success)]" />
              Excel (multi-sheet)
            </button>
            <button onClick={runPdf} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
              <FileText size={15} className="text-[var(--danger)]" />
              PDF (cost summary)
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function FinancePage() {
  const [activeTab, setActiveTab] = useState<FinanceTab>('costing')
  const { data: departments } = useDepartments()

  const finDept = useMemo(() => {
    if (!Array.isArray(departments)) return null
    return departments.find((d: any) => d.type === 'BUILTIN_FINANCE') || null
  }, [departments])

  const rdDept = useMemo(() => {
    if (!Array.isArray(departments)) return null
    return departments.find((d: any) => d.type === 'BUILTIN_RD') || null
  }, [departments])

  const opsDept = useMemo(() => {
    if (!Array.isArray(departments)) return null
    return departments.find((d: any) => d.type === 'BUILTIN_OPS') || null
  }, [departments])

  const { data: finDetail } = useDepartment(finDept?.id || '')
  // CM Productivity is owned by R&D — render the SAME module here so edits write
  // to one source of truth. Ops feeds optional briefs/production cross-links.
  const { data: rdDetail, refetch: refetchRd } = useDepartment(rdDept?.id || '')
  const { data: opsDetail } = useDepartment(opsDept?.id || '')

  // FINANCE_COSTING module: the edit target for finance-owned cost rows.
  const financeModule = useMemo(() => {
    const modules = (finDetail?.modules as any[]) || []
    return modules.find((m: any) => m.type === 'FINANCE_COSTING') || null
  }, [finDetail])

  // R&D CM module → shared into the CM Productivity tab.
  const cm = useMemo(() => {
    const modules = (rdDetail?.modules as any[]) || []
    const mod = modules.find((m: any) => m.type === 'CM_PRODUCTIVITY')
    return { items: mod?.items || [], moduleId: mod?.id || null, briefs: modules.find((m: any) => m.type === 'BRIEFS')?.items || [] }
  }, [rdDetail])

  const productionItems = useMemo(() => {
    const modules = (opsDetail?.modules as any[]) || []
    return modules.find((m: any) => m.type === 'PRODUCTION_TRACKING')?.items || []
  }, [opsDetail])

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{ background: finDept?.color ? `${finDept.color}20` : 'var(--accent-subtle)' }}
        >
          {finDept?.icon || <BarChart3 size={20} />}
        </span>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Finance</h1>
          <p className="text-sm text-[var(--text-tertiary)]">
            COGS, cost analysis, component &amp; MOQ costing, CM productivity
          </p>
        </div>
        <ExportMenu />
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] w-fit max-w-full overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-[var(--accent)] text-white shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="stagger">
        <div>
          {activeTab === 'costing' ? (
            <CostingTab
              financeModuleId={financeModule?.id ?? null}
              financeItems={financeModule?.items ?? []}
              financeDeptId={finDept?.id ?? null}
            />
          ) : activeTab === 'analysis' ? (
            <CostAnalysisTab />
          ) : activeTab === 'components' ? (
            <ComponentCostingTab />
          ) : activeTab === 'moq' ? (
            <MoqCostingTab />
          ) : (
            <CMTab
              items={cm.items}
              moduleId={cm.moduleId}
              departmentId={rdDept?.id ?? null}
              onRefresh={() => refetchRd()}
              briefItems={cm.briefs}
              productionItems={productionItems}
            />
          )}
        </div>
      </div>
    </div>
  )
}
