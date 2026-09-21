import { useState, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Hash,
  Plus,
  Pencil,
  Link2,
  FileSpreadsheet,
  Loader2,
  X,
  CheckCircle2,
  AlertTriangle,
  Search,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { api, getApiErrorMessage } from '@/lib/api'
import { Dialog } from '@/components/Dialog'
import { ViewToggle, type ViewMode } from '@/components/shared/ViewToggle'
import { brandLabel } from '@/components/ops/brandLabel'

// ─── Types ─────────────────────────────────────────────────
interface PartNumber {
  id: string
  partsNumber: number
  brand?: string
  itemDescription?: string
  itemNumber?: string
  itemType?: string
  componentId?: string
  createdAt: string
  updatedAt: string
}

interface PartNumbersTabProps {
  departmentId: string | null
  onRefresh: () => void
  components: any[]
}

// ─── Part Number Form Dialog ───────────────────────────────
function PartNumberFormDialog({
  open,
  onClose,
  partNumber,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  partNumber?: PartNumber | null
  onSuccess: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    brand: partNumber?.brand || '',
    itemDescription: partNumber?.itemDescription || '',
    itemNumber: partNumber?.itemNumber || '',
    itemType: partNumber?.itemType || '',
  })

  const isEdit = !!partNumber

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await api.patch(`/ops/part-numbers/${partNumber.id}`, form)
      } else {
        await api.post('/ops/part-numbers', form)
      }
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to save'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Part Number' : 'New Part Number'}
      subtitle={isEdit ? `#${partNumber.partsNumber}` : 'A new number will be allocated automatically'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--danger-light)] border border-[var(--danger)]">
            <AlertTriangle size={15} className="text-[var(--danger)] mt-0.5 flex-shrink-0" />
            <span className="text-sm text-[var(--danger)]">{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Brand</label>
          <input
            type="text"
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
            className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            placeholder="e.g., Carol's Daughter"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Item Description</label>
          <input
            type="text"
            value={form.itemDescription}
            onChange={(e) => setForm({ ...form, itemDescription: e.target.value })}
            className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            placeholder="e.g., 8oz PET Cylinder Bottle"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Item Number</label>
            <input
              type="text"
              value={form.itemNumber}
              onChange={(e) => setForm({ ...form, itemNumber: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="e.g., CD-101007"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Item Type</label>
            <input
              type="text"
              value={form.itemType}
              onChange={(e) => setForm({ ...form, itemType: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="e.g., bottle, cap, label"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 btn-primary px-5 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Part Number'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// ─── Link Component Dialog ─────────────────────────────────
function LinkComponentDialog({
  open,
  onClose,
  partNumber,
  components,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  partNumber: PartNumber | null
  components: any[]
  onSuccess: () => void
}) {
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState('')
  const [selectedComponentId, setSelectedComponentId] = useState<string>('')
  const [search, setSearch] = useState('')

  const filteredComponents = useMemo(() => {
    if (!search) return components
    const q = search.toLowerCase()
    return components.filter((c: any) => {
      const d = c.data || {}
      return (
        d.name?.toLowerCase().includes(q) ||
        d.partNumber?.toLowerCase().includes(q) ||
        d.type?.toLowerCase().includes(q)
      )
    })
  }, [components, search])

  const handleLinkExisting = async () => {
    if (!selectedComponentId || !partNumber) return
    setLinking(true)
    setError('')
    try {
      await api.post(`/ops/part-numbers/${partNumber.id}/link-component`, {
        componentId: selectedComponentId,
      })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to link'))
    } finally {
      setLinking(false)
    }
  }

  const handleCreateNew = async () => {
    if (!partNumber) return
    setLinking(true)
    setError('')
    try {
      await api.post(`/ops/part-numbers/${partNumber.id}/link-component`, {
        create: true,
      })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to create component'))
    } finally {
      setLinking(false)
    }
  }

  if (!partNumber) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Link Component"
      subtitle={`Part #${partNumber.partsNumber}`}
      wide
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--danger-light)] border border-[var(--danger)]">
            <AlertTriangle size={15} className="text-[var(--danger)] mt-0.5 flex-shrink-0" />
            <span className="text-sm text-[var(--danger)]">{error}</span>
          </div>
        )}

        <div>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Link this part number to an existing component, or create a new component from this part.
          </p>
        </div>

        <div className="border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-medium text-[var(--text-primary)]">Create New Component</h4>
          <p className="text-xs text-[var(--text-tertiary)]">
            Creates a component with name "{partNumber.itemDescription || `Part ${partNumber.partsNumber}`}"
            and part number "{partNumber.partsNumber}"
          </p>
          <button
            onClick={handleCreateNew}
            disabled={linking}
            className="flex items-center gap-1.5 btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {linking ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
            Create Component
          </button>
        </div>

        <div className="text-center text-xs text-[var(--text-tertiary)] font-medium">— OR —</div>

        <div className="border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-medium text-[var(--text-primary)]">Link Existing Component</h4>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search components..."
              className="w-full pl-8 pr-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredComponents.length === 0 ? (
              <p className="text-xs text-[var(--text-tertiary)] py-2 text-center">No components found</p>
            ) : (
              filteredComponents.map((c: any) => {
                const d = c.data || {}
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${
                      selectedComponentId === c.id
                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                        : 'border-transparent hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="component"
                      value={c.id}
                      checked={selectedComponentId === c.id}
                      onChange={() => setSelectedComponentId(c.id)}
                      className="accent-[var(--accent)]"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{d.name || 'Untitled'}</span>
                      {d.partNumber && (
                        <span className="ml-2 text-xs font-mono text-[var(--text-tertiary)]">{d.partNumber}</span>
                      )}
                    </div>
                  </label>
                )
              })
            )}
          </div>
          <button
            onClick={handleLinkExisting}
            disabled={linking || !selectedComponentId}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-all"
          >
            {linking ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={15} />}
            Link Selected
          </button>
        </div>

        <div className="flex items-center justify-end pt-3 border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            disabled={linking}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </Dialog>
  )
}

// ─── CSV Import Dialog ─────────────────────────────────────
function ImportDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [filename, setFilename] = useState('')
  const [preview, setPreview] = useState<any[]>([])
  const [results, setResults] = useState<{ created: number; updated: number; errors: string[] } | null>(null)

  const reset = () => {
    setPreview([])
    setError('')
    setFilename('')
    setResults(null)
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
      setPreview(rows.slice(0, 5))
    } catch (err: any) {
      setError(err?.message || 'Failed to read file')
    }
  }

  const handleImport = async () => {
    if (preview.length === 0) return
    setImporting(true)
    setError('')
    try {
      const buf = await (fileRef.current?.files?.[0] as File | undefined)?.arrayBuffer()
      if (!buf) {
        const wb = XLSX.read(await fetch(URL.createObjectURL(fileRef.current?.files?.[0]!)).then((r) => r.arrayBuffer()), { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[]
        const { data } = await api.post('/ops/part-numbers/import', { rows })
        setResults(data)
      } else {
        const wb = XLSX.read(buf, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[]
        const { data } = await api.post('/ops/part-numbers/import', { rows })
        setResults(data)
      }
      onSuccess()
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Import failed'))
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Import Part Numbers" subtitle={filename || 'CSV or Excel'} wide>
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
              Preview of first {preview.length} rows. Expected columns: Brand, Item Description, Item Number, Item Type, Parts Number.
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
              Upload a CSV or Excel file with columns: Brand, Item Description, Item Number, Item Type, Parts Number
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFile}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 mx-auto px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <FileSpreadsheet size={15} />
              Choose File
            </button>
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
              disabled={importing}
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

// ─── Main Tab Component ────────────────────────────────────
export function PartNumbersTab({ departmentId, onRefresh, components }: PartNumbersTabProps) {
  const qc = useQueryClient()
  const [view, setView] = useState<ViewMode>('table')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingPartNumber, setEditingPartNumber] = useState<PartNumber | null>(null)
  const [linkingPartNumber, setLinkingPartNumber] = useState<PartNumber | null>(null)
  const [showImport, setShowImport] = useState(false)

  const { data: partNumbers = [], isLoading, refetch } = useQuery({
    queryKey: ['partNumbers'],
    queryFn: async () => {
      const res = await api.get('/ops/part-numbers')
      return res.data as PartNumber[]
    },
  })

  const handleRefresh = () => {
    refetch()
    onRefresh()
  }

  const q = search.toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return partNumbers
    return partNumbers.filter((p) =>
      String(p.partsNumber).includes(q) ||
      p.brand?.toLowerCase().includes(q) ||
      p.itemDescription?.toLowerCase().includes(q) ||
      p.itemNumber?.toLowerCase().includes(q) ||
      p.itemType?.toLowerCase().includes(q)
    )
  }, [partNumbers, q])

  const getComponentName = (componentId: string | undefined) => {
    if (!componentId) return null
    const comp = components.find((c: any) => c.id === componentId)
    return comp?.data?.name || comp?.data?.partNumber || 'Linked'
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">Part Numbers</h2>
          <span className="text-xs text-[var(--text-tertiary)]">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="Search..."
            />
          </div>
          <ViewToggle value={view} onChange={setView} />
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <FileSpreadsheet size={15} />
            Import
          </button>
          <button
            onClick={() => {
              setEditingPartNumber(null)
              setShowForm(true)
            }}
            className="flex items-center gap-1.5 btn-primary px-4 py-2 rounded-lg text-sm"
          >
            <Plus size={15} />
            New Part Number
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-[var(--text-tertiary)]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Hash size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-sm text-[var(--text-tertiary)] mb-4">
            {search ? 'No part numbers match your search' : 'No part numbers yet'}
          </p>
          {!search && (
            <button
              onClick={() => {
                setEditingPartNumber(null)
                setShowForm(true)
              }}
              className="btn-primary px-5 py-2.5 rounded-lg text-sm"
            >
              Add Your First Part Number
            </button>
          )}
        </div>
      ) : view === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Parts Number</th>
                <th>Brand</th>
                <th>Item Description</th>
                <th>Item Number</th>
                <th>Item Type</th>
                <th>Component</th>
                <th className="w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="clickable-row">
                  <td className="font-mono text-xs text-[var(--accent)]">{p.partsNumber}</td>
                  <td>
                    {p.brand ? (
                      <span className="badge badge-accent whitespace-nowrap">{brandLabel(p.brand)}</span>
                    ) : (
                      <span className="text-[var(--text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="font-medium text-[var(--text-primary)]">{p.itemDescription || '—'}</td>
                  <td className="font-mono text-xs text-[var(--text-secondary)]">{p.itemNumber || '—'}</td>
                  <td className="text-[var(--text-secondary)]">{p.itemType || '—'}</td>
                  <td>
                    {p.componentId ? (
                      <span className="text-xs text-[var(--success)]">{getComponentName(p.componentId)}</span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setLinkingPartNumber(p)
                        }}
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        Link
                      </button>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        title="Edit"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingPartNumber(p)
                          setShowForm(true)
                        }}
                        className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        title="Link Component"
                        onClick={(e) => {
                          e.stopPropagation()
                          setLinkingPartNumber(p)
                        }}
                        className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        <Link2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-[var(--accent)]">#{p.partsNumber}</span>
                  {p.brand && <span className="badge badge-accent text-xs">{brandLabel(p.brand)}</span>}
                </div>
                <p className="text-sm text-[var(--text-primary)] truncate mt-0.5">
                  {p.itemDescription || 'No description'}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {p.itemNumber || '—'} · {p.itemType || '—'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  title="Edit"
                  onClick={() => {
                    setEditingPartNumber(p)
                    setShowForm(true)
                  }}
                  className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  title="Link Component"
                  onClick={() => setLinkingPartNumber(p)}
                  className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <Link2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PartNumberFormDialog
        open={showForm}
        onClose={() => {
          setShowForm(false)
          setEditingPartNumber(null)
        }}
        partNumber={editingPartNumber}
        onSuccess={handleRefresh}
      />

      <LinkComponentDialog
        open={!!linkingPartNumber}
        onClose={() => setLinkingPartNumber(null)}
        partNumber={linkingPartNumber}
        components={components}
        onSuccess={handleRefresh}
      />

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={handleRefresh}
      />
    </div>
  )
}
