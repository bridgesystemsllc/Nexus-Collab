import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Save, Loader2, Package, Box, Factory, Repeat2 } from 'lucide-react'
import { FullPageForm } from '@/components/shared/FullPageForm'
import { useAppStore, type ActiveForm } from '@/stores/appStore'
import { api } from '@/lib/api'

// ─── Shared context shape ───────────────────────────────────
interface OpsFormContext {
  /** Module id the item belongs to (required). */
  moduleId?: string | null
  /** Department id, used to invalidate the cached department detail. */
  departmentId?: string | null
  /** Initial values for edit flows. */
  initialData?: Record<string, any> | null
}

// ─── Shared field primitives ────────────────────────────────
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-[var(--text-tertiary)] mt-1">{hint}</p>}
    </div>
  )
}

const inputClass =
  'w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]'

function TextInput({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <input
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${inputClass} ${mono ? 'font-mono' : ''}`}
    />
  )
}

function NumberInput({ value, onChange, placeholder }: { value: number; onChange: (v: number) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Number(e.target.value))}
      placeholder={placeholder}
      className={`${inputClass} tabular-nums`}
    />
  )
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      <option value="">Select…</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

function TextArea({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`${inputClass} resize-y`}
    />
  )
}

// ─── Generic persistence hook ───────────────────────────────
function useOpsPersist(activeForm: ActiveForm) {
  const closeForm = useAppStore((s) => s.closeForm)
  const qc = useQueryClient()
  const ctx = (activeForm.context ?? {}) as OpsFormContext
  const isEdit = activeForm.mode === 'edit'
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState('')

  const save = async (data: Record<string, any>, status?: string) => {
    if (!ctx.moduleId) {
      setSaveError('Missing module — cannot save')
      return
    }
    setSubmitting(true)
    setSaveError('')
    try {
      const body: any = { data }
      if (status !== undefined) body.status = status
      if (isEdit && activeForm.recordId) {
        await api.patch(`/departments/_/modules/${ctx.moduleId}/items/${activeForm.recordId}`, body)
      } else {
        await api.post(`/departments/_/modules/${ctx.moduleId}/items`, body)
      }
      if (ctx.departmentId) {
        await qc.invalidateQueries({ queryKey: ['department', ctx.departmentId] })
      }
      closeForm()
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || err?.message || 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return { ctx, isEdit, submitting, saveError, save, closeForm }
}

function FooterBar({ submitting, saveError, onSave, saveLabel, icon }: { submitting: boolean; saveError: string; onSave: () => void; saveLabel: string; icon?: React.ReactNode }) {
  const closeForm = useAppStore((s) => s.closeForm)
  return (
    <>
      <button
        onClick={closeForm}
        disabled={submitting}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[14px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all disabled:opacity-50"
      >
        Cancel
      </button>
      <div className="flex items-center gap-3">
        {saveError && <span className="text-[12px] text-[var(--danger)]">{saveError}</span>}
        <button onClick={onSave} disabled={submitting} className="flex items-center gap-1.5 btn-primary px-5 py-2.5 rounded-lg text-[14px] disabled:opacity-50">
          {submitting ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <>{icon ?? <Save size={15} />} {saveLabel}</>}
        </button>
      </div>
    </>
  )
}

// ─── SKU Pipeline form ──────────────────────────────────────
const SKU_STATUSES = ['Formula Pending', 'Component Sourcing', 'Awaiting Artwork', 'Pre-Production', 'In Production', 'Active', 'Discontinued']

export function SkuPipelineFormPage({ form: activeForm }: { form: ActiveForm }) {
  const { isEdit, submitting, saveError, save, closeForm } = useOpsPersist(activeForm)
  const init = (activeForm.context?.initialData ?? {}) as Record<string, any>
  const [d, setD] = useState({
    name: init.name ?? '',
    sku: init.sku ?? '',
    upc: init.upc ?? '',
    brand: init.brand ?? '',
    owner: init.owner ?? '',
    status: init.status ?? 'Formula Pending',
    step: init.step ?? 1,
    totalSteps: init.totalSteps ?? 6,
    blocker: init.blocker ?? '',
    linkedNpdId: init.linkedNpdId ?? null,
  })
  const set = (k: string, v: any) => setD((p) => ({ ...p, [k]: v }))

  return (
    <FullPageForm
      title={isEdit ? 'Edit SKU Pipeline Entry' : 'New SKU Pipeline Entry'}
      subtitle="Operations — SKU Pipeline"
      onBack={closeForm}
      backLabel="Back to SKU Pipeline"
      headerExtra={<Package size={18} className="text-[var(--accent)]" />}
      footer={<FooterBar submitting={submitting} saveError={saveError} onSave={() => save({ ...d, blocker: d.blocker || null }, d.status)} saveLabel={isEdit ? 'Save Changes' : 'Add SKU'} />}
    >
      <div className="space-y-5">
        <Field label="Product name"><TextInput value={d.name} onChange={(v) => set('name', v)} placeholder="e.g. CD Scalp Detox Shampoo 8oz" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="SKU number"><TextInput value={d.sku} onChange={(v) => set('sku', v)} placeholder="K6001100" mono /></Field>
          <Field label="UPC"><TextInput value={d.upc} onChange={(v) => set('upc', v)} placeholder="0885221006011" mono /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Brand"><TextInput value={d.brand} onChange={(v) => set('brand', v)} placeholder="cd" /></Field>
          <Field label="Owner"><TextInput value={d.owner} onChange={(v) => set('owner', v)} placeholder="Operations" /></Field>
        </div>
        <Field label="Status"><SelectInput value={d.status} onChange={(v) => set('status', v)} options={SKU_STATUSES} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Current step"><NumberInput value={d.step} onChange={(v) => set('step', v)} /></Field>
          <Field label="Total steps"><NumberInput value={d.totalSteps} onChange={(v) => set('totalSteps', v)} /></Field>
        </div>
        <Field label="Blocker" hint="Leave blank if none."><TextInput value={d.blocker} onChange={(v) => set('blocker', v)} placeholder="e.g. TricorBraun MOQ pending" /></Field>
      </div>
    </FullPageForm>
  )
}

// ─── Inventory Health form ──────────────────────────────────
const INV_STATUSES = ['emergency', 'critical', 'healthy', 'overstock']

export function InventoryFormPage({ form: activeForm }: { form: ActiveForm }) {
  const { isEdit, submitting, saveError, save, closeForm } = useOpsPersist(activeForm)
  const init = (activeForm.context?.initialData ?? {}) as Record<string, any>
  const [d, setD] = useState({
    sku: init.sku ?? '',
    name: init.name ?? '',
    onHand: init.onHand ?? 0,
    committed: init.committed ?? 0,
    available: init.available ?? 0,
    coverageMonths: init.coverageMonths ?? 0,
    status: init.status ?? 'healthy',
  })
  const set = (k: string, v: any) => setD((p) => ({ ...p, [k]: v }))

  return (
    <FullPageForm
      title={isEdit ? 'Edit Inventory Record' : 'New Inventory Record'}
      subtitle="Operations — Inventory Health"
      onBack={closeForm}
      backLabel="Back to Inventory Health"
      headerExtra={<Box size={18} className="text-[var(--accent)]" />}
      footer={<FooterBar submitting={submitting} saveError={saveError} onSave={() => save(d, d.status)} saveLabel={isEdit ? 'Save Changes' : 'Add Record'} />}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="SKU"><TextInput value={d.sku} onChange={(v) => set('sku', v)} placeholder="K4415110" mono /></Field>
          <Field label="Product name"><TextInput value={d.name} onChange={(v) => set('name', v)} placeholder="Goddess Strength Shampoo 11oz" /></Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="On-hand"><NumberInput value={d.onHand} onChange={(v) => set('onHand', v)} /></Field>
          <Field label="Committed"><NumberInput value={d.committed} onChange={(v) => set('committed', v)} /></Field>
          <Field label="Available"><NumberInput value={d.available} onChange={(v) => set('available', v)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Coverage (months)"><NumberInput value={d.coverageMonths} onChange={(v) => set('coverageMonths', v)} /></Field>
          <Field label="Status"><SelectInput value={d.status} onChange={(v) => set('status', v)} options={INV_STATUSES} /></Field>
        </div>
      </div>
    </FullPageForm>
  )
}

// ─── Production Tracking form (expanded PO form) ─────────────
const PROD_STATUSES = ['Awaiting Materials', 'Production Scheduled', 'In Production', 'QC Review', 'Ready to Ship', 'Shipped', 'On Hold']
const PROD_PRIORITIES = ['normal', 'high', 'emergency']

export function ProductionFormPage({ form: activeForm }: { form: ActiveForm }) {
  const { isEdit, submitting, saveError, save, closeForm } = useOpsPersist(activeForm)
  const init = (activeForm.context?.initialData ?? {}) as Record<string, any>
  const [d, setD] = useState({
    poNumber: init.poNumber ?? '',
    product: init.product ?? '',
    sku: init.sku ?? '',
    upc: init.upc ?? '',
    cm: init.cm ?? '',
    brand: init.brand ?? '',
    qty: init.qty ?? 0,
    value: init.value ?? 0,
    status: init.status ?? 'Awaiting Materials',
    priority: init.priority ?? 'normal',
    progress: init.progress ?? 0,
    eta: init.eta ?? '',
    requestedDel: init.requestedDel ?? '',
    cmNotes: init.cmNotes ?? '',
    coworkPending: init.coworkPending ?? false,
  })
  const set = (k: string, v: any) => setD((p) => ({ ...p, [k]: v }))

  return (
    <FullPageForm
      title={isEdit ? 'Edit Production Order' : 'New Production Order'}
      subtitle="Operations — Production Tracking"
      onBack={closeForm}
      backLabel="Back to Production Tracking"
      headerExtra={<Factory size={18} className="text-[var(--accent)]" />}
      footer={<FooterBar submitting={submitting} saveError={saveError} onSave={() => save(d, d.status)} saveLabel={isEdit ? 'Save Changes' : 'Create Order'} />}
    >
      <div className="space-y-6">
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-3">Product</h3>
          <div className="space-y-4">
            <Field label="Product name"><TextInput value={d.product} onChange={(v) => set('product', v)} placeholder="e.g. GS Shampoo 11oz" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="SKU number"><TextInput value={d.sku} onChange={(v) => set('sku', v)} placeholder="K4415110" mono /></Field>
              <Field label="UPC"><TextInput value={d.upc} onChange={(v) => set('upc', v)} placeholder="0885221006011" mono /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Brand"><TextInput value={d.brand} onChange={(v) => set('brand', v)} placeholder="Carol's Daughter" /></Field>
              <Field label="Contract Manufacturer"><TextInput value={d.cm} onChange={(v) => set('cm', v)} placeholder="ACT Labs" /></Field>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-3">Order</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="PO number"><TextInput value={d.poNumber} onChange={(v) => set('poNumber', v)} placeholder="PO-2026-041" mono /></Field>
              <Field label="Quantity"><NumberInput value={d.qty} onChange={(v) => set('qty', v)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Order value ($)"><NumberInput value={d.value} onChange={(v) => set('value', v)} /></Field>
              <Field label="Progress (%)"><NumberInput value={d.progress} onChange={(v) => set('progress', v)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Status"><SelectInput value={d.status} onChange={(v) => set('status', v)} options={PROD_STATUSES} /></Field>
              <Field label="Priority"><SelectInput value={d.priority} onChange={(v) => set('priority', v)} options={PROD_PRIORITIES} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Requested delivery date"><TextInput value={d.requestedDel} onChange={(v) => set('requestedDel', v)} placeholder="2026-05-12" /></Field>
              <Field label="ETA"><TextInput value={d.eta} onChange={(v) => set('eta', v)} placeholder="2026-05-15" /></Field>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-3">CM notes &amp; comments</h3>
          <Field label="Notes / comments from the CM" hint="Open-order report imports append to this field.">
            <TextArea value={d.cmNotes} onChange={(v) => set('cmNotes', v)} rows={5} placeholder="Latest status notes, delays, or comments from the contract manufacturer…" />
          </Field>
        </div>
      </div>
    </FullPageForm>
  )
}

// ─── Brand Transition form ──────────────────────────────────
export function BrandTransitionFormPage({ form: activeForm }: { form: ActiveForm }) {
  const { isEdit, submitting, saveError, save, closeForm } = useOpsPersist(activeForm)
  const init = (activeForm.context?.initialData ?? {}) as Record<string, any>
  const [d, setD] = useState({
    product: init.product ?? '',
    from: init.from ?? '',
    to: init.to ?? '',
    owner: init.owner ?? '',
    status: init.status ?? '',
    progress: init.progress ?? 0,
    blocker: init.blocker ?? '',
  })
  const set = (k: string, v: any) => setD((p) => ({ ...p, [k]: v }))

  return (
    <FullPageForm
      title={isEdit ? 'Edit Brand Transition' : 'New Brand Transition'}
      subtitle="Operations — Brand Transition"
      onBack={closeForm}
      backLabel="Back to Brand Transition"
      headerExtra={<Repeat2 size={18} className="text-[var(--accent)]" />}
      footer={<FooterBar submitting={submitting} saveError={saveError} onSave={() => save({ ...d, blocker: d.blocker || null }, d.status)} saveLabel={isEdit ? 'Save Changes' : 'Add Transition'} />}
    >
      <div className="space-y-5">
        <Field label="Product"><TextInput value={d.product} onChange={(v) => set('product', v)} placeholder="CD Scalp Detox Shampoo 8oz" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="From"><TextInput value={d.from} onChange={(v) => set('from', v)} placeholder="L'Oreal Legacy" /></Field>
          <Field label="To"><TextInput value={d.to} onChange={(v) => set('to', v)} placeholder="Kareve SKU Master" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Owner"><TextInput value={d.owner} onChange={(v) => set('owner', v)} placeholder="Operations" /></Field>
          <Field label="Status"><TextInput value={d.status} onChange={(v) => set('status', v)} placeholder="Awaiting Artwork" /></Field>
        </div>
        <Field label="Progress (%)"><NumberInput value={d.progress} onChange={(v) => set('progress', v)} /></Field>
        <Field label="Blocker" hint="Leave blank if none."><TextInput value={d.blocker} onChange={(v) => set('blocker', v)} placeholder="e.g. TricorBraun MOQ pending" /></Field>
      </div>
    </FullPageForm>
  )
}
