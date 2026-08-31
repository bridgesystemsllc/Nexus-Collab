// ─── Purchase Order Tracking ────────────────────────────────
// The tab, and the Open Order Report inside it. Everything the grid shows is a
// server round trip: filters, sort, page and the summary all go to the API as
// parameters, so the screen behaves the same on the fiftieth import as the
// first.

import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, Download, Loader2, Rows3, Upload, X } from 'lucide-react'
import { useOorLines, useOorMutations, type OorFilters } from './oor/useOorQueries'
import { COLUMN_SETS, type ReportView } from './oor/oorColumns'
import { OorGrid } from './oor/OorGrid'
import { OorStatCards, type StatKey } from './oor/OorStatCards'
import { OorModal } from './oor/OorModal'
import { useExpansionState } from './oor/ShortageTree'
import { api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import { OverlayPortal } from '@/components/shared/OverlayPortal'

interface Brand {
  id: string
  name: string
}

const VIEWS: { key: ReportView; label: string }[] = [
  { key: 'customer_open_order', label: 'Customer Open Orders' },
  { key: 'open_order_shortage', label: 'Shortage Report' },
]

const STAT_FILTERS: Record<StatKey, Partial<OorFilters>> = {
  open: {},
  value: {},
  short: { status: ['SHORT_MATERIAL', 'AWAITING_COMPONENT', 'AWAITING_ARTWORK'] },
  critical: { risk: ['critical'] },
  awaiting: { status: ['AWAITING_CUSTOMER_APPROVAL'] },
}

/** Brands come from the report's own scoped endpoint — the Brand table is not
 *  exposed anywhere else, and every part of this tab is brand-scoped. */
function useBrands() {
  return useQuery({
    queryKey: ['oor', 'brands'],
    queryFn: async () => {
      const { data } = await api.get('/operations/oor/brands')
      return (data as { brands: Brand[] }).brands
    },
    staleTime: 5 * 60 * 1000,
  })
}

export type PoTrackingScope =
  | { kind: 'po'; value: string; label?: string }
  | { kind: 'cm'; value: string; label?: string }

export function PoTrackingTab({
  scope,
  onNestedDialogChange,
}: {
  scope?: PoTrackingScope
  onNestedDialogChange?: (open: boolean) => void
}) {
  const brands = useBrands().data ?? []
  const [view, setView] = useState<ReportView>('customer_open_order')
  const [brandId, setBrandId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [activeStat, setActiveStat] = useState<StatKey | null>(null)
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('requiredDeliveryDate')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable')
  const [openLineId, setOpenLineId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    onNestedDialogChange?.(Boolean(openLineId || importOpen))
    return () => onNestedDialogChange?.(false)
  }, [openLineId, importOpen, onNestedDialogChange])

  const { expanded, toggle } = useExpansionState('oor.expanded.v1')
  const columns = COLUMN_SETS[view]

  // A per-column filter box is a search for the term with the column as
  // context; the API's search covers every identifier, which is what someone
  // pasting a PO number into any box actually wants.
  const combinedSearch = useMemo(() => {
    const parts = [search, ...Object.values(columnFilters)].map((s) => s.trim()).filter(Boolean)
    return parts.join(' ')
  }, [search, columnFilters])

  const filters: OorFilters = {
    brandId: brandId || undefined,
    ...(scope?.kind === 'po' ? { customerPoNumber: scope.value } : {}),
    ...(scope?.kind === 'cm' ? { cmCode: scope.value } : {}),
    search: combinedSearch || undefined,
    page,
    pageSize: 50,
    sort,
    dir,
    ...(view === 'open_order_shortage' ? { hasShortage: true } : {}),
    ...(activeStat ? STAT_FILTERS[activeStat] : {}),
  }

  const lines = useOorLines(filters)
  const rows = lines.data?.rows ?? []
  const total = lines.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / 50))

  const onSort = (key: string) => {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(key)
      setDir('asc')
    }
    setPage(1)
  }

  return (
    <div className="space-y-4">
      {scope ? (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]"
          style={{ background: 'var(--accent-secondary-light)', color: 'var(--text-secondary)' }}
        >
          <ClipboardCheck size={14} style={{ color: 'var(--accent-secondary)' }} />
          <span>
            Showing open lines for <strong style={{ color: 'var(--text-primary)' }}>{scope.label ?? scope.value}</strong>
          </span>
        </div>
      ) : null}
      {/* ── Controls ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => {
                setView(v.key)
                setPage(1)
              }}
              className="px-3 py-1.5 text-[12px] font-medium"
              style={{
                background: view === v.key ? 'var(--accent-secondary)' : 'transparent',
                color: view === v.key ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        <select
          value={brandId}
          onChange={(e) => {
            setBrandId(e.target.value)
            setPage(1)
          }}
          className="rounded-lg px-2.5 py-1.5 text-[12px]"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="Search PO, order, item, description…"
          className="rounded-lg px-2.5 py-1.5 text-[12px] flex-1 min-w-[220px]"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
        />

        <button
          type="button"
          onClick={() => setDensity((d) => (d === 'comfortable' ? 'compact' : 'comfortable'))}
          title="Row density"
          className="rounded-lg px-2 py-1.5"
          style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
        >
          <Rows3 size={14} />
        </button>

        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium"
          style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
        >
          <Upload size={13} /> {scope?.kind === 'cm' ? 'Import CM report' : 'Import report'}
        </button>

        <a
          href={`/api/v1/operations/oor/exports?reportType=${view}${brandId ? `&brandId=${brandId}` : ''}${scope?.kind === 'po' ? `&customerPoNumber=${encodeURIComponent(scope.value)}` : ''}${scope?.kind === 'cm' ? `&cmCode=${encodeURIComponent(scope.value)}` : ''}`}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium"
          style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
        >
          <Download size={13} /> Export
        </a>
      </div>

      <OorStatCards
        summary={lines.data?.summary}
        active={activeStat}
        loading={lines.isLoading}
        onToggle={(key) => {
          setActiveStat((prev) => (prev === key ? null : key))
          setPage(1)
        }}
      />

      {lines.isError ? (
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: 'var(--danger-light)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
          These lines could not be loaded. Refresh, or check that you have access to the Open Order Report.
        </div>
      ) : null}

      <OorGrid
        rows={rows}
        columns={columns}
        loading={lines.isLoading}
        sort={sort}
        dir={dir}
        onSort={onSort}
        columnFilters={columnFilters}
        onColumnFilter={(key, value) => {
          setColumnFilters((f) => ({ ...f, [key]: value }))
          setPage(1)
        }}
        expanded={expanded}
        onToggleExpand={toggle}
        onOpenLine={setOpenLineId}
        density={density}
      />

      <div className="flex items-center justify-between text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
        <span>
          {total.toLocaleString('en-US')} line{total === 1 ? '' : 's'}
          {activeStat ? ' (filtered)' : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg px-2.5 py-1"
            style={{ border: '1px solid var(--border-default)', opacity: page <= 1 ? 0.4 : 1 }}
          >
            Previous
          </button>
          <span>Page {page} of {pageCount}</span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            className="rounded-lg px-2.5 py-1"
            style={{ border: '1px solid var(--border-default)', opacity: page >= pageCount ? 0.4 : 1 }}
          >
            Next
          </button>
        </div>
      </div>

      {openLineId ? <OorModal lineId={openLineId} onClose={() => setOpenLineId(null)} /> : null}
      {importOpen ? (
        <ImportPanel
          brands={brands}
          initialBrandId={brandId}
          contextLabel={scope?.kind === 'cm' ? scope.label ?? scope.value : undefined}
          onClose={() => setImportOpen(false)}
        />
      ) : null}
    </div>
  )
}

export function PoTrackingOverlay({
  scope,
  onClose,
}: {
  scope: PoTrackingScope
  onClose: () => void
}) {
  const [nestedDialogOpen, setNestedDialogOpen] = useState(false)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !nestedDialogOpen) onClose()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [nestedDialogOpen, onClose])

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm"
        onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label={`Production order tracking for ${scope.label ?? scope.value}`}
          className="flex max-h-[94vh] w-[min(1500px,96vw)] flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-2xl"
        >
          <header className="flex items-center justify-between gap-4 border-b border-[var(--border-default)] px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
                <ClipboardCheck size={17} className="text-[var(--accent)]" />
                Production Order Tracking
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                {scope.kind === 'po' ? 'Purchase order' : 'Contract manufacturer'} · {scope.label ?? scope.value}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close production order tracking"
              className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <X size={18} />
            </button>
          </header>
          <div className="flex-1 overflow-auto p-5">
            <PoTrackingTab scope={scope} onNestedDialogChange={setNestedDialogOpen} />
          </div>
        </section>
      </div>
    </OverlayPortal>
  )
}

/** Import plus the review of what the file got wrong. Warnings never block the
 *  import — they are a worklist, and on a normal week there are about ten. */
function ImportPanel({
  brands,
  initialBrandId,
  contextLabel,
  onClose,
}: {
  brands: Brand[]
  initialBrandId?: string
  contextLabel?: string
  onClose: () => void
}) {
  const { importReport } = useOorMutations()
  const [brandId, setBrandId] = useState(initialBrandId || (brands.length === 1 ? brands[0]?.id ?? '' : ''))
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const result = importReport.data

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)', zIndex: 60 }}>
      <div className="rounded-2xl p-5" style={{ width: 'min(760px, 92vw)', maxHeight: '86vh', overflow: 'auto', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Import an open order report</h3>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Either format, .xls or .xlsx. Existing lines keep their comments, notes and status.
              {contextLabel ? ` Results will refresh in the ${contextLabel} view.` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ color: 'var(--text-tertiary)' }}><X size={16} /></button>
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-[12px]"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          >
            <option value="" disabled>Select a brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <input
            type="file"
            accept=".xls,.xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-[12px]"
            style={{ color: 'var(--text-secondary)' }}
          />
          <button
            type="button"
            disabled={!file || !brandId || importReport.isPending}
            onClick={async () => {
              if (!file || !brandId) return
              setError(null)
              try {
                await importReport.mutateAsync({ file, brandId })
              } catch (err: unknown) {
                setError(
                  (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
                    'That file could not be imported.',
                )
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium"
            style={{ background: file && brandId ? 'var(--accent-secondary)' : 'var(--bg-hover)', color: file && brandId ? '#fff' : 'var(--text-tertiary)' }}
          >
            {importReport.isPending ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            Import
          </button>
        </div>

        {error ? <div className="text-[12px] mb-2" style={{ color: 'var(--danger)' }}>{error}</div> : null}

        {result ? (
          <div className="rounded-xl p-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            {result.duplicateOfRunId ? (
              <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                This exact file has already been imported. Nothing changed.
              </p>
            ) : (
              <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                {result.created} new line{result.created === 1 ? '' : 's'}, {result.updated} updated,{' '}
                {result.nodesWritten} materials, {result.commentsImported} comments migrated.
              </p>
            )}

            {result.warnings?.length > 0 ? (
              <div className="mt-3">
                <div className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                  {result.warnings.length} cell{result.warnings.length === 1 ? '' : 's'} needing a human
                </div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ color: 'var(--text-tertiary)' }}>
                      <th className="text-left font-normal pb-1">Row</th>
                      <th className="text-left font-normal pb-1">Column</th>
                      <th className="text-left font-normal pb-1">Value in the file</th>
                      <th className="text-left font-normal pb-1">What happened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.warnings.map((w, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border-default)' }}>
                        <td className="py-1" style={{ fontFamily: 'var(--font-mono)' }}>{w.rowNumber}</td>
                        <td className="py-1">{w.column}</td>
                        <td className="py-1" style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>{w.rawValue}</td>
                        <td className="py-1" style={{ color: 'var(--text-secondary)' }}>{w.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  The import succeeded — these rows landed with the bad value left out, and can be corrected on the line.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
