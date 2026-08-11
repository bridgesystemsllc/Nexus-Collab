import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, X, AlertTriangle } from 'lucide-react'
import { useProjectDepartments, useProjectTypes, useProjectTemplates, useCreateProject } from '../hooks/useProjects'
import { useProjectScope } from '../context/ProjectScopeContext'
import { useMembers } from '@/hooks/useData'

// ─── Create wizard ───────────────────────────────────────────
// Four steps, never one giant form. Draft state is persisted to localStorage
// at every keystroke: losing a half-written business case to an accidental
// refresh is the fastest way to make people stop using a tool.

const DRAFT_KEY = 'nexus.projects.createDraft.v1'

interface Draft {
  title: string
  projectTypeId: string
  ownerDepartmentId: string
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  description: string
  brands: string
  retailers: string
  markets: string
  businessCase: string
  successCriteria: string
  budgetAmount: string
  savingsTarget: string
  templateId: string
  startDate: string
  targetEndDate: string
  participating: string[]
  people: string[]
  checkinCadence: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'NONE'
}

const EMPTY: Draft = {
  title: '', projectTypeId: '', ownerDepartmentId: '', priority: 'MEDIUM', description: '',
  brands: '', retailers: '', markets: '', businessCase: '', successCriteria: '',
  budgetAmount: '', savingsTarget: '', templateId: '',
  startDate: new Date().toISOString().slice(0, 10), targetEndDate: '',
  participating: [], people: [], checkinCadence: 'WEEKLY',
}

const STEPS = ['Basics', 'Scope', 'Plan', 'Team & Cadence'] as const

const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

export function ProjectCreateWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { departmentId: scopeDeptId } = useProjectScope()
  const { data: departments = [] } = useProjectDepartments()
  const { data: types = [] } = useProjectTypes()
  const { data: orgMembers = [] } = useMembers()
  const create = useCreateProject()

  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) return { ...EMPTY, ...JSON.parse(saved) }
    } catch { /* a corrupt draft should not block creating a project */ }
    return EMPTY
  })

  // Default the owning department to whichever tab the user opened this from.
  useEffect(() => {
    if (!draft.ownerDepartmentId && scopeDeptId) {
      setDraft((d) => ({ ...d, ownerDepartmentId: scopeDeptId }))
    }
  }, [scopeDeptId, draft.ownerDepartmentId])

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* quota — not fatal */ }
  }, [draft])

  const selectedType = types.find((t) => t.id === draft.projectTypeId)
  const { data: templates = [] } = useProjectTemplates(draft.projectTypeId || undefined)

  // Choosing a type pre-selects its owning department, matching how the
  // taxonomy is configured, unless the user already picked one.
  useEffect(() => {
    if (selectedType?.defaultDepartment && !scopeDeptId) {
      setDraft((d) => d.ownerDepartmentId ? d : { ...d, ownerDepartmentId: selectedType.defaultDepartment!.id })
    }
  }, [selectedType, scopeDeptId])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const required = selectedType?.requiredFields ?? []
  const missingRequired = useMemo(() => {
    return required.filter((f) => {
      if (f === 'savingsTarget') return !draft.savingsTarget.trim()
      if (f === 'retailers') return splitList(draft.retailers).length === 0
      if (f === 'markets') return splitList(draft.markets).length === 0
      return false
    })
  }, [required, draft])

  const canAdvance =
    step === 0 ? !!(draft.title.trim() && draft.projectTypeId && draft.ownerDepartmentId)
    : step === 1 ? missingRequired.length === 0
    : true

  const submit = async () => {
    setError(null)
    const customFields: Record<string, unknown> = {}
    if (draft.savingsTarget.trim()) customFields.savingsTarget = Number(draft.savingsTarget)

    try {
      const res = await create.mutateAsync({
        title: draft.title.trim(),
        projectTypeId: draft.projectTypeId,
        ownerDepartmentId: draft.ownerDepartmentId,
        priority: draft.priority,
        status: 'DRAFT',
        ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
        ...(draft.businessCase.trim() ? { businessCase: draft.businessCase.trim() } : {}),
        ...(draft.successCriteria.trim() ? { successCriteria: draft.successCriteria.trim() } : {}),
        brands: splitList(draft.brands),
        retailers: splitList(draft.retailers),
        markets: splitList(draft.markets),
        ...(draft.startDate ? { startDate: draft.startDate } : {}),
        ...(draft.targetEndDate ? { targetEndDate: draft.targetEndDate } : {}),
        ...(draft.budgetAmount.trim() ? { budgetAmount: Number(draft.budgetAmount) } : {}),
        ...(Object.keys(customFields).length ? { customFields } : {}),
        ...(draft.templateId ? { templateId: draft.templateId } : {}),
        checkinCadence: draft.checkinCadence,
        participatingDepartments: draft.participating
          .filter((id) => id !== draft.ownerDepartmentId)
          .map((id) => ({ departmentId: id, role: 'CONTRIBUTOR' as const })),
        members: draft.people.map((id) => ({ memberId: id })),
      })
      localStorage.removeItem(DRAFT_KEY)
      onCreated((res.data as any).id)
    } catch (err: any) {
      // Surface the server's message; a generic failure gives the user nothing
      // to correct.
      setError(err?.message ?? 'Could not create the project')
    }
  }

  const field = 'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-secondary)]'
  const labelCls = 'block text-xs font-medium text-[var(--text-secondary)] mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="presentation" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="New initiative"
      >
        {/* Header + progress */}
        <div className="sticky top-0 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] px-5 py-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">New Initiative</h2>
            <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1 flex items-center gap-1.5">
                <div
                  className="flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap"
                  style={{ color: i <= step ? 'var(--accent-secondary)' : 'var(--text-tertiary)' }}
                >
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[9px]"
                    style={{
                      background: i < step ? 'var(--accent-secondary)' : i === step ? 'var(--accent-secondary-light)' : 'var(--bg-overlay)',
                      color: i < step ? '#fff' : i === step ? 'var(--accent-secondary)' : 'var(--text-tertiary)',
                    }}
                  >
                    {i < step ? <Check size={9} /> : i + 1}
                  </span>
                  {s}
                </div>
                {i < STEPS.length - 1 && <div className="flex-1 h-px bg-[var(--border-subtle)]" />}
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 space-y-4">
          {step === 0 && (
            <>
              <div>
                <label className={labelCls} htmlFor="p-title">Title</label>
                <input id="p-title" className={field} value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Ambi Even & Clear serum reformulation" autoFocus />
              </div>
              <div>
                <span className={labelCls}>Type</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                  {types.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => set('projectTypeId', t.id)}
                      className={`text-left rounded-lg border p-2.5 transition-all ${
                        draft.projectTypeId === t.id
                          ? 'border-[var(--accent-secondary)] bg-[var(--accent-secondary-light)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <p className="text-xs font-medium text-[var(--text-primary)] leading-snug">{t.label}</p>
                      {t.defaultDepartment && (
                        <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{t.defaultDepartment.name}</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="p-dept">Owning department</label>
                  <select id="p-dept" className={field} value={draft.ownerDepartmentId} onChange={(e) => set('ownerDepartmentId', e.target.value)}>
                    <option value="">Select…</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-prio">Priority</label>
                  <select id="p-prio" className={field} value={draft.priority} onChange={(e) => set('priority', e.target.value as Draft['priority'])}>
                    {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
                      <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="p-desc">Description</label>
                <textarea id="p-desc" className={field} rows={3} value={draft.description} onChange={(e) => set('description', e.target.value)} />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              {missingRequired.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,159,10,0.10)' }}>
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
                  <span className="text-[var(--text-primary)]">
                    {selectedType?.label} requires: {missingRequired.join(', ')}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls} htmlFor="p-brands">Brands</label>
                  <input id="p-brands" className={field} value={draft.brands} onChange={(e) => set('brands', e.target.value)} placeholder="Ambi, Carol's Daughter" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-retail">Retailers</label>
                  <input id="p-retail" className={field} value={draft.retailers} onChange={(e) => set('retailers', e.target.value)} placeholder="Target, Walmart" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-markets">Markets</label>
                  <input id="p-markets" className={field} value={draft.markets} onChange={(e) => set('markets', e.target.value)} placeholder="US, CA" />
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-tertiary)] -mt-2">Comma-separated.</p>
              <div>
                <label className={labelCls} htmlFor="p-case">Business case — why are we doing this?</label>
                <textarea id="p-case" className={field} rows={3} value={draft.businessCase} onChange={(e) => set('businessCase', e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="p-success">Success criteria — how will we know it worked?</label>
                <textarea id="p-success" className={field} rows={3} value={draft.successCriteria} onChange={(e) => set('successCriteria', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="p-budget">Budget (optional)</label>
                  <input id="p-budget" type="number" className={field} value={draft.budgetAmount} onChange={(e) => set('budgetAmount', e.target.value)} />
                </div>
                {required.includes('savingsTarget') && (
                  <div>
                    <label className={labelCls} htmlFor="p-savings">Savings target (required)</label>
                    <input id="p-savings" type="number" className={field} value={draft.savingsTarget} onChange={(e) => set('savingsTarget', e.target.value)} />
                  </div>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <span className={labelCls}>Start from a template</span>
                <div className="space-y-2">
                  <button
                    onClick={() => set('templateId', '')}
                    className={`w-full text-left rounded-lg border p-3 transition-all ${
                      !draft.templateId ? 'border-[var(--accent-secondary)] bg-[var(--accent-secondary-light)]' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                    }`}
                  >
                    <p className="text-xs font-medium text-[var(--text-primary)]">Start blank</p>
                    <p className="text-[11px] text-[var(--text-tertiary)]">Add phases and tasks yourself.</p>
                  </button>
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => set('templateId', t.id)}
                      className={`w-full text-left rounded-lg border p-3 transition-all ${
                        draft.templateId === t.id ? 'border-[var(--accent-secondary)] bg-[var(--accent-secondary-light)]' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <p className="text-xs font-medium text-[var(--text-primary)]">{t.name}</p>
                      {t.description && <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{t.description}</p>}
                    </button>
                  ))}
                  {draft.projectTypeId && templates.length === 0 && (
                    <p className="text-[11px] text-[var(--text-tertiary)]">No template exists for this type yet.</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="p-start">Start date</label>
                  <input id="p-start" type="date" className={field} value={draft.startDate} onChange={(e) => set('startDate', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-end">Target end date</label>
                  <input id="p-end" type="date" className={field} value={draft.targetEndDate} onChange={(e) => set('targetEndDate', e.target.value)} />
                </div>
              </div>
              {draft.templateId && (
                <p className="text-[11px] text-[var(--text-tertiary)]">
                  Template phases, milestones and tasks are laid out relative to the start date.
                </p>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <span className={labelCls}>Participating departments</span>
                <div className="grid grid-cols-2 gap-2">
                  {departments.filter((d) => d.id !== draft.ownerDepartmentId).map((d) => {
                    const on = draft.participating.includes(d.id)
                    return (
                      <button
                        key={d.id}
                        onClick={() => set('participating', on ? draft.participating.filter((x) => x !== d.id) : [...draft.participating, d.id])}
                        className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-all ${
                          on ? 'border-[var(--accent-secondary)] bg-[var(--accent-secondary-light)]' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
                          style={{
                            borderColor: on ? 'var(--accent-secondary)' : 'var(--border-strong)',
                            background: on ? 'var(--accent-secondary)' : 'transparent',
                          }}
                        >
                          {on && <Check size={9} color="#fff" />}
                        </span>
                        <span className="text-xs text-[var(--text-primary)]">{d.name}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-2">
                  Each department gets its own lane and sees this project in its own Projects tab.
                </p>
              </div>
              <div>
                <span className={labelCls}>People</span>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {(orgMembers as any[]).map((m: any) => {
                    const on = draft.people.includes(m.id)
                    const deptName = departments.find((d) => d.id === m.departmentId)?.name
                    return (
                      <button
                        key={m.id}
                        onClick={() => set('people', on ? draft.people.filter((x) => x !== m.id) : [...draft.people, m.id])}
                        className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-all ${
                          on ? 'border-[var(--accent-secondary)] bg-[var(--accent-secondary-light)]' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
                          style={{
                            borderColor: on ? 'var(--accent-secondary)' : 'var(--border-strong)',
                            background: on ? 'var(--accent-secondary)' : 'transparent',
                          }}
                        >
                          {on && <Check size={9} color="#fff" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs text-[var(--text-primary)] truncate">{m.name}</span>
                          {deptName && <span className="block text-[10px] text-[var(--text-tertiary)] truncate">{deptName}</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-2">
                  Each person joins the project representing their department, and it appears in their Cowork Spaces.
                </p>
              </div>
              <div>
                <label className={labelCls} htmlFor="p-cadence">Check-in cadence</label>
                <select id="p-cadence" className={field} value={draft.checkinCadence} onChange={(e) => set('checkinCadence', e.target.value as Draft['checkinCadence'])}>
                  {(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'NONE'] as const).map((c) => (
                    <option key={c} value={c}>{c[0] + c.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,69,58,0.08)' }} role="alert">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
              <span className="text-[var(--text-primary)]">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-5 py-3">
          <button
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            {step === 0 ? 'Cancel' : <><ChevronLeft size={14} /> Back</>}
          </button>
          <span className="text-[11px] text-[var(--text-tertiary)]">Draft saved automatically</span>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40 transition-all active:scale-[0.98]"
              style={{ background: 'var(--accent-secondary)' }}
            >
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={create.isPending || !draft.title.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40 transition-all active:scale-[0.98]"
              style={{ background: 'var(--accent-secondary)' }}
            >
              {create.isPending ? 'Creating…' : <><Check size={14} /> Create Initiative</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
