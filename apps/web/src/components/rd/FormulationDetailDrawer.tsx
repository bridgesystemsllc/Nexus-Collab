import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  X, Beaker, FileText, DollarSign, ClipboardList, History, Layers,
  ChevronDown, ChevronRight, Plus, Trash2, Edit3, CheckCircle2, AlertTriangle,
  Thermometer, Timer, Gauge,
} from 'lucide-react'
import { TaskAttachments } from '@/components/shared/TaskAttachments'

// ─── Types ─────────────────────────────────────────────────

interface FormulationDetailDrawerProps {
  open: boolean
  formulation: any
  onClose: () => void
  onUpdate: (updates: any) => void
}

type TabKey = 'composition' | 'procedure' | 'specs' | 'cost' | 'history' | 'attachments'

interface Ingredient {
  inciName?: string
  tradeName?: string
  supplier?: string
  function?: string
  percentage?: number
  costPerKg?: number
  phase?: string
}

interface ProcedureStep {
  step?: number
  phase?: string
  instruction?: string
  temperature?: number
  mixingSpeed?: number
  duration?: number
}

interface ChangeLogEntry {
  version?: string
  date?: string
  summary?: string
  author?: string
}

// ─── Constants ─────────────────────────────────────────────

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'composition', label: 'Composition', icon: Layers },
  { key: 'procedure', label: 'Procedure', icon: ClipboardList },
  { key: 'specs', label: 'Specs & Claims', icon: Beaker },
  { key: 'cost', label: 'Cost', icon: DollarSign },
  { key: 'history', label: 'History', icon: History },
  { key: 'attachments', label: 'Attachments', icon: FileText },
]

const PHASE_COLORS: Record<string, string> = {
  A: '#6366F1',   // indigo
  B: '#10B981',   // emerald
  C: '#F59E0B',   // amber
  D: '#F43F5E',   // rose
  E: '#64748B',   // slate
  'Post-Add': '#9CA3AF', // gray
}

const PHASE_ORDER = ['A', 'B', 'C', 'D', 'E', 'Post-Add']

const STATUS_PILL_STYLES: Record<string, { bg: string; text: string }> = {
  Draft:    { bg: 'var(--bg-hover)', text: '#6B7280' },
  'In Review': { bg: 'var(--info-light)', text: '#3B82F6' },
  Approved: { bg: 'var(--success-light)', text: '#10B981' },
  Obsolete: { bg: 'var(--danger-light)', text: '#EF4444' },
}

const STABILITY_PILL_STYLES: Record<string, { bg: string; text: string }> = {
  Pass:    { bg: 'var(--success-light)', text: 'var(--success)' },
  Testing: { bg: 'var(--warning-light)', text: 'var(--warning)' },
  Pending: { bg: 'var(--info-light)', text: 'var(--info)' },
}

// ─── Helpers ───────────────────────────────────────────────

function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold whitespace-nowrap"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  )
}

function EmptyState({ icon: Icon, message, sub }: { icon: React.ElementType; message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center mb-4">
        <Icon size={22} className="text-[var(--text-tertiary)]" />
      </div>
      <p className="text-[14px] text-[var(--text-secondary)] font-medium">{message}</p>
      {sub && <p className="text-[12px] text-[var(--text-tertiary)] mt-1 max-w-xs">{sub}</p>}
    </div>
  )
}

function formatDate(d: string | undefined | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`
}

// ─── Main Component ────────────────────────────────────────

export function FormulationDetailDrawer({
  open,
  formulation,
  onClose,
  onUpdate,
}: FormulationDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('composition')
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())

  // Escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, handleKeyDown])

  // Reset tab when drawer opens with new formulation
  useEffect(() => {
    if (open) {
      setActiveTab('composition')
      setCollapsedPhases(new Set())
    }
  }, [open, formulation?.id])

  // ── Derived data ───────────────────────────────────────

  const f = formulation ?? {}

  const ingredients: Ingredient[] = useMemo(() => f.ingredients ?? [], [f.ingredients])

  const ingredientsByPhase = useMemo(() => {
    const map: Record<string, Ingredient[]> = {}
    for (const ing of ingredients) {
      const phase = ing.phase || 'A'
      if (!map[phase]) map[phase] = []
      map[phase].push(ing)
    }
    // Sort phases by defined order
    const sorted: [string, Ingredient[]][] = []
    for (const p of PHASE_ORDER) {
      if (map[p]) sorted.push([p, map[p]])
    }
    // Any remaining phases not in standard order
    for (const p of Object.keys(map)) {
      if (!PHASE_ORDER.includes(p)) sorted.push([p, map[p]])
    }
    return sorted
  }, [ingredients])

  const totalPercentage = useMemo(
    () => ingredients.reduce((sum, ing) => sum + (ing.percentage ?? 0), 0),
    [ingredients],
  )

  const procedure: ProcedureStep[] = useMemo(() => f.procedure ?? [], [f.procedure])

  const physicalSpecs = useMemo(() => {
    const specs = f.physicalSpecs ?? {}
    return {
      pH: specs.pH ?? f.ph ?? null,
      viscosity: specs.viscosity ?? f.viscosity ?? null,
      specificGravity: specs.specificGravity ?? f.specificGravity ?? null,
      appearance: specs.appearance ?? f.appearance ?? null,
      odor: specs.odor ?? f.odor ?? null,
      color: specs.color ?? f.color ?? null,
    }
  }, [f])

  const claims: string[] = useMemo(() => f.claims ?? [], [f.claims])

  const regulatoryFlags = useMemo(() => f.regulatoryFlags ?? {}, [f.regulatoryFlags])

  const changeLog: ChangeLogEntry[] = useMemo(
    () => f.changeLog ?? f.versions ?? [],
    [f.changeLog, f.versions],
  )

  // Cost calculations
  const costAnalysis = useMemo(() => {
    const ingredientsWithCost = ingredients.filter((i) => i.costPerKg != null && i.percentage != null)
    if (ingredientsWithCost.length === 0) return null

    const totalCostPerKg = ingredientsWithCost.reduce(
      (sum, i) => sum + ((i.percentage! / 100) * i.costPerKg!),
      0,
    )

    const costPerUnit = f.targetFillWeight
      ? totalCostPerKg * (f.targetFillWeight / 1000)
      : null

    const costDrivers = [...ingredientsWithCost]
      .map((i) => ({
        name: i.inciName || i.tradeName || 'Unknown',
        cost: (i.percentage! / 100) * i.costPerKg!,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5)

    const costByPhase: { phase: string; cost: number }[] = []
    for (const [phase, ings] of ingredientsByPhase) {
      const phaseCost = ings
        .filter((i) => i.costPerKg != null && i.percentage != null)
        .reduce((sum, i) => sum + ((i.percentage! / 100) * i.costPerKg!), 0)
      if (phaseCost > 0) costByPhase.push({ phase, cost: phaseCost })
    }

    return { totalCostPerKg, costPerUnit, costDrivers, costByPhase }
  }, [ingredients, ingredientsByPhase, f.targetFillWeight])

  // ── Phase toggle ───────────────────────────────────────

  function togglePhase(phase: string) {
    setCollapsedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(phase)) next.delete(phase)
      else next.add(phase)
      return next
    })
  }

  // ── Render guard ───────────────────────────────────────

  if (!open || !formulation) return null

  // ── Status values ──────────────────────────────────────

  const version = f.version ?? f.versionLabel ?? null
  const status = f.status ?? 'Draft'
  const stability = f.stability ?? f.stabilityStatus ?? null
  const statusStyle = STATUS_PILL_STYLES[status] ?? { bg: 'var(--bg-hover)', text: '#6B7280' }
  const stabilityStyle = stability
    ? STABILITY_PILL_STYLES[stability] ?? { bg: 'var(--bg-hover)', text: '#6B7280' }
    : null

  // ── Running index for ingredient table ─────────────────

  let globalIndex = 0

  // ── Render ─────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative max-w-[720px] w-full h-screen bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl flex flex-col animate-slide-in-right"
        style={{ animation: 'slideInRight 0.25s ease-out' }}
      >
        {/* ── Header ──────────────────────────────────── */}
        <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-[var(--border-subtle)]">
          {/* Top row: title + close */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-[var(--text-primary)] truncate">
                {f.name || f.title || f.formulaName || 'Untitled Formulation'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex-shrink-0"
              aria-label="Close drawer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Pills row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {version && (
              <Pill label={version.startsWith('v') ? version : `v${version}`} bg="var(--bg-hover)" color="var(--text-secondary)" />
            )}
            <Pill label={status} bg={statusStyle.bg} color={statusStyle.text} />
            {stabilityStyle && stability && (
              <Pill label={stability} bg={stabilityStyle.bg} color={stabilityStyle.text} />
            )}
          </div>

          {/* Sub-line */}
          <p className="text-[12px] text-[var(--text-tertiary)] mt-2 truncate">
            {[
              f.cmName && `CM: ${f.cmName}`,
              f.createdBy && `Created by ${f.createdBy}`,
              (f.updatedAt || f.lastUpdated) && `Last updated ${formatDate(f.updatedAt || f.lastUpdated)}`,
            ]
              .filter(Boolean)
              .join(' \u00B7 ')}
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => onUpdate({ action: 'new-version' })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <Plus size={14} />
              New Version
            </button>
            <button
              onClick={() => onUpdate({ action: 'edit' })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <Edit3 size={14} />
              Edit
            </button>
          </div>
        </div>

        {/* ── Tab Bar ─────────────────────────────────── */}
        <div className="flex-shrink-0 px-6 border-b border-[var(--border-subtle)] overflow-x-auto">
          <div className="flex gap-1 -mb-px">
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = activeTab === key
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                    active
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Tab Content ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ──── Composition Tab ──────────────────────── */}
          {activeTab === 'composition' && (
            <div className="space-y-4">
              {ingredients.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  message="No composition data yet."
                  sub="Add ingredients or import a formula document."
                />
              ) : (
                <>
                  {ingredientsByPhase.map(([phase, phaseIngredients]) => {
                    const collapsed = collapsedPhases.has(phase)
                    const phaseColor = PHASE_COLORS[phase] ?? '#9CA3AF'
                    return (
                      <div key={phase}>
                        {/* Phase header */}
                        <button
                          onClick={() => togglePhase(phase)}
                          className="flex items-center gap-2 w-full py-2 text-left group"
                        >
                          {collapsed ? (
                            <ChevronRight size={14} className="text-[var(--text-tertiary)]" />
                          ) : (
                            <ChevronDown size={14} className="text-[var(--text-tertiary)]" />
                          )}
                          <span
                            className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold text-white"
                            style={{ background: phaseColor }}
                          >
                            {phase.length <= 2 ? phase : phase.charAt(0)}
                          </span>
                          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                            Phase {phase}
                          </span>
                          <span className="text-[11px] text-[var(--text-tertiary)]">
                            ({phaseIngredients.length} ingredient{phaseIngredients.length !== 1 ? 's' : ''})
                          </span>
                        </button>

                        {/* Ingredient rows */}
                        {!collapsed && (
                          <div className="ml-2 rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                            {/* Column headers */}
                            <div className="grid grid-cols-[36px_1fr_1fr_100px_80px_70px_70px] gap-2 px-3 py-2 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
                              <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase">#</span>
                              <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase">INCI Name</span>
                              <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase">Trade Name</span>
                              <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase">Supplier</span>
                              <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase">Function</span>
                              <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase text-right">% w/w</span>
                              <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase text-right">Cost/kg</span>
                            </div>
                            {phaseIngredients.map((ing, idx) => {
                              globalIndex++
                              return (
                                <div
                                  key={idx}
                                  className="grid grid-cols-[36px_1fr_1fr_100px_80px_70px_70px] gap-2 px-3 py-2 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-hover)] transition-colors"
                                  style={{ borderLeft: `3px solid ${phaseColor}` }}
                                >
                                  <span className="text-[12px] text-[var(--text-tertiary)] font-mono">{globalIndex}</span>
                                  <span className="text-[13px] text-[var(--text-primary)] truncate">{ing.inciName || '—'}</span>
                                  <span className="text-[13px] text-[var(--text-secondary)] truncate">{ing.tradeName || '—'}</span>
                                  <span className="text-[12px] text-[var(--text-tertiary)] truncate">{ing.supplier || '—'}</span>
                                  <span>
                                    {ing.function ? (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)] truncate">
                                        {ing.function}
                                      </span>
                                    ) : (
                                      <span className="text-[12px] text-[var(--text-tertiary)]">—</span>
                                    )}
                                  </span>
                                  <span className="text-[13px] font-mono text-right text-[var(--text-primary)]">
                                    {ing.percentage != null ? ing.percentage.toFixed(2) : '—'}
                                  </span>
                                  <span className="text-[13px] font-mono text-right text-[var(--text-secondary)]">
                                    {ing.costPerKg != null ? formatCurrency(ing.costPerKg) : '—'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Running total */}
                  <div
                    className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                      Math.abs(totalPercentage - 100) < 0.5
                        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                        : 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                    }`}
                  >
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">TOTAL</span>
                    <span
                      className={`text-[15px] font-bold font-mono ${
                        Math.abs(totalPercentage - 100) < 0.5 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {totalPercentage.toFixed(2)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ──── Procedure Tab ────────────────────────── */}
          {activeTab === 'procedure' && (
            <div className="space-y-1">
              {procedure.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  message="No procedure data."
                  sub="Add manufacturing steps to document the process."
                />
              ) : (
                <div className="relative pl-8 space-y-6">
                  {/* Vertical line */}
                  <div className="absolute left-[15px] top-4 bottom-4 w-px bg-[var(--border-subtle)]" />

                  {procedure.map((step, idx) => (
                    <div key={idx} className="relative">
                      {/* Step circle */}
                      <div className="absolute -left-8 top-0 w-[30px] h-[30px] rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[12px] font-bold z-10">
                        {step.step ?? idx + 1}
                      </div>

                      <div className="pt-0.5 space-y-2">
                        {/* Phase pill */}
                        {step.phase && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                            style={{ background: PHASE_COLORS[step.phase] ?? '#9CA3AF' }}
                          >
                            Phase {step.phase}
                          </span>
                        )}

                        {/* Instruction */}
                        <p className="text-[14px] text-[var(--text-primary)] leading-relaxed">
                          {step.instruction || '—'}
                        </p>

                        {/* Parameter badges */}
                        <div className="flex items-center gap-3 flex-wrap">
                          {step.temperature != null && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] font-medium">
                              <Thermometer size={12} className="text-orange-500" />
                              {step.temperature}&deg;C
                            </span>
                          )}
                          {step.mixingSpeed != null && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] font-medium">
                              <Gauge size={12} className="text-blue-500" />
                              {step.mixingSpeed} RPM
                            </span>
                          )}
                          {step.duration != null && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] font-medium">
                              <Timer size={12} className="text-emerald-500" />
                              {step.duration} min
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ──── Specs & Claims Tab ───────────────────── */}
          {activeTab === 'specs' && (
            <div className="space-y-6">
              {/* Physical Specs */}
              {(() => {
                const specs = physicalSpecs
                const hasAny = Object.values(specs).some((v) => v != null)
                if (!hasAny) {
                  return (
                    <EmptyState
                      icon={Beaker}
                      message="No specifications recorded yet."
                      sub="Add physical specs, claims, and regulatory data."
                    />
                  )
                }
                return (
                  <>
                    <div>
                      <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">
                        Physical Specifications
                      </h3>
                      <div className="grid grid-cols-3 gap-3">
                        {([
                          { key: 'pH', label: 'pH' },
                          { key: 'viscosity', label: 'Viscosity (cps)' },
                          { key: 'specificGravity', label: 'Specific Gravity' },
                          { key: 'appearance', label: 'Appearance' },
                          { key: 'odor', label: 'Odor' },
                          { key: 'color', label: 'Color' },
                        ] as { key: keyof typeof specs; label: string }[]).map(({ key, label }) => (
                          <div
                            key={key}
                            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-col"
                          >
                            <span className="text-[18px] font-bold text-[var(--text-primary)] font-mono">
                              {specs[key] != null ? String(specs[key]) : '—'}
                            </span>
                            <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mt-1">
                              {label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Claims */}
                    {claims.length > 0 && (
                      <div>
                        <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">
                          Claims
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {claims.map((claim) => (
                            <span
                              key={claim}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                            >
                              <CheckCircle2 size={12} className="text-emerald-500" />
                              {claim}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Regulatory Flags */}
                    {Object.keys(regulatoryFlags).length > 0 && (
                      <div>
                        <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">
                          Regulatory Compliance
                        </h3>
                        <div className="flex items-center gap-4">
                          {(['EU', 'US', 'CA'] as const).map((region) => {
                            const compliant = regulatoryFlags[region]
                            const defined = region in regulatoryFlags
                            return (
                              <div
                                key={region}
                                className={`flex items-center gap-2 px-4 py-3 rounded-lg border ${
                                  !defined
                                    ? 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                                    : compliant
                                      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                                      : 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                                }`}
                              >
                                {defined ? (
                                  compliant ? (
                                    <CheckCircle2 size={16} className="text-emerald-500" />
                                  ) : (
                                    <AlertTriangle size={16} className="text-red-500" />
                                  )
                                ) : (
                                  <span className="text-[var(--text-tertiary)] text-[14px]">—</span>
                                )}
                                <span className="text-[14px] font-semibold text-[var(--text-primary)]">
                                  {region}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )}

          {/* ──── Cost Tab ─────────────────────────────── */}
          {activeTab === 'cost' && (
            <div className="space-y-6">
              {!costAnalysis ? (
                <EmptyState
                  icon={DollarSign}
                  message="Add cost/kg to ingredients to see cost analysis."
                  sub="Cost data will be calculated automatically from ingredient percentages and per-kg costs."
                />
              ) : (
                <>
                  {/* Big number cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                      <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Total Cost / kg</p>
                      <p className="text-[28px] font-bold font-mono text-[var(--text-primary)]">
                        {formatCurrency(costAnalysis.totalCostPerKg)}
                      </p>
                    </div>
                    {costAnalysis.costPerUnit != null && (
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                        <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Cost / Unit</p>
                        <p className="text-[28px] font-bold font-mono text-[var(--text-primary)]">
                          {formatCurrency(costAnalysis.costPerUnit)}
                        </p>
                        <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                          Fill weight: {f.targetFillWeight}g
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Top 5 cost drivers */}
                  {costAnalysis.costDrivers.length > 0 && (
                    <div>
                      <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">
                        Top Cost Drivers
                      </h3>
                      <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                        {costAnalysis.costDrivers.map((driver, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-hover)] transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-[var(--text-tertiary)] font-mono w-5">{idx + 1}.</span>
                              <span className="text-[13px] text-[var(--text-primary)]">{driver.name}</span>
                            </div>
                            <span className="text-[13px] font-mono font-medium text-[var(--text-primary)]">
                              {formatCurrency(driver.cost)}/kg
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cost by phase */}
                  {costAnalysis.costByPhase.length > 0 && (
                    <div>
                      <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">
                        Cost by Phase
                      </h3>
                      <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                        {/* Header */}
                        <div className="grid grid-cols-[60px_1fr_120px] gap-2 px-4 py-2 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
                          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase">Phase</span>
                          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase">Distribution</span>
                          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase text-right">Cost/kg</span>
                        </div>
                        {costAnalysis.costByPhase.map(({ phase, cost }) => {
                          const pct = costAnalysis.totalCostPerKg > 0 ? (cost / costAnalysis.totalCostPerKg) * 100 : 0
                          return (
                            <div
                              key={phase}
                              className="grid grid-cols-[60px_1fr_120px] gap-2 items-center px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-b-0"
                            >
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="w-3 h-3 rounded-sm"
                                  style={{ background: PHASE_COLORS[phase] ?? '#9CA3AF' }}
                                />
                                <span className="text-[13px] font-medium text-[var(--text-primary)]">{phase}</span>
                              </div>
                              {/* Mini bar */}
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${Math.min(pct, 100)}%`,
                                      background: PHASE_COLORS[phase] ?? '#9CA3AF',
                                    }}
                                  />
                                </div>
                                <span className="text-[11px] text-[var(--text-tertiary)] font-mono w-10 text-right">
                                  {pct.toFixed(1)}%
                                </span>
                              </div>
                              <span className="text-[13px] font-mono font-medium text-[var(--text-primary)] text-right">
                                {formatCurrency(cost)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ──── History Tab ──────────────────────────── */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {changeLog.length === 0 ? (
                <EmptyState
                  icon={History}
                  message="No version history available."
                  sub="Version history will appear here as changes are made."
                />
              ) : (
                <div className="relative pl-6 space-y-5">
                  {/* Vertical line */}
                  <div className="absolute left-[9px] top-2 bottom-2 w-px bg-[var(--border-subtle)]" />

                  {[...changeLog].reverse().map((entry, idx) => (
                    <div key={idx} className="relative">
                      {/* Dot */}
                      <div className="absolute -left-6 top-1.5 w-[18px] h-[18px] rounded-full border-2 border-[var(--accent)] bg-[var(--bg-elevated)] z-10" />

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {entry.version && (
                            <Pill
                              label={entry.version.startsWith('v') ? entry.version : `v${entry.version}`}
                              bg="var(--bg-hover)"
                              color="var(--text-secondary)"
                            />
                          )}
                          {entry.date && (
                            <span className="text-[12px] text-[var(--text-tertiary)]">{formatDate(entry.date)}</span>
                          )}
                          {entry.author && (
                            <span className="text-[12px] text-[var(--text-tertiary)]">by {entry.author}</span>
                          )}
                        </div>
                        {entry.summary && (
                          <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{entry.summary}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ──── Attachments Tab ──────────────────────── */}
          {activeTab === 'attachments' && (
            <div className="space-y-6">
              {/* CTA banner */}
              <div className="flex items-start gap-3 p-4 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)]">
                <FileText size={20} className="text-[var(--accent)] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">
                    Attach the formula document from your CM
                  </p>
                  <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                    Excel or PDF spec sheet, COA, SDS, or any supporting documentation.
                  </p>
                </div>
              </div>

              <TaskAttachments taskId={f.id || 'unknown'} module="formulation" />
            </div>
          )}
        </div>
      </div>

      {/* Inline keyframes for slide animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
