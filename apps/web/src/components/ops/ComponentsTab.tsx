import { useState, useMemo } from 'react'
import { Boxes, Plus } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { api } from '@/lib/api'
import { ComponentDetail } from '@/components/rd/components/ComponentDetail'
import { COMPONENT_TYPE_COLORS, FEASIBILITY_STATUS_COLORS, getWorstCompatibility, getBestUnitCost, type Component as RDComponent } from '@/components/rd/components/componentData'
import { AddToCowork } from '@/components/shared/AddToCowork'
import { ViewToggle, type ViewMode } from '@/components/shared/ViewToggle'

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

  const components = useMemo(() => {
    return items.map((item: any) => ({ id: item.id, moduleId: item.moduleId, ...item.data }))
  }, [items])

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
        <button onClick={() => openComponentForm('create')} className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]">
          <Plus size={15} /> New Component
        </button>
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
                const statusColor = FEASIBILITY_STATUS_COLORS[comp.status] || '#6B7280'
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
            const statusColor = FEASIBILITY_STATUS_COLORS[comp.status] || '#6B7280'
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

      <ComponentDetail open={!!viewingComponent} component={viewingComponent} onClose={() => setViewingComponent(null)} onComponentUpdate={handleComponentUpdate} />
    </div>
  )
}
