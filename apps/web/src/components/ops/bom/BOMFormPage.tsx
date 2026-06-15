import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, FileSpreadsheet, Printer, AlertTriangle } from 'lucide-react'
import { FullPageForm } from '@/components/shared/FullPageForm'
import { useAppStore, type ActiveForm } from '@/stores/appStore'
import { api } from '@/lib/api'
import { emptyBom, emptyLine, bomFromItem, type Bom, type BomLine, type PartType } from './bomTypes'
import { ComponentPicker, type ComponentPickerValue } from './ComponentPicker'
import { SKUPicker, type SKUPickerValue } from './SKUPicker'
import { BOMPreview, BOMPrintStyles } from './BOMPreview'
import { exportBomsXlsx } from './bomExcel'

interface BOMFormContext {
  moduleId?: string | null
  departmentId?: string | null
  /** Initial item.data for the edit flow (or the full ModuleItem). */
  initialData?: any
  /** Part-master items from the COMPONENTS module, for the line picker. */
  components?: any[]
  /** COMPONENTS module id, for inline part creation. */
  componentsModuleId?: string | null
  /** SKU_PIPELINE items, for the finished-good SKU picker. */
  skuItems?: any[]
}

// ─── Small field primitives ───────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors'

function Text({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
}

function NumberField({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      placeholder={placeholder}
      className={inputCls}
    />
  )
}

/**
 * Full-page guided BOM builder. Registered under the `bom` form type.
 * Left column = inputs; right column = a live <BOMPreview> that mirrors the
 * XLSX document. Persists the header + reindexed lines as a ModuleItem.
 */
export function BOMFormPage({ form: activeForm }: { form: ActiveForm }) {
  const closeForm = useAppStore((s) => s.closeForm)
  const qc = useQueryClient()

  const ctx = (activeForm.context ?? {}) as BOMFormContext
  const isEdit = activeForm.mode === 'edit'

  const [form, setForm] = useState<Bom>(() => {
    if (isEdit && ctx.initialData) {
      // initialData may be the raw ModuleItem (with .data) or just the data blob.
      const wrapped = ctx.initialData?.data ? ctx.initialData : { data: ctx.initialData }
      return bomFromItem(wrapped).data
    }
    return emptyBom()
  })

  const [components, setComponents] = useState<any[]>(ctx.components ?? [])
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [printing, setPrinting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const set = <K extends keyof Bom>(key: K, value: Bom[K]) => setForm((f) => ({ ...f, [key]: value }))

  // Finished-good SKU picker → maps onto fgPartNumber / productName / brand.
  const skuItems = ctx.skuItems ?? []
  const onPickSku = (v: SKUPickerValue) =>
    setForm((f) => ({ ...f, fgPartNumber: v.sku, productName: v.productName, brand: v.brand }))

  // ─── line operations ───
  const reindex = (lines: BomLine[]) => lines.map((l, i) => ({ ...l, lineNo: i + 1 }))

  const updateLine = (idx: number, patch: Partial<BomLine>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }))

  const onPickerChange = (idx: number, v: ComponentPickerValue) =>
    updateLine(idx, {
      componentId: v.componentId,
      partNumber: v.partNumber,
      description: v.description,
      supplier: v.supplier,
      partType: (v.partType as PartType) || form.lines[idx]?.partType || 'other',
    })

  const addLine = () =>
    setForm((f) => ({ ...f, lines: reindex([...f.lines, emptyLine(f.lines.length + 1, 'other', '')]) }))

  const removeLine = (idx: number) =>
    setForm((f) => ({ ...f, lines: reindex(f.lines.filter((_, i) => i !== idx)) }))

  const moveLine = (idx: number, dir: -1 | 1) =>
    setForm((f) => {
      const next = [...f.lines]
      const target = idx + dir
      if (target < 0 || target >= next.length) return f
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...f, lines: reindex(next) }
    })

  // ─── validation (warn only) ───
  const warnings = useMemo(() => {
    const w: string[] = []
    if (form.lines[0] && form.lines[0].partType !== 'bulk') {
      w.push('Line 1 is usually the bulk fill (partType "bulk").')
    }
    form.lines.forEach((l, i) => {
      if (l.partNumber && !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(l.partNumber)) {
        w.push(`Line ${i + 1}: part number "${l.partNumber}" looks unusual.`)
      }
    })
    return w
  }, [form.lines])

  // ─── persist ───
  const persist = async () => {
    if (!ctx.moduleId) {
      setSaveError('Missing module — cannot save BOM')
      return
    }
    setSubmitting(true)
    setSaveError('')
    try {
      const data: Bom = { ...form, lines: form.lines.map((l, i) => ({ ...l, lineNo: i + 1 })) }
      const status = data.status || 'draft'
      if (isEdit && activeForm.recordId) {
        await api.patch(`/departments/_/modules/${ctx.moduleId}/items/${activeForm.recordId}`, { data, status })
      } else {
        await api.post(`/departments/_/modules/${ctx.moduleId}/items`, { data, status })
      }
      if (ctx.departmentId) {
        await qc.invalidateQueries({ queryKey: ['department', ctx.departmentId] })
      }
      closeForm()
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || err?.message || 'Failed to save BOM')
    } finally {
      setSubmitting(false)
    }
  }

  const refetchComponents = async () => {
    if (!ctx.departmentId) return
    await qc.invalidateQueries({ queryKey: ['department', ctx.departmentId] })
    // Pull a fresh COMPONENTS list so the just-created part appears in pickers.
    try {
      const res = await api.get(`/departments/${ctx.departmentId}`)
      const mod = (res?.data?.modules || []).find((m: any) => m.type === 'COMPONENTS')
      if (mod) setComponents(mod.items || [])
    } catch {
      /* non-fatal — picker still works with prior list */
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportBomsXlsx([form])
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const handlePrint = () => {
    setPrinting(true)
    // Let the print container mount before invoking the browser print dialog.
    setTimeout(() => {
      window.print()
      setPrinting(false)
    }, 50)
  }

  const headerExtra = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="flex items-center gap-1.5 btn-ghost px-3 py-2 rounded-lg text-[13px] disabled:opacity-50"
      >
        {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Export XLSX
      </button>
      <button
        type="button"
        onClick={handlePrint}
        className="flex items-center gap-1.5 btn-ghost px-3 py-2 rounded-lg text-[13px]"
      >
        <Printer size={14} /> Print / PDF
      </button>
    </div>
  )

  const footer = (
    <>
      <button onClick={closeForm} className="btn-ghost px-4 py-2.5 rounded-lg text-[14px]">
        Cancel
      </button>
      <div className="flex items-center gap-3">
        {saveError && <span className="text-[12px] text-[var(--danger)]">{saveError}</span>}
        <button
          onClick={persist}
          disabled={submitting}
          className="flex items-center gap-1.5 btn-primary px-5 py-2.5 rounded-lg text-[14px] disabled:opacity-50"
        >
          {submitting ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : isEdit ? 'Save Changes' : 'Create BOM'}
        </button>
      </div>
    </>
  )

  return (
    <>
      <FullPageForm
        title={isEdit ? 'Edit Bill of Materials' : 'New Bill of Materials'}
        subtitle={form.productName || form.fgPartNumber || 'Finished good + components'}
        onBack={closeForm}
        backLabel="Back to BOMs"
        headerExtra={headerExtra}
        footer={footer}
        maxWidth="100%"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-[1400px] mx-auto">
          {/* LEFT — inputs */}
          <div className="space-y-8">
            {/* A. Finished good */}
            <section className="space-y-4">
              <h2 className="text-[14px] font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">
                A. Finished Good
              </h2>
              <Field label="Finished Good SKU">
                <SKUPicker
                  value={{ sku: form.fgPartNumber, productName: form.productName, brand: form.brand }}
                  onChange={onPickSku}
                  skuItems={skuItems}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Fill Claim"><Text value={form.fillClaim} onChange={(v) => set('fillClaim', v)} placeholder="2.0 fl oz" /></Field>
                <Field label="Min Fill"><Text value={form.minFill} onChange={(v) => set('minFill', v)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Filler Supplier"><Text value={form.fillerSupplier} onChange={(v) => set('fillerSupplier', v)} placeholder="ACT" /></Field>
                <Field label="Filler Name (printed bold/blue)"><Text value={form.fillerName} onChange={(v) => set('fillerName', v)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Case Qty"><NumberField value={form.caseQty} onChange={(v) => set('caseQty', v)} placeholder="12" /></Field>
                <Field label="Inner Pack"><Text value={form.innerPack} onChange={(v) => set('innerPack', v)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Over/Under Tolerance"><Text value={form.overUnderTolerance} onChange={(v) => set('overUnderTolerance', v)} /></Field>
                <Field label="Launch Priority"><NumberField value={form.launchPriority} onChange={(v) => set('launchPriority', v)} placeholder="1" /></Field>
              </div>
            </section>

            {/* B. Components */}
            <section className="space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">B. Components</h2>
                <button onClick={addLine} className="flex items-center gap-1.5 btn-ghost px-3 py-1.5 rounded-lg text-[13px]">
                  <Plus size={14} /> Add component
                </button>
              </div>

              {warnings.length > 0 && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[var(--warning-light)] border border-[var(--warning)]">
                  <AlertTriangle size={14} className="text-[var(--warning)] mt-0.5 shrink-0" />
                  <ul className="text-[12px] text-[var(--text-secondary)] space-y-0.5">
                    {warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                {form.lines.map((line, idx) => (
                  <div key={idx} className="rounded-xl border border-[var(--border-subtle)] p-3 space-y-2.5 bg-[var(--bg-surface)]">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-mono text-[var(--text-tertiary)] w-6 shrink-0">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <ComponentPicker
                          value={{
                            componentId: line.componentId,
                            partNumber: line.partNumber,
                            description: line.description,
                            supplier: line.supplier,
                            partType: line.partType,
                          }}
                          onChange={(v) => onPickerChange(idx, v)}
                          components={components}
                          moduleId={ctx.componentsModuleId ?? null}
                          departmentId={ctx.departmentId ?? null}
                          onComponentCreated={refetchComponents}
                        />
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => moveLine(idx, -1)} disabled={idx === 0} title="Move up"
                          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 transition-colors">
                          <ArrowUp size={14} />
                        </button>
                        <button onClick={() => moveLine(idx, 1)} disabled={idx === form.lines.length - 1} title="Move down"
                          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 transition-colors">
                          <ArrowDown size={14} />
                        </button>
                        <button onClick={() => removeLine(idx)} title="Remove"
                          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--bg-hover)] transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_70px_1fr] gap-2 pl-8">
                      <input
                        value={line.description}
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                        placeholder="Item description (printed)"
                        className="px-2.5 py-1.5 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
                      />
                      <input
                        value={line.um}
                        onChange={(e) => updateLine(idx, { um: e.target.value })}
                        placeholder="UM"
                        title="Unit/qty — accepts a number or '-'"
                        className="px-2.5 py-1.5 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg text-[12px] text-center text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      />
                      <input
                        value={line.supplier}
                        onChange={(e) => updateLine(idx, { supplier: e.target.value })}
                        placeholder="Supplier"
                        className="px-2.5 py-1.5 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* C. Footer recap */}
            <section className="space-y-3">
              <h2 className="text-[14px] font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">
                C. Footer Summary
              </h2>
              <div className="grid grid-cols-2 gap-4 text-[13px]">
                <div className="data-cell py-3">
                  <p className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Over/Under Tolerance</p>
                  <p className="text-[var(--text-primary)] mt-1">{form.overUnderTolerance || '—'}</p>
                </div>
                <div className="data-cell py-3">
                  <p className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Launch Priority</p>
                  <p className="text-[var(--text-primary)] mt-1 tabular-nums">{form.launchPriority ?? '—'}</p>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT — live preview */}
          <div className="lg:sticky lg:top-0 lg:self-start">
            <p className="text-[12px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-2">Live preview</p>
            <BOMPreview bom={form} />
          </div>
        </div>
      </FullPageForm>

      {/* Print view — portaled to body so the print stylesheet isolates it cleanly. */}
      {printing &&
        createPortal(
          <div className="bom-print-root" style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 9999, overflow: 'auto', padding: 24 }}>
            <BOMPrintStyles />
            <BOMPreview bom={form} />
          </div>,
          document.body,
        )}
    </>
  )
}
