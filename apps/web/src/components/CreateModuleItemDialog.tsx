import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog } from './Dialog'
import { useCreateModuleItem } from '@/hooks/useData'

interface CreateModuleItemDialogProps {
  open: boolean
  onClose: () => void
  moduleType: string
  moduleId: string
  deptId: string
}

// ─── Shared form input styles ──────────────────────────────
const inputCls =
  'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors'
const labelCls = 'block text-xs font-medium text-[var(--text-tertiary)] mb-1 uppercase tracking-wider'
const selectCls =
  'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors appearance-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  )
}

// ─── BRIEFS form ───────────────────────────────────────────
function BriefsForm({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  const statuses = ['Brief Submitted', 'In Formulation', 'Stability Testing', 'Formula Approved']
  return (
    <div className="space-y-4">
      <Field label="Brief Name">
        <input className={inputCls} placeholder="e.g. Hydra Boost Serum" value={form.name ?? ''} onChange={e => set('name', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Brand">
          <input className={inputCls} placeholder="e.g. Kareve" value={form.brand ?? ''} onChange={e => set('brand', e.target.value)} />
        </Field>
        <Field label="Contract Manufacturer">
          <input className={inputCls} placeholder="e.g. Cosmetic Labs" value={form.cm ?? ''} onChange={e => set('cm', e.target.value)} />
        </Field>
        <Field label="Status">
          <select className={selectCls} value={form.status ?? statuses[0]} onChange={e => set('status', e.target.value)}>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Phase">
          <input className={inputCls} type="number" min={1} max={form.totalPhases ?? 5} placeholder="1" value={form.phase ?? ''} onChange={e => set('phase', parseInt(e.target.value) || 1)} />
        </Field>
        <Field label="Total Phases">
          <input className={inputCls} type="number" min={1} max={20} placeholder="5" value={form.totalPhases ?? ''} onChange={e => set('totalPhases', parseInt(e.target.value) || 5)} />
        </Field>
      </div>
      <Field label="Notes (optional)">
        <textarea className={inputCls} rows={2} placeholder="Any notes..." value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} />
      </Field>
    </div>
  )
}

// ─── CM_PRODUCTIVITY form ──────────────────────────────────
function CMForm({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Manufacturer Name">
        <input className={inputCls} placeholder="e.g. Cosmetic Labs Inc." value={form.name ?? ''} onChange={e => set('name', e.target.value)} />
      </Field>
      <Field label="Brands (comma separated)">
        <input className={inputCls} placeholder="e.g. Kareve, Bliss" value={form.brandsText ?? ''} onChange={e => set('brandsText', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="On-Time Delivery %">
          <input className={inputCls} type="number" min={0} max={100} placeholder="95" value={form.onTime ?? ''} onChange={e => set('onTime', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Quality Score %">
          <input className={inputCls} type="number" min={0} max={100} placeholder="92" value={form.quality ?? ''} onChange={e => set('quality', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Active POs">
          <input className={inputCls} type="number" min={0} placeholder="3" value={form.activePOs ?? ''} onChange={e => set('activePOs', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Open Issues">
          <input className={inputCls} type="number" min={0} placeholder="0" value={form.openIssues ?? ''} onChange={e => set('openIssues', parseInt(e.target.value) || 0)} />
        </Field>
      </div>
      <Field label="Status">
        <select className={selectCls} value={form.status ?? 'ok'} onChange={e => set('status', e.target.value)}>
          <option value="ok">OK</option>
          <option value="attention">Needs Attention</option>
        </select>
      </Field>
    </div>
  )
}

// ─── TECH_TRANSFERS form ───────────────────────────────────
function TransfersForm({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  const statuses = ['Planning', 'In Progress', 'In Review', 'Complete']
  return (
    <div className="space-y-4">
      <Field label="Product Name">
        <input className={inputCls} placeholder="e.g. Glow Toner" value={form.product ?? ''} onChange={e => set('product', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="From (Site)">
          <input className={inputCls} placeholder="e.g. Site A" value={form.from ?? ''} onChange={e => set('from', e.target.value)} />
        </Field>
        <Field label="To (Site)">
          <input className={inputCls} placeholder="e.g. Site B" value={form.to ?? ''} onChange={e => set('to', e.target.value)} />
        </Field>
        <Field label="Status">
          <select className={selectCls} value={form.status ?? statuses[0]} onChange={e => set('status', e.target.value)}>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Target Date">
          <input className={inputCls} type="date" value={form.target ?? ''} onChange={e => set('target', e.target.value)} />
        </Field>
        <Field label="Progress %">
          <input className={inputCls} type="number" min={0} max={100} placeholder="0" value={form.progress ?? ''} onChange={e => set('progress', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Document Count">
          <input className={inputCls} type="number" min={0} placeholder="0" value={form.docs ?? ''} onChange={e => set('docs', parseInt(e.target.value) || 0)} />
        </Field>
      </div>
    </div>
  )
}

// ─── FORMULATIONS form ─────────────────────────────────────
function FormulationsForm({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  const statuses = ['In Formulation', 'In Review', 'Approved', 'Formula Approved']
  const stabilities = ['Testing', 'Pass', 'Pending']
  return (
    <div className="space-y-4">
      <Field label="Product Name">
        <input className={inputCls} placeholder="e.g. Hydra Boost Serum" value={form.product ?? ''} onChange={e => set('product', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Version">
          <input className={inputCls} placeholder="e.g. v1.0" value={form.ver ?? ''} onChange={e => set('ver', e.target.value)} />
        </Field>
        <Field label="Status">
          <select className={selectCls} value={form.status ?? statuses[0]} onChange={e => set('status', e.target.value)}>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Stability">
          <select className={selectCls} value={form.stability ?? stabilities[0]} onChange={e => set('stability', e.target.value)}>
            {stabilities.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Changes / Notes">
        <textarea className={inputCls} rows={3} placeholder="Describe changes in this version..." value={form.changes ?? ''} onChange={e => set('changes', e.target.value)} />
      </Field>
    </div>
  )
}

// ─── SKU_PIPELINE form ─────────────────────────────────────
function SKUForm({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  const statuses = ['New Item Setup', 'In Progress', 'Pending', 'Complete']
  return (
    <div className="space-y-4">
      <Field label="Product Name">
        <input className={inputCls} placeholder="e.g. Glow Serum 30ml" value={form.name ?? ''} onChange={e => set('name', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="SKU Code">
          <input className={inputCls} placeholder="e.g. GS-001" value={form.sku ?? ''} onChange={e => set('sku', e.target.value)} />
        </Field>
        <Field label="UPC Code">
          <input className={inputCls} placeholder="e.g. 012345678901" value={form.upc ?? ''} onChange={e => set('upc', e.target.value)} />
        </Field>
        <Field label="Status">
          <select className={selectCls} value={form.status ?? statuses[0]} onChange={e => set('status', e.target.value)}>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Owner">
          <input className={inputCls} placeholder="e.g. Jane Doe" value={form.owner ?? ''} onChange={e => set('owner', e.target.value)} />
        </Field>
        <Field label="Current Step">
          <input className={inputCls} type="number" min={1} max={form.totalSteps ?? 7} placeholder="1" value={form.step ?? ''} onChange={e => set('step', parseInt(e.target.value) || 1)} />
        </Field>
        <Field label="Total Steps">
          <input className={inputCls} type="number" min={1} max={20} placeholder="7" value={form.totalSteps ?? ''} onChange={e => set('totalSteps', parseInt(e.target.value) || 7)} />
        </Field>
      </div>
      <Field label="Blocker (optional)">
        <input className={inputCls} placeholder="Describe any blocking issue..." value={form.blocker ?? ''} onChange={e => set('blocker', e.target.value)} />
      </Field>
    </div>
  )
}

// ─── INVENTORY_HEALTH form ─────────────────────────────────
function InventoryForm({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  const statuses = ['healthy', 'critical', 'emergency', 'overstock']
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="SKU Code">
          <input className={inputCls} placeholder="e.g. GS-001" value={form.sku ?? ''} onChange={e => set('sku', e.target.value)} />
        </Field>
        <Field label="Product Name">
          <input className={inputCls} placeholder="e.g. Glow Serum" value={form.name ?? ''} onChange={e => set('name', e.target.value)} />
        </Field>
        <Field label="Status">
          <select className={selectCls} value={form.status ?? 'healthy'} onChange={e => set('status', e.target.value)}>
            {statuses.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="On-Hand Units">
          <input className={inputCls} type="number" min={0} placeholder="5000" value={form.onHand ?? ''} onChange={e => set('onHand', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Committed Units">
          <input className={inputCls} type="number" min={0} placeholder="1200" value={form.committed ?? ''} onChange={e => set('committed', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Available Units">
          <input className={inputCls} type="number" min={0} placeholder="3800" value={form.available ?? ''} onChange={e => set('available', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Coverage (months)">
          <input className={inputCls} type="number" min={0} step={0.1} placeholder="3.5" value={form.coverageMonths ?? ''} onChange={e => set('coverageMonths', parseFloat(e.target.value) || 0)} />
        </Field>
      </div>
    </div>
  )
}

// ─── PRODUCTION_TRACKING form ──────────────────────────────
function ProductionForm({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  const statuses = ['Production Scheduled', 'Awaiting Materials', 'In Production', 'QC Review']
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="PO Number">
          <input className={inputCls} placeholder="e.g. PO-2024-001" value={form.poNumber ?? ''} onChange={e => set('poNumber', e.target.value)} />
        </Field>
        <Field label="Product Name">
          <input className={inputCls} placeholder="e.g. Glow Serum" value={form.product ?? ''} onChange={e => set('product', e.target.value)} />
        </Field>
        <Field label="Contract Manufacturer">
          <input className={inputCls} placeholder="e.g. Cosmetic Labs" value={form.cm ?? ''} onChange={e => set('cm', e.target.value)} />
        </Field>
        <Field label="Quantity">
          <input className={inputCls} type="number" min={1} placeholder="10000" value={form.qty ?? ''} onChange={e => set('qty', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Status">
          <select className={selectCls} value={form.status ?? statuses[0]} onChange={e => set('status', e.target.value)}>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Progress %">
          <input className={inputCls} type="number" min={0} max={100} placeholder="0" value={form.progress ?? ''} onChange={e => set('progress', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="ETA Date">
          <input className={inputCls} type="date" value={form.eta ?? ''} onChange={e => set('eta', e.target.value)} />
        </Field>
      </div>
    </div>
  )
}

// ─── Title mapping ─────────────────────────────────────────
const TYPE_TITLE: Record<string, string> = {
  BRIEFS: 'New Brief',
  CM_PRODUCTIVITY: 'New CM Entry',
  TECH_TRANSFERS: 'New Tech Transfer',
  FORMULATIONS: 'New Formulation',
  SKU_PIPELINE: 'New SKU',
  INVENTORY_HEALTH: 'New Inventory Item',
  PRODUCTION_TRACKING: 'New Production Order',
}

// ─── Main Component ────────────────────────────────────────
export function CreateModuleItemDialog({
  open,
  onClose,
  moduleType,
  moduleId,
  deptId,
}: CreateModuleItemDialogProps) {
  const createItem = useCreateModuleItem()
  const [form, setForm] = useState<any>({})

  function set(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }))
  }

  function buildData(): any {
    if (moduleType === 'CM_PRODUCTIVITY') {
      return {
        ...form,
        brands: form.brandsText
          ? form.brandsText.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [],
      }
    }
    return { ...form }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const data = buildData()
    createItem.mutate(
      { deptId, moduleId, data },
      {
        onSuccess: () => {
          setForm({})
          onClose()
        },
      }
    )
  }

  const title = TYPE_TITLE[moduleType] ?? 'New Entry'

  return (
    <Dialog open={open} onClose={onClose} title={title} wide>
      <form onSubmit={handleSubmit} className="space-y-6">
        {moduleType === 'BRIEFS' && <BriefsForm form={form} set={set} />}
        {moduleType === 'CM_PRODUCTIVITY' && <CMForm form={form} set={set} />}
        {moduleType === 'TECH_TRANSFERS' && <TransfersForm form={form} set={set} />}
        {moduleType === 'FORMULATIONS' && <FormulationsForm form={form} set={set} />}
        {moduleType === 'SKU_PIPELINE' && <SKUForm form={form} set={set} />}
        {moduleType === 'INVENTORY_HEALTH' && <InventoryForm form={form} set={set} />}
        {moduleType === 'PRODUCTION_TRACKING' && <ProductionForm form={form} set={set} />}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createItem.isPending}
            className="px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
          >
            {createItem.isPending && <Loader2 size={14} className="animate-spin" />}
            Create
          </button>
        </div>
      </form>
    </Dialog>
  )
}
