import { useState, useMemo } from 'react'
import { Boxes, Plus, Trash2, Pencil } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { api } from '@/lib/api'
import { ComponentDetail } from '@/components/rd/components/ComponentDetail'
import { COMPONENT_TYPE_COLORS, FEASIBILITY_STATUS_COLORS, getWorstCompatibility, getBestUnitCost, type Component as RDComponent } from '@/components/rd/components/componentData'
import { AddToCowork } from '@/components/shared/AddToCowork'
import { ViewToggle, type ViewMode } from '@/components/shared/ViewToggle'
import { PushToErpButton } from '@/components/shared/PushToErpButton'

// Legacy feasibility statuses not present in FEASIBILITY_STATUS_COLORS.
const LEGACY_STATUS_COLORS: Record<string, string> = {
  'MOQ Pending': '#F59E0B', // amber — awaiting MOQ
  'Quoted': '#06B6D4', // cyan — quote received
}

// ─── Delete Confirmation Dialog ───────────────────────────
function DeleteConfirmDialog({
  name,
  deleting,
  onConfirm,
  onCancel,
}: {
  name: string
  deleting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-2">Confirm Delete</h3>
        <p className="text-[14px] text-[var(--text-secondary)] mb-5">
          Are you sure you want to delete <strong>"{name}"</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} disabled={deleting} className="btn-ghost px-4 py-2 text-[14px]">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-lg text-[14px] font-medium text-white bg-[var(--danger)] hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Components Tab ───────────────────────────────────────
export function ComponentsTab({
  items,
  moduleId,
  departmentId,
  onRefresh,
}: {
  items: any[]
  moduleId: string | null
  departmentId: string | null
  onRefresh: () => void
}) {
  const openForm = useAppStore((s) => s.openForm)
  const [viewingComponent, setViewingComponent] = useState<any>(null)
  const [view, setView] = useState<ViewMode>('table')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; moduleId: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const components = useMemo(() => {
    return items.map((item: any) => {
      const d = item.data || {}
      // Legacy migrated rows use {component, product, vendor, risk, status};
      // the Component shape uses name/partNumber/type/vendors[]/moqTiers[]/risks[].
      // Normalize legacy keys so existing data renders instead of showing '—'.
      const name = d.name ?? d.component
      const vendors =
        Array.isArray(d.vendors) && d.vendors.length > 0
          ? d.vendors
          : d.vendor
            ? [{ vendorName: d.vendor, vendorStatus: 'Primary' }]
            : []
      const risks =
        Array.isArray(d.risks) && d.risks.length > 0
          ? d.risks
          : d.risk
            ? [{ description: `${d.risk} risk`, severity: d.risk, status: 'Open' }]
            : []
      const productAssignments =
        Array.isArray(d.productAssignments) && d.productAssignments.length > 0
          ? d.productAssignments
          : d.product
            ? [{ productName: d.product, assignmentStatus: 'Active' }]
            : []
      return {
        id: item.id,
        moduleId: item.moduleId,
        ...d,
        name,
        vendors,
        risks,
        productAssignments,
      }
    })
  }, [items])

  // 'MOQ Pending' / 'Quoted' are legacy statuses absent from FEASIBILITY_STATUS_COLORS.
  const statusColorFor = (status: string): string =>
    FEASIBILITY_STATUS_COLORS[status as keyof typeof FEASIBILITY_STATUS_COLORS] ??
    LEGACY_STATUS_COLORS[status] ??
    '#6B7280'

  const openComponentForm = (mode: 'create' | 'edit', comp?: any) => {
    openForm({
      formType: 'component',
      mode,
      recordId: comp?.id ?? null,
      context: {
        moduleId: mode === 'edit' ? comp?.moduleId ?? moduleId : moduleId,
        departmentId,
        initialData: comp ?? null,
      },
    })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/departments/_/modules/${deleteTarget.moduleId}/items/${deleteTarget.id}`)
      setDeleteTarget(null)
      setViewingComponent(null)
      onRefresh()
    } catch (err) {
      console.error('Failed to delete component:', err)
    } finally {
      setDeleting(false)
    }
  }

  const handleComponentUpdate = async (updates: any) => {
    if (!viewingComponent) return
    const item = items.find((i: any) => i.id === viewingComponent.id)
    if (!item) return
    const updated = { ...viewingComponent, ...updates }
    try {
      await api.patch(`/departments/_/modules/${item.moduleId}/items/${viewingComponent.id}`, { data: updated })
      setViewingComponent(updated)
      onRefresh()
    } catch (err) {
      console.error('Failed to update component:', err)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <ViewToggle value={view} onChange={setView} />
        <div className="flex items-center gap-2">
          <PushToErpButton feedKey="components" label="Components" />
          <button onClick={() => openComponentForm('create')} className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]">
            <Plus size={15} /> New Component
          </button>
        </div>
      </div>

      {components.length === 0 ? (
        <div className="text-center py-12">
          <Boxes size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No components yet</p>
          <button onClick={() => openComponentForm('create')} className="btn-primary px-5 py-2.5 rounded-lg text-[14px]">Add Your First Component</button>
        </div>
      ) : view === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Part #</th>
                <th>Type</th>
                <th>Vendor</th>
                <th>Status</th>
                <th>Unit Cost</th>
                <th>Target</th>
                <th>Compatibility</th>
                <th>Assigned</th>
                <th className="w-12">Actions</th>
              </tr>
            </thead>
            <tbody>
              {components.map((comp: RDComponent & { moduleId?: string }) => {
                const typeColor = COMPONENT_TYPE_COLORS[comp.type] || '#6B7280'
                const statusColor = statusColorFor(comp.status)
                const primaryVendor = (comp.vendors || []).find((v: any) => v.vendorStatus === 'Primary') || (comp.vendors || [])[0]
                const bestCost = getBestUnitCost(comp.moqTiers || [])
                const compatibility = getWorstCompatibility(comp.compatibilityTests || [])
                const assignmentCount = (comp.productAssignments || []).filter((a: any) => a.assignmentStatus === 'Active').length
                const costVsTarget = comp.targetCostPerUnit && bestCost ? (bestCost <= comp.targetCostPerUnit ? 'under' : 'over') : null

                return (
                  <tr key={comp.id} className="clickable-row" onClick={() => setViewingComponent(comp)}>
                    <td className="font-medium text-[var(--text-primary)]">{comp.name || '—'}</td>
                    <td><span className="text-[12px] font-mono text-[var(--accent-secondary)]">{comp.partNumber || '—'}</span></td>
                    <td><span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${typeColor}18`, color: typeColor }}>{comp.type || '—'}</span></td>
                    <td className="text-[13px] text-[var(--text-secondary)]">{primaryVendor?.vendorName || '—'}</td>
                    <td><span className="badge text-[11px]" style={{ background: `${statusColor}18`, color: statusColor }}>{comp.status || 'Concept'}</span></td>
                    <td className={`text-[13px] tabular-nums font-medium ${costVsTarget === 'under' ? 'text-[var(--success)]' : costVsTarget === 'over' ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`}>
                      {bestCost ? `$${bestCost.toFixed(2)}` : '—'}
                    </td>
                    <td className="text-[13px] tabular-nums text-[var(--text-secondary)]">
                      {comp.targetCostPerUnit ? `$${Number(comp.targetCostPerUnit).toFixed(2)}` : '—'}
                    </td>
                    <td>
                      {compatibility !== 'not_tested' ? (
                        <span className="text-[11px] font-medium" style={{ color: compatibility === 'pass' ? '#10B981' : compatibility === 'fail' ? '#EF4444' : '#F59E0B' }}>
                          {compatibility === 'pass' ? '✓' : compatibility === 'fail' ? '✗' : '⚠'} {compatibility === 'pass' ? 'Compatible' : compatibility === 'fail' ? 'Incompatible' : 'Conditional'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[var(--text-tertiary)]">○ Not Tested</span>
                      )}
                    </td>
                    <td className="text-[13px] text-[var(--text-secondary)]">{assignmentCount > 0 ? `${assignmentCount} products` : '—'}</td>
                    <td>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <AddToCowork item={{ name: comp.name || 'Untitled Component', type: 'Component', id: comp.id, description: `Component — ${comp.type || '—'}${comp.partNumber ? ` · ${comp.partNumber}` : ''}` }} variant="icon" />
                        <button
                          title="Edit"
                          onClick={() => openComponentForm('edit', comp)}
                          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          title="Delete"
                          onClick={() => setDeleteTarget({ id: comp.id, moduleId: comp.moduleId || moduleId || '', name: comp.name || 'Untitled Component' })}
                          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {components.map((comp: RDComponent & { moduleId?: string }) => {
            const typeColor = COMPONENT_TYPE_COLORS[comp.type] || '#6B7280'
            const statusColor = statusColorFor(comp.status)
            const primaryVendor = (comp.vendors || []).find((v: any) => v.vendorStatus === 'Primary') || (comp.vendors || [])[0]
            const bestCost = getBestUnitCost(comp.moqTiers || [])
            return (
              <div
                key={comp.id}
                className="clickable-row flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                onClick={() => setViewingComponent(comp)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[14px] text-[var(--text-primary)] truncate">{comp.name || '—'}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${typeColor}18`, color: typeColor }}>{comp.type || '—'}</span>
                    <span className="badge text-[11px]" style={{ background: `${statusColor}18`, color: statusColor }}>{comp.status || 'Concept'}</span>
                  </div>
                  <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5 truncate">
                    {comp.partNumber || '—'} · {primaryVendor?.vendorName || 'No vendor'} · {bestCost ? `$${bestCost.toFixed(2)}` : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <AddToCowork item={{ name: comp.name || 'Untitled Component', type: 'Component', id: comp.id, description: `Component — ${comp.type || '—'}${comp.partNumber ? ` · ${comp.partNumber}` : ''}` }} variant="icon" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ComponentDetail
        open={!!viewingComponent}
        component={viewingComponent}
        onClose={() => setViewingComponent(null)}
        onComponentUpdate={handleComponentUpdate}
        onEdit={(comp) => openComponentForm('edit', comp)}
      />

      {deleteTarget && (
        <DeleteConfirmDialog
          name={deleteTarget.name || 'this component'}
          deleting={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
