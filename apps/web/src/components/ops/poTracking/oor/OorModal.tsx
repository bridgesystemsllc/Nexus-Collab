// ─── Open Order Report modal ────────────────────────────────
// The screen someone opens to answer "what is happening with this PO". Seven
// tabs over one line: the source row, its production tracker, and the four
// places its history accumulates, plus the merged feed of all of it.
//
// It is deep-linkable — /operations/po-tracking/oor/:lineId — because the most
// common thing anyone does with an answer like this is paste it to someone else.

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Copy, Printer, Link2, Check } from 'lucide-react'
import { OOR_LINE_STATUSES, OOR_STATUS_META, type OorLineStatus } from '@nexus/shared'
import { useOorLine, useOorTree, useOorMutations, type OorLineRow } from './useOorQueries'
import { StatusPill, RiskPill, Pill } from './OorPills'
import { formatCountdown, formatCurrency, formatLongDate, formatQty, formatShortDate } from './oorFormat'
import { ShortageTree } from './ShortageTree'
import { ProductionTrackerTab } from './tabs/ProductionTracker'
import { CommentsTab } from './tabs/Comments'
import { NotesTab } from './tabs/Notes'
import { MeetingUpdatesTab } from './tabs/MeetingUpdates'
import { EmailsTab } from './tabs/Emails'
import { ActivityTab } from './tabs/Activity'

type ModalTab = 'overview' | 'tracker' | 'comments' | 'notes' | 'meetings' | 'emails' | 'activity'

const TABS: { key: ModalTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'tracker', label: 'Production Tracker' },
  { key: 'comments', label: 'Comments' },
  { key: 'notes', label: 'Notes' },
  { key: 'meetings', label: 'Meeting Updates' },
  { key: 'emails', label: 'Emails' },
  { key: 'activity', label: 'Activity' },
]

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5" style={{ borderBottom: '1px solid var(--border-default)' }}>
      <div className="text-[11px] shrink-0" style={{ color: 'var(--text-tertiary)', width: 150 }}>{label}</div>
      <div
        className="text-[13px] min-w-0"
        style={{ color: 'var(--text-primary)', fontFamily: mono ? 'var(--font-mono)' : undefined }}
      >
        {children}
      </div>
    </div>
  )
}

function StatusEditor({ line }: { line: OorLineRow }) {
  const { patchLine } = useOorMutations(line.id)
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState<OorLineStatus>(line.lineStatus as OorLineStatus)
  const [reason, setReason] = useState('')

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} title="Change status">
        <StatusPill status={line.lineStatus} overridden={line.statusSource === 'manual'} reason={line.statusOverrideReason} />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as OorLineStatus)}
        className="rounded-lg px-2 py-1 text-[12px]"
        style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
      >
        {OOR_LINE_STATUSES.map((s) => (
          <option key={s} value={s}>{OOR_STATUS_META[s].label}</option>
        ))}
      </select>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why? (required)"
        className="rounded-lg px-2 py-1 text-[12px]"
        style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', width: 190 }}
      />
      <button
        type="button"
        disabled={!reason.trim() || patchLine.isPending}
        onClick={async () => {
          await patchLine.mutateAsync({ id: line.id, patch: { lineStatus: status, statusOverrideReason: reason.trim() } })
          setEditing(false)
          setReason('')
        }}
        className="rounded-lg px-2 py-1 text-[12px]"
        style={{ background: reason.trim() ? 'var(--accent-secondary)' : 'var(--bg-hover)', color: reason.trim() ? '#fff' : 'var(--text-tertiary)' }}
      >
        <Check size={12} />
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
        Cancel
      </button>
    </div>
  )
}

export function OorModal({ lineId, onClose }: { lineId: string; onClose: () => void }) {
  const [tab, setTab] = useState<ModalTab>('overview')
  const [copied, setCopied] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const line = useOorLine(lineId)
  const tree = useOorTree(lineId, tab === 'overview' || tab === 'tracker')

  // Focus trap plus Escape. A modal this large that swallows the keyboard is
  // worse than no modal.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (e.key !== 'Tab') return
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  const row = line.data
  const worstEta = useMemo(() => {
    if (!tree.data) return null
    const flat = (ns: typeof tree.data): typeof tree.data => ns.flatMap((n) => [n, ...flat(n.children)])
    const blockers = flat(tree.data).filter((n) => {
      const need = Number(n.qtyNeeded ?? 0)
      return need > 0 && Number(n.qtyOnHand ?? 0) < need
    })
    if (blockers.length === 0) return null
    if (blockers.some((b) => !b.etaDate)) return 'unknown'
    return blockers.map((b) => b.etaDate!).sort().at(-1) ?? null
  }, [tree.data])

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)', zIndex: 60 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Open order report for ${row?.customerPoNumber ?? 'line'}`}
        className="rounded-2xl flex flex-col"
        style={{ width: '90vw', maxWidth: 1400, maxHeight: '92vh', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xl)' }}
      >
        {/* ── Header ── */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[17px] font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {row?.customerPoNumber ?? '—'}
                </span>
                {row?.channelTag ? <Pill tone="accent">{row.channelTag}</Pill> : null}
                {row ? <StatusEditor line={row} /> : null}
                {row ? <RiskPill risk={row.riskLevel} /> : null}
              </div>
              <div className="mt-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{row?.itemNumber ?? ''}</span>
                {row?.description ? ` · ${row.description}` : ''}
              </div>
              {row?.requiredDeliveryDate ? (
                <div className="mt-1 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
                  Required {formatLongDate(row.requiredDeliveryDate)}
                  <span style={{ color: (formatCountdown(row.requiredDeliveryDate) || '').includes('ago') ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                    {' '}({formatCountdown(row.requiredDeliveryDate)})
                  </span>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                title="Copy a link to this line"
                onClick={() => {
                  const url = `${window.location.origin}/operations/po-tracking/oor/${lineId}`
                  navigator.clipboard?.writeText(url)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                }}
                className="rounded-lg p-1.5"
                style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
              >
                {copied ? <Check size={14} /> : <Link2 size={14} />}
              </button>
              <button type="button" title="Print" onClick={() => window.print()} className="rounded-lg p-1.5" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                <Printer size={14} />
              </button>
              <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5" style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="mt-3 flex gap-1 flex-wrap" role="tablist" aria-label="Line detail sections">
            {TABS.map((t) => {
              const active = tab === t.key
              const count =
                t.key === 'comments' ? row?._count.comments
                : t.key === 'notes' ? row?._count.notes
                : t.key === 'meetings' ? row?._count.meetingUpdates
                : t.key === 'tracker' ? row?._count.nodes
                : undefined
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  role="tab"
                  aria-selected={active}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-medium"
                  style={{
                    background: active ? 'var(--accent-secondary)' : 'transparent',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'var(--accent-secondary)' : 'var(--border-default)'}`,
                  }}
                >
                  {t.label}
                  {count ? <span style={{ opacity: 0.7 }}> {count}</span> : null}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {line.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="oor-skeleton" style={{ height: 16, borderRadius: 4 }} />
              ))}
            </div>
          ) : !row ? (
            <div className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>That line could not be loaded.</div>
          ) : tab === 'overview' ? (
            <div className="grid gap-x-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
              <div>
                <Field label="Customer PO" mono>{row.customerPoNumber ?? '—'}</Field>
                <Field label="Order" mono>{row.salesOrderNumber ?? '—'}</Field>
                <Field label="Item#" mono>{row.itemNumber ?? '—'}</Field>
                <Field label="Cust Part" mono>{row.custPartNumber ?? '—'}</Field>
                <Field label="Description">{row.description ?? '—'}</Field>
                <Field label="Qtys" mono>{row.qtyOrdered === null ? (row.qtyOrderedRaw ?? '—') : formatQty(row.qtyOrdered)}</Field>
                <Field label="RemQty" mono>{formatQty(row.qtyRemaining)}</Field>
                <Field label="Price" mono>{formatCurrency(row.unitPrice)}</Field>
                <Field label="Value" mono>
                  {formatCurrency(row.valueComputed)}
                  {row.valueMismatch ? (
                    <span className="ml-2 text-[11px]" style={{ color: 'var(--warning)' }}>
                      recomputed — the report says {formatCurrency(row.valueSource) || 'an unreadable figure'}
                    </span>
                  ) : null}
                </Field>
              </div>
              <div>
                <Field label="OrdDt" mono>{formatShortDate(row.orderDate) || '—'}</Field>
                <Field label="ShipDt" mono>{formatShortDate(row.shipDate) || '—'}</Field>
                <Field label="Orig Date" mono>{formatShortDate(row.origRequiredDate) || '—'}</Field>
                <Field label="Req.Del" mono>
                  {formatShortDate(row.requiredDeliveryDate) || '—'}
                  {row.requiredDeliveryDate ? (
                    <span className="ml-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{formatCountdown(row.requiredDeliveryDate)}</span>
                  ) : null}
                </Field>
                <Field label="WO" mono>{row.workOrderNumber ?? '—'}</Field>
                <Field label="Job Num" mono>{row.jobNumber ?? '—'}</Field>
                <Field label="Fulfillment">
                  {row.fulfillmentType === 'CONTRACT_MFG' ? `Contract Manufacture${row.cmCode ? ` — ${row.cmCode}` : ''}` : row.fulfillmentType}
                  {row.jobStatus === 'ACT' ? <span className="ml-2"><Pill tone="success">Active</Pill></span> : null}
                </Field>
                <Field label="Worst blocker ETA">
                  {worstEta === 'unknown' ? (
                    <span style={{ color: 'var(--danger)' }}>Unknown — a blocker has no date</span>
                  ) : worstEta ? (
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{formatShortDate(worstEta)}</span>
                  ) : (
                    '—'
                  )}
                </Field>
                <Field label="Imported from">
                  {row.reportRun?.reportLabel ?? '—'}
                  {row.reportRun?.asOfDate ? ` (as of ${formatShortDate(row.reportRun.asOfDate)})` : ''}
                </Field>
              </div>
              <div style={{ gridColumn: '1 / -1' }} className="mt-4">
                <div className="text-[11px] uppercase tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>Materials</div>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
                  <ShortageTree nodes={tree.data} loading={tree.isLoading} />
                </div>
              </div>
            </div>
          ) : tab === 'tracker' ? (
            <ProductionTrackerTab lineId={lineId} nodes={tree.data} loading={tree.isLoading} />
          ) : tab === 'comments' ? (
            <CommentsTab lineId={lineId} />
          ) : tab === 'notes' ? (
            <NotesTab lineId={lineId} />
          ) : tab === 'meetings' ? (
            <MeetingUpdatesTab lineId={lineId} />
          ) : tab === 'emails' ? (
            <EmailsTab lineId={lineId} />
          ) : (
            <ActivityTab lineId={lineId} />
          )}
        </div>
      </div>
    </div>
  )
}
