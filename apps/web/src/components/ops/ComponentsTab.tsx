import { useState, useMemo, useRef } from 'react'
import { Boxes, Plus, Trash2, Pencil, FileSpreadsheet, Download, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useAppStore } from '@/stores/appStore'
import { api } from '@/lib/api'
import { ComponentDetail } from '@/components/rd/components/ComponentDetail'
import { COMPONENT_TYPE_COLORS, FEASIBILITY_STATUS_COLORS, getWorstCompatibility, getBestUnitCost, type Component as RDComponent } from '@/components/rd/components/componentData'
import { AddToCowork } from '@/components/shared/AddToCowork'
import { ViewToggle, type ViewMode } from '@/components/shared/ViewToggle'
import { PushToErpButton } from '@/components/shared/PushToErpButton'
import { OverlayPortal } from '@/components/shared/OverlayPortal'
import { Dialog } from '@/components/Dialog'
import { brandLabel } from '@/components/ops/brandLabel'

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
    <OverlayPortal>
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
    </OverlayPortal>
  )
}

// ─── Import Dialog ────────────────────────────────────────
function ImportDialog({
  open,
  onClose,
  moduleId,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  moduleId: string | null
  onSuccess: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [filename, setFilename] = useState('')
  const [preview, setPreview] = useState<any[]>([])
  const [results, setResults] = useState<{ created: number; updated: number; errors: string[] } | null>(null)
  const [parsedRows, setParsedRows] = useState<any[]>([])

  const reset = () => {
    setPreview([])
    setError('')
    setFilename('')
    setResults(null)
    setParsedRows([])
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) e.target.value = ''
    if (!file) return
    reset()
    setFilename(file.name)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[]
      if (rows.length === 0) {
        setError('No data rows found in the file.')
        return
      }
      setParsedRows(rows)
      setPreview(rows.slice(0, 5))
    } catch (err: any) {
      setError(err?.message || 'Failed to read file')
    }
  }

  const handleImport = async () => {
    if (parsedRows.length === 0 || !moduleId) return
    setImporting(true)
    setError('')
    try {
      const { data } = await api.post('/ops/components/import', { moduleId, rows: parsedRows })
      setResults(data)
      onSuccess()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/ops/components/import-template', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'Components_Import_Template.xlsx')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err?.message || 'Failed to download template')
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Import Components" subtitle={filename || 'CSV or Excel'} wide>
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--danger-light)] border border-[var(--danger)]">
            <AlertTriangle size={15} className="text-[var(--danger)] mt-0.5 flex-shrink-0" />
            <span className="text-sm text-[var(--danger)]">{error}</span>
          </div>
        )}

        {results ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={20} className="text-[var(--success)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">Import Complete</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[var(--bg-surface)] rounded-lg p-3 text-center">
                <p className="text-2xl font-semibold text-[var(--success)]">{results.created}</p>
                <p className="text-xs text-[var(--text-tertiary)]">Created</p>
              </div>
              <div className="bg-[var(--bg-surface)] rounded-lg p-3 text-center">
                <p className="text-2xl font-semibold text-[var(--info)]">{results.updated}</p>
                <p className="text-xs text-[var(--text-tertiary)]">Updated</p>
              </div>
            </div>
            {results.errors.length > 0 && (
              <div className="text-xs text-[var(--danger)]">
                <p className="font-medium mb-1">Errors ({results.errors.length}):</p>
                {results.errors.slice(0, 5).map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
                {results.errors.length > 5 && <p>...and {results.errors.length - 5} more</p>}
              </div>
            )}
          </div>
        ) : preview.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Preview of first {preview.length} rows.
            </p>
            <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
              <table className="nexus-table text-xs">
                <thead>
                  <tr>
                    {Object.keys(preview[0]).map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => (
                        <td key={j}>{String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Upload a CSV or Excel file with your component data, or download the template to get started.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <Download size={15} />
                Download Template
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFile}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <FileSpreadsheet size={15} />
                Choose File
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
          <button
            onClick={handleClose}
            disabled={importing}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all disabled:opacity-50"
          >
            {results ? 'Done' : 'Cancel'}
          </button>
          {preview.length > 0 && !results && (
            <button
              onClick={handleImport}
              disabled={importing || !moduleId}
              className="flex items-center gap-1.5 btn-primary px-5 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {importing ? 'Importing…' : 'Import All Rows'}
            </button>
          )}
        </div>
      </div>
    </Dialog>
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
  const [showImport, setShowImport] = useState(false)

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
      const brands =
        Array.isArray(d.brands) && d.brands.length > 0
          ? d.brands.map((brand: string) => brandLabel(brand))
          : d.brand
            ? [brandLabel(d.brand)]
            : []
      return {
        id: item.id,
        moduleId: item.moduleId,
        ...d,
        name,
        vendors,
        risks,
        productAssignments,
        brands,
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
          <button
            onClick={async () => {
              try {
                const response = await api.get('/ops/components/import-template', { responseType: 'blob' })
                const url = window.URL.createObjectURL(new Blob([response.data]))
                const link = document.createElement('a')
                link.href = url
                link.setAttribute('download', 'Components_Import_Template.xlsx')
                document.body.appendChild(link)
                link.click()
                link.remove()
                window.URL.revokeObjectURL(url)
              } catch (err) {
                console.error('Failed to download template:', err)
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <Download size={14} />
            Template
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <FileSpreadsheet size={14} />
            Import
          </button>
          <button onClick={() => openComponentForm('create')} className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]">
            <Plus size={15} /> New Component
          </button>
        </div>
      </div>

      {components.length === 0 ? (
        <div className="text-center py-12">
          <Boxes size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No components yet</p>
          <div className="flex items-center justify-center gap-3 mb-3">
            <button
              onClick={async () => {
                try {
                  const response = await api.get('/ops/components/import-template', { responseType: 'blob' })
                  const url = window.URL.createObjectURL(new Blob([response.data]))
                  const link = document.createElement('a')
                  link.href = url
                  link.setAttribute('download', 'Components_Import_Template.xlsx')
                  document.body.appendChild(link)
                  link.click()
                  link.remove()
                  window.URL.revokeObjectURL(url)
                } catch (err) {
                  console.error('Failed to download template:', err)
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[14px] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <Download size={15} />
              Download Template
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[14px] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <FileSpreadsheet size={15} />
              Import
            </button>
          </div>
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
                <th>Brands</th>
                <th>Vendor</th>
                <th>Status</th>
                <th>On Hand</th>
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
                    <td>
                      {(comp.brands || []).length > 0 ? (
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {(comp.brands || []).map((brand) => (
                            <span
                              key={brand}
                              className="rounded-full bg-[var(--accent-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]"
                            >
                              {brand}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">—</span>
                      )}
                    </td>
                    <td className="text-[13px] text-[var(--text-secondary)]">{primaryVendor?.vendorName || '—'}</td>
                    <td><span className="badge text-[11px]" style={{ background: `${statusColor}18`, color: statusColor }}>{comp.status || 'Concept'}</span></td>
                    <td
                      className="text-[13px] tabular-nums text-[var(--text-secondary)]"
                      title={comp.quantityOnHand != null ? `Available: ${Number(comp.quantityAvailable ?? comp.quantityOnHand).toLocaleString()} · Allocated: ${Number(comp.quantityAllocated ?? 0).toLocaleString()}` : undefined}
                    >
                      {comp.quantityOnHand != null ? Number(comp.quantityOnHand).toLocaleString() : '—'}
                    </td>
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
                  {(comp.brands || []).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(comp.brands || []).map((brand) => (
                        <span
                          key={brand}
                          className="rounded-full bg-[var(--accent-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]"
                        >
                          {brand}
                        </span>
                      ))}
                    </div>
                  )}
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

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        moduleId={moduleId}
        onSuccess={onRefresh}
      />
    </div>
  )
}
