import { useState, useMemo, useEffect } from 'react'
import { Edit3, Eye, Plus, Trash2, Users } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { api } from '@/lib/api'
import { AddToCowork } from '@/components/shared/AddToCowork'
import { StatusBadge, ActionsMenu, DeleteConfirmDialog } from '@/components/shared/TablePrimitives'
import { CMDetailModal } from '@/components/rd/CMDetailModal'

// ─── CM-only helpers ───────────────────────────────────────
export function percentColor(val: number): string {
  if (val >= 90) return 'var(--success)'
  if (val >= 80) return 'var(--warning)'
  return 'var(--danger)'
}

export function productivityScore(d: any): number {
  const q = d.quality || 0
  const ot = d.onTime || 0
  const cu = d.capacityUtilization || 85
  return Math.round(q * 0.5 + ot * 0.3 + cu * 0.2)
}

export function productivityColor(score: number): string {
  if (score >= 85) return 'var(--success)'
  if (score >= 70) return 'var(--warning)'
  return 'var(--danger)'
}

// On-time score from actual production deliveries vs requested PO dates.
// Matches production orders to a CM by name; returns null when no comparable data.
export function computeCMOnTime(cmName: string, productionOrders: any[]): number | null {
  if (!cmName || !productionOrders?.length) return null
  const orders = productionOrders
    .map((o: any) => o?.data || o)
    .filter((o: any) => (o?.cm || '').trim().toLowerCase() === cmName.trim().toLowerCase())
    .filter((o: any) => o?.requestedDel && o?.shipDate)
  if (orders.length === 0) return null
  const onTimeCount = orders.filter(
    (o: any) => new Date(o.shipDate).getTime() <= new Date(o.requestedDel).getTime(),
  ).length
  return Math.round((onTimeCount / orders.length) * 100)
}

// ─── CM Productivity Tab (Expanded) ────────────────────────
export function CMTab({ items, moduleId, departmentId, onRefresh, briefItems = [], productionItems = [], openCmId, onOpenCmHandled }: {
  items: any[]; moduleId: string | null; departmentId: string | null; onRefresh: () => void
  /** Briefs used for cross-links inside the CM detail modal. Optional — callers without R&D briefs (e.g. Finance) can omit. */
  briefItems?: any[]
  /** Production orders used to compute live on-time scores. Optional. */
  productionItems?: any[]
  /** When set, open this CM's profile (used for cross-tab navigation, e.g. from a brief's linked CM). */
  openCmId?: string | null
  /** Called once openCmId has been consumed so the parent can clear it. */
  onOpenCmHandled?: () => void
}) {
  const openForm = useAppStore((s) => s.openForm)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [viewingCM, setViewingCM] = useState<any>(null)
  const [deletingItem, setDeletingItem] = useState<{ id: string; name: string } | null>(null)

  const cmList = useMemo(() =>
    items.map((item: any) => {
      const base = { id: item.id, moduleId: item.moduleId, ...item.data }
      const computedOnTime = computeCMOnTime(base.name, productionItems)
      return computedOnTime != null ? { ...base, onTime: computedOnTime } : base
    })
      .sort((a: any, b: any) => productivityScore(b) - productivityScore(a)),
    [items, productionItems]
  )

  // Cross-tab navigation: open a specific CM's profile when requested
  // (e.g. clicking a brief's linked CM). No-ops safely if the CM no
  // longer exists.
  useEffect(() => {
    if (!openCmId) return
    const target = cmList.find((cm: any) => cm.id === openCmId)
    if (target) setViewingCM(target)
    onOpenCmHandled?.()
  }, [openCmId, cmList, onOpenCmHandled])

  const openCMForm = (mode: 'create' | 'edit', cm?: any) => {
    openForm({
      formType: 'cm',
      mode,
      recordId: cm?.id ?? null,
      context: {
        moduleId: mode === 'edit' ? cm?.moduleId ?? moduleId : moduleId,
        departmentId,
        initialData: cm ?? null,
      },
    })
  }

  const handleDelete = async () => {
    if (!deletingItem) return
    try {
      const item = items.find((i: any) => i.id === deletingItem.id)
      if (item) await api.delete(`/departments/_/modules/${item.moduleId}/items/${deletingItem.id}`)
      setDeletingItem(null); setViewingCM(null); onRefresh()
    } catch (err) { console.error('Failed to delete CM:', err) }
  }

  const handleCMUpdate = async (updatedData: any) => {
    if (!viewingCM) return
    try {
      await api.patch(`/departments/_/modules/${viewingCM.moduleId}/items/${viewingCM.id}`, { data: updatedData })
      setViewingCM({ ...viewingCM, ...updatedData })
      onRefresh()
    } catch (err) { console.error('Failed to update CM:', err) }
  }

  const topProduct = (d: any) => {
    if (!d.products?.length) return '—'
    const sorted = [...d.products].sort((a: any, b: any) => (b.unitsOrdered || 0) - (a.unitsOrdered || 0))
    return sorted[0]?.name || '—'
  }

  const primaryContact = (d: any) => {
    if (!d.contacts?.length) return null
    return d.contacts.find((c: any) => c.type === 'Primary / Project Manager') || d.contacts[0]
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex rounded-[8px] border border-[var(--border-subtle)] overflow-hidden">
          {(['grid', 'list'] as const).map((mode) => (
            <button key={mode} onClick={() => setViewMode(mode)} className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${viewMode === mode ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'}`}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={() => openCMForm('create')} className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]">
          <Plus size={15} /> Add CM
        </button>
      </div>

      {cmList.length === 0 ? (
        <div className="text-center py-12">
          <Users size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No contract manufacturers yet</p>
          <button onClick={() => openCMForm('create')} className="btn-primary px-5 py-2.5 rounded-lg text-[14px]">Add Your First CM</button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cmList.map((cm: any) => {
            const score = productivityScore(cm)
            return (
              <div key={cm.id} className="data-cell space-y-3 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => setViewingCM(cm)}>
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-[14px] text-[var(--text-primary)]">{cm.name}</h3>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={cm.contractStatus || 'Active'} />
                    <div onClick={(e) => e.stopPropagation()}>
                      <AddToCowork item={{ name: cm.name, type: 'CM', id: cm.id, description: `Contract Manufacturer — ${cm.contractStatus || 'Active'}` }} variant="icon" />
                    </div>
                  </div>
                </div>
                <div className="text-[12px] text-[var(--text-secondary)]">{(cm.brands || []).join(', ')}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-[var(--text-tertiary)]">On-Time</p>
                    <p className="text-lg font-semibold tabular-nums" style={{ color: percentColor(cm.onTime || 0) }}>{cm.onTime || 0}%</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[var(--text-tertiary)]">Quality</p>
                    <p className="text-lg font-semibold tabular-nums" style={{ color: percentColor(cm.quality || 0) }}>{cm.quality || 0}%</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] pt-1 border-t border-[var(--border-subtle)]">
                  <span>{cm.activePOs || 0} active POs</span>
                  <span className="font-semibold tabular-nums" style={{ color: productivityColor(score) }}>{score}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>CM Name</th>
                <th>Contact</th>
                <th>Brands</th>
                <th>Active POs</th>
                <th>Quality</th>
                <th>On-Time</th>
                <th>Productivity</th>
                <th>Top Product</th>
                <th className="w-12">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cmList.map((cm: any) => {
                const score = productivityScore(cm)
                const contact = primaryContact(cm)
                return (
                  <tr key={cm.id} className="clickable-row" onClick={() => setViewingCM(cm)}>
                    <td>
                      <div>
                        <span className="font-medium text-[14px] text-[var(--text-primary)]">{cm.name}</span>
                        {cm.address?.city && <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{cm.address.city}, {cm.address.state}</p>}
                      </div>
                    </td>
                    <td>
                      {contact ? (
                        <div>
                          <span className="text-[13px] text-[var(--text-primary)]">{contact.name}</span>
                          {contact.email && <p className="text-[11px] text-[var(--accent)]">{contact.email}</p>}
                        </div>
                      ) : <span className="text-[var(--text-tertiary)]">—</span>}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {(cm.brands || []).map((b: string) => <span key={b} className="badge badge-info text-[10px]">{b}</span>)}
                      </div>
                    </td>
                    <td><span className="text-[14px] font-medium text-[var(--accent)] tabular-nums">{cm.activePOs || 0}</span></td>
                    <td><span className="text-[14px] font-semibold tabular-nums" style={{ color: percentColor(cm.quality || 0) }}>{cm.quality || 0}%</span></td>
                    <td><span className="text-[14px] font-semibold tabular-nums" style={{ color: percentColor(cm.onTime || 0) }}>{cm.onTime || 0}%</span></td>
                    <td><span className="text-[14px] font-bold tabular-nums" style={{ color: productivityColor(score) }}>{score}</span></td>
                    <td className="text-[13px] text-[var(--text-secondary)] max-w-[120px] truncate">{topProduct(cm)}</td>
                    <td>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <AddToCowork item={{ name: cm.name, type: 'CM', id: cm.id, description: `Contract Manufacturer — ${cm.contractStatus || 'Active'}` }} variant="icon" />
                        <ActionsMenu actions={[
                          { label: 'View', icon: Eye, onClick: () => setViewingCM(cm) },
                          { label: 'Edit', icon: Edit3, onClick: () => openCMForm('edit', cm) },
                          { label: 'Delete', icon: Trash2, onClick: () => setDeletingItem({ id: cm.id, name: cm.name }), danger: true },
                        ]} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CMDetailModal open={!!viewingCM} cm={viewingCM} onClose={() => setViewingCM(null)} onEdit={() => { if (viewingCM) { const c = viewingCM; setViewingCM(null); openCMForm('edit', c) } }} onDelete={() => { if (viewingCM) setDeletingItem({ id: viewingCM.id, name: viewingCM.name }) }} onUpdate={handleCMUpdate} briefItems={briefItems} />
      <DeleteConfirmDialog open={!!deletingItem} itemName={deletingItem?.name || ''} onConfirm={handleDelete} onCancel={() => setDeletingItem(null)} />
    </div>
  )
}
