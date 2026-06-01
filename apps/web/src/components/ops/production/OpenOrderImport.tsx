import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { api } from '@/lib/api'
import { Dialog } from '@/components/Dialog'

interface OpenOrderImportProps {
  items: any[]
  moduleId: string | null
  departmentId: string | null
}

interface ProposedUpdate {
  id: string
  poNumber?: string
  status?: string
  eta?: string
  cmNotes?: string
  confidence?: number
  apply: boolean
}

export function OpenOrderImport({ items, moduleId, departmentId }: OpenOrderImportProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [filename, setFilename] = useState('')
  const [unmatched, setUnmatched] = useState<string[]>([])
  const [updates, setUpdates] = useState<ProposedUpdate[]>([])

  const reset = () => {
    setUpdates([])
    setUnmatched([])
    setError('')
    setFilename('')
  }

  const pickFile = () => fileRef.current?.click()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) e.target.value = ''
    if (!file) return
    reset()
    setFilename(file.name)
    setParsing(true)
    setOpen(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[]
      if (rows.length === 0) {
        throw new Error('No data rows found in the spreadsheet.')
      }

      const orders = items.map((it: any) => ({
        id: it.id,
        poNumber: it.data?.poNumber,
        product: it.data?.product,
        sku: it.data?.sku,
        cm: it.data?.cm,
        status: it.data?.status,
        eta: it.data?.eta,
      }))

      const { data } = await api.post('/ai/parse-open-order', { rows, orders, filename: file.name })
      const proposed: ProposedUpdate[] = (data.updates || []).map((u: any) => ({ ...u, apply: true }))
      setUpdates(proposed)
      setUnmatched(data.unmatched || [])
      if (proposed.length === 0) {
        setError('No matching purchase orders were found in this report.')
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to parse the report.')
    } finally {
      setParsing(false)
    }
  }

  const applyUpdates = async () => {
    if (!moduleId) {
      setError('Missing module — cannot apply updates.')
      return
    }
    const toApply = updates.filter((u) => u.apply)
    if (toApply.length === 0) return
    setApplying(true)
    setError('')
    try {
      for (const u of toApply) {
        const item = items.find((it: any) => it.id === u.id)
        if (!item) continue
        const existing = item.data?.cmNotes ? `${item.data.cmNotes}\n` : ''
        const newData = {
          ...item.data,
          ...(u.status ? { status: u.status } : {}),
          ...(u.eta ? { eta: u.eta } : {}),
          ...(u.cmNotes ? { cmNotes: `${existing}[${filename}] ${u.cmNotes}` } : {}),
        }
        const body: any = { data: newData }
        if (u.status) body.status = u.status
        await api.patch(`/departments/_/modules/${moduleId}/items/${u.id}`, body)
      }
      if (departmentId) {
        await qc.invalidateQueries({ queryKey: ['department', departmentId] })
      }
      setOpen(false)
      reset()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to apply updates.')
    } finally {
      setApplying(false)
    }
  }

  const toggle = (id: string) => setUpdates((prev) => prev.map((u) => (u.id === id ? { ...u, apply: !u.apply } : u)))
  const applyCount = updates.filter((u) => u.apply).length

  return (
    <>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
      <button
        onClick={pickFile}
        className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors w-fit"
      >
        <FileSpreadsheet size={15} />
        Import open-order report
      </button>

      <Dialog open={open} onClose={() => !applying && setOpen(false)} title="Open-Order Report Import" subtitle={filename} wide>
        {parsing ? (
          <div className="flex items-center gap-3 py-10 justify-center text-[var(--text-secondary)]">
            <Loader2 size={18} className="animate-spin" />
            Nexus AI is reading the report and matching POs…
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--danger-light)] border border-[var(--danger)]">
                <AlertTriangle size={15} className="text-[var(--danger)] mt-0.5 flex-shrink-0" />
                <span className="text-sm text-[var(--danger)]">{error}</span>
              </div>
            )}

            {updates.length > 0 && (
              <>
                <p className="text-sm text-[var(--text-secondary)]">
                  Nexus AI matched <strong className="text-[var(--text-primary)]">{updates.length}</strong> order(s). Review the proposed
                  changes and apply.
                </p>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {updates.map((u) => {
                    const item = items.find((it: any) => it.id === u.id)
                    return (
                      <label
                        key={u.id}
                        className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] cursor-pointer"
                      >
                        <input type="checkbox" checked={u.apply} onChange={() => toggle(u.id)} className="mt-1" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-[var(--accent)]">{u.poNumber || item?.data?.poNumber}</span>
                            <span className="text-sm font-medium text-[var(--text-primary)]">{item?.data?.product}</span>
                            {typeof u.confidence === 'number' && (
                              <span className="text-[11px] text-[var(--text-tertiary)]">{Math.round(u.confidence * 100)}% match</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                            {u.status && (
                              <span>
                                Status: <s className="text-[var(--text-tertiary)]">{item?.data?.status}</s> → <strong className="text-[var(--text-primary)]">{u.status}</strong>
                              </span>
                            )}
                            {u.eta && (
                              <span>
                                ETA: <s className="text-[var(--text-tertiary)]">{item?.data?.eta}</s> → <strong className="text-[var(--text-primary)]">{u.eta}</strong>
                              </span>
                            )}
                          </div>
                          {u.cmNotes && <p className="text-xs text-[var(--text-tertiary)] italic">“{u.cmNotes}”</p>}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </>
            )}

            {unmatched.length > 0 && (
              <div className="text-xs text-[var(--text-tertiary)]">
                <span className="font-medium">Unmatched rows:</span> {unmatched.join(', ')}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setOpen(false)}
                disabled={applying}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all disabled:opacity-50"
              >
                <X size={14} /> Close
              </button>
              {updates.length > 0 && (
                <button
                  onClick={applyUpdates}
                  disabled={applying || applyCount === 0}
                  className="flex items-center gap-1.5 btn-primary px-5 py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  {applying ? <><Loader2 size={14} className="animate-spin" /> Applying…</> : <><CheckCircle2 size={15} /> Apply {applyCount} update{applyCount === 1 ? '' : 's'}</>}
                </button>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </>
  )
}
