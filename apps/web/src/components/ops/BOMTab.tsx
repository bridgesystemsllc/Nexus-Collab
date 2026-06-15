import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ClipboardList, Plus, MoreHorizontal, Pencil, Copy, FileSpreadsheet, Printer, Archive,
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { bomFromItem, type Bom } from './bom/bomTypes'
import { BOMPreview, BOMPrintStyles } from './bom/BOMPreview'
import { exportBomsXlsx } from './bom/bomExcel'

interface BOMTabProps {
  items: any[]
  moduleId: string | null
  departmentId: string | null
  onRefresh: () => void
  /** Part-master items from the COMPONENTS module, passed to the line picker. */
  components: any[]
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-info',
  active: 'badge-healthy',
  archived: 'badge-critical',
}

// ─── Row actions menu (mirrors rd.tsx ActionsMenu) ─────────
function ActionsMenu({ actions }: { actions: { label: string; icon: React.ElementType; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen(!open) }} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-44 py-1 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-lg">
          {actions.map((a, i) => (
            <div key={i}>
              {a.danger && i > 0 && <div className="my-1 border-t border-[var(--border-subtle)]" />}
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(false); a.onClick() }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] ${a.danger ? 'text-[var(--danger)] hover:bg-[var(--danger-light)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}`}
              >
                <a.icon size={14} /> {a.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Operations → Bill of Materials list view. */
export function BOMTab({ items, moduleId, departmentId, onRefresh, components }: BOMTabProps) {
  const openForm = useAppStore((s) => s.openForm)
  const qc = useQueryClient()
  const componentsModuleId = components?.[0]?.moduleId ?? null

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [printBom, setPrintBom] = useState<Bom | null>(null)

  const boms = useMemo(() => items.map((it) => bomFromItem(it)), [items])

  const openCreate = () =>
    openForm({
      formType: 'bom',
      mode: 'create',
      context: { moduleId, departmentId, components, componentsModuleId },
    })

  const openEdit = (item: any) =>
    openForm({
      formType: 'bom',
      mode: 'edit',
      recordId: item.id,
      context: { moduleId, departmentId, initialData: item.data, components, componentsModuleId },
    })

  const duplicate = async (bom: Bom) => {
    if (!moduleId) return
    const clone: Bom = {
      ...bom,
      productName: `${bom.productName} (Copy)`,
      status: 'draft',
      // A duplicate is a brand-new finished good — reset PLM version to 1.
      version: 1,
    }
    try {
      await api.post(`/departments/_/modules/${moduleId}/items`, { data: clone, status: 'draft' })
      await qc.invalidateQueries({ queryKey: ['department', departmentId] })
      onRefresh()
    } catch (err) {
      console.error('Duplicate failed:', err)
    }
  }

  const archive = async (item: any) => {
    const mid = item.moduleId || moduleId
    if (!mid) return
    try {
      await api.patch(`/departments/_/modules/${mid}/items/${item.id}`, {
        data: { ...item.data, status: 'archived' },
        status: 'archived',
      })
      await qc.invalidateQueries({ queryKey: ['department', departmentId] })
      onRefresh()
    } catch (err) {
      console.error('Archive failed:', err)
    }
  }

  const exportSingle = async (bom: Bom) => {
    try { await exportBomsXlsx([bom]) } catch (err) { console.error('Export failed:', err) }
  }

  const exportSelected = async () => {
    const chosen = boms.filter((b) => selected.has(b.id)).map((b) => b.data)
    if (chosen.length === 0) return
    try { await exportBomsXlsx(chosen) } catch (err) { console.error('Export failed:', err) }
  }

  const print = (bom: Bom) => {
    setPrintBom(bom)
    setTimeout(() => { window.print(); setPrintBom(null) }, 50)
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">Bills of Materials</h2>
          <span className="text-xs text-[var(--text-tertiary)]">{boms.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={exportSelected} className="flex items-center gap-1.5 btn-ghost px-3 py-2 rounded-lg text-[13px]">
              <FileSpreadsheet size={14} /> Export Selected ({selected.size})
            </button>
          )}
          <button onClick={openCreate} className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]">
            <Plus size={15} /> New BOM
          </button>
        </div>
      </div>

      {boms.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardList size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No bills of materials yet</p>
          <button onClick={openCreate} className="btn-primary px-5 py-2.5 rounded-lg text-[14px]">Create Your First BOM</button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th className="w-8"></th>
                <th>FG Part #</th>
                <th>Product Name</th>
                <th>Brand</th>
                <th>Case Qty</th>
                <th>Status</th>
                <th>Launch Priority</th>
                <th className="w-12">Actions</th>
              </tr>
            </thead>
            <tbody>
              {boms.map((b) => {
                const d = b.data
                const badge = STATUS_BADGE[d.status] || 'badge-accent'
                const item = items.find((it) => it.id === b.id)
                return (
                  <tr key={b.id} className="clickable-row" onClick={() => item && openEdit(item)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(b.id)}
                        onChange={() => toggle(b.id)}
                        className="accent-[var(--accent)] cursor-pointer"
                      />
                    </td>
                    <td><span className="text-[12px] font-mono text-[var(--accent-secondary)]">{d.fgPartNumber || '—'}</span></td>
                    <td className="font-medium text-[var(--text-primary)]">{d.productName || '—'}</td>
                    <td className="text-[13px] text-[var(--text-secondary)]">{d.brand || '—'}</td>
                    <td className="tabular-nums text-[var(--text-secondary)]">{d.caseQty ?? '—'}</td>
                    <td><span className={`badge ${badge} capitalize`}>{d.status}</span></td>
                    <td className="tabular-nums text-[var(--text-secondary)]">{d.launchPriority ?? '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <ActionsMenu actions={[
                        { label: 'Edit', icon: Pencil, onClick: () => item && openEdit(item) },
                        { label: 'Duplicate', icon: Copy, onClick: () => duplicate(d) },
                        { label: 'Export XLSX', icon: FileSpreadsheet, onClick: () => exportSingle(d) },
                        { label: 'Print / PDF', icon: Printer, onClick: () => print(d) },
                        { label: 'Archive', icon: Archive, onClick: () => item && archive(item), danger: true },
                      ]} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Print view — portaled + isolated by the BOM print stylesheet. */}
      {printBom &&
        createPortal(
          <div className="bom-print-root" style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 9999, overflow: 'auto', padding: 24 }}>
            <BOMPrintStyles />
            <BOMPreview bom={printBom} />
          </div>,
          document.body,
        )}
    </div>
  )
}
