import { useState, useEffect, useMemo } from 'react'
import {
  Clock, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronRight,
  MessageSquare, ListChecks, Edit3, Flag, RefreshCw, Search, Filter,
  ArrowUpDown, Download,
} from 'lucide-react'
import {
  useTransitionSkus, useUpdateTransitionSku, useCreateTransitionNote,
  useUpdateTransitionMilestone, useSeedTransitionData,
} from '@/hooks/useData'
import type { TransitionSku, TransitionMilestone as TMilestone, TransitionNote as TNote } from './transitionTypes'
import {
  TRACK_LABELS, TRACK_COLORS, STATUS_COLORS, CM_STATUS_OPTIONS,
  NOTE_TYPES, PRIORITY_OPTIONS, OVERALL_STATUS_OPTIONS,
  calcTransitionProgress, groupByKey,
} from './transitionTypes'

// ─── Shared Styles ──────────────────────────────────────────

const inputClass =
  'w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]'

const selectClass = inputClass

const LOREAL_DEADLINE = new Date('2025-04-29')

// ─── Helpers ────────────────────────────────────────────────

function daysUntil(target: Date): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const t = new Date(target)
  t.setHours(0, 0, 0, 0)
  return Math.ceil((t.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function priorityColor(p: string): string {
  if (p === 'High') return '#FF453A'
  if (p === 'Medium') return '#FF9F0A'
  return '#6E6E73'
}

// ─── DeadlineCountdownBanner ────────────────────────────────

function DeadlineCountdownBanner({ skus }: { skus: TransitionSku[] }) {
  const days = daysUntil(LOREAL_DEADLINE)
  const deadlinePassed = days < 0
  const track1Needs = skus.filter(
    s => s.track === 'loreal_coman' && s.overallStatus !== 'Transition Complete' && s.overallStatus !== 'Active'
  ).length

  let bgColor: string
  let textColor = '#fff'
  let pulseClass = ''
  if (deadlinePassed) {
    bgColor = '#DC2626'
  } else if (days > 60) {
    bgColor = '#4F46E5'
  } else if (days > 30) {
    bgColor = '#D97706'
  } else {
    bgColor = '#DC2626'
    pulseClass = 'animate-pulse'
  }

  return (
    <div
      className={`rounded-xl px-6 py-4 flex items-center justify-between ${pulseClass}`}
      style={{ background: bgColor, color: textColor }}
    >
      <div className="flex items-center gap-3">
        <Clock size={20} />
        <div>
          <p className="text-[14px] font-semibold">
            L'Oreal Co-Man Separation Deadline: April 29, 2025
          </p>
          {deadlinePassed ? (
            <p className="text-[13px] opacity-90">
              Deadline Passed &mdash; {track1Needs} SKU{track1Needs !== 1 ? 's' : ''} not yet transitioned
            </p>
          ) : (
            <p className="text-[13px] opacity-90">
              {days} day{days !== 1 ? 's' : ''} remaining &middot; {track1Needs} Track 1 SKU{track1Needs !== 1 ? 's' : ''} need action
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── KPICards ────────────────────────────────────────────────

function KPICards({ skus }: { skus: TransitionSku[] }) {
  const stats = useMemo(() => {
    const total = skus.length
    const complete = skus.filter(
      s => s.overallStatus === 'Transition Complete' || s.overallStatus === 'Active'
    ).length
    const needsAction = skus.filter(
      s => s.overallStatus === 'Needs Action' || s.overallStatus === 'At Risk'
    ).length
    const decisionRequired = skus.filter(
      s => s.track === 'disco_decision' && s.discoDecision === 'Pending'
    ).length
    return { total, complete, needsAction, decisionRequired }
  }, [skus])

  const cards: { label: string; value: number; color: string; borderColor: string }[] = [
    { label: 'Total SKUs', value: stats.total, color: '#4F46E5', borderColor: '#4F46E5' },
    { label: 'Transition Complete', value: stats.complete, color: '#10B981', borderColor: '#10B981' },
    { label: 'Needs Action', value: stats.needsAction, color: '#D97706', borderColor: '#D97706' },
    { label: 'Decision Required', value: stats.decisionRequired, color: '#DC2626', borderColor: '#DC2626' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <div
          key={c.label}
          className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex items-center gap-4"
          style={{ borderLeft: `4px solid ${c.borderColor}` }}
        >
          <div>
            <p className="text-[28px] font-bold tabular-nums" style={{ color: c.color }}>
              {c.value}
            </p>
            <p className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-wider mt-0.5">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── ViewTabs ───────────────────────────────────────────────

function ViewTabs({
  viewTab,
  setViewTab,
}: {
  viewTab: 'track' | 'table'
  setViewTab: (v: 'track' | 'table') => void
}) {
  return (
    <div className="flex items-center gap-1 bg-[var(--bg-input)] rounded-lg p-1 w-fit">
      <button
        className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all ${
          viewTab === 'track'
            ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
        onClick={() => setViewTab('track')}
      >
        Track View
      </button>
      <button
        className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all ${
          viewTab === 'table'
            ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
        onClick={() => setViewTab('table')}
      >
        All SKUs Table
      </button>
    </div>
  )
}

// ─── ProgressBar ────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full h-2 rounded-full bg-[var(--bg-input)] overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${Math.min(value, 100)}%`,
          background: value >= 100 ? '#10B981' : value >= 50 ? '#0A84FF' : '#7C3AED',
        }}
      />
    </div>
  )
}

// ─── StatusBadge ────────────────────────────────────────────

function StatusBadge({ label, color }: { label: string; color?: string }) {
  const bg = color || STATUS_COLORS[label] || '#6E6E73'
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: `${bg}20`, color: bg }}
    >
      {label}
    </span>
  )
}

// ─── TrackBadge ─────────────────────────────────────────────

function TrackBadge({ track }: { track: string }) {
  const color = TRACK_COLORS[track] || '#6E6E73'
  const label = track === 'loreal_coman' ? 'Co-Man' : track === 'full_buy' ? 'Full Buy' : 'Disco'
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: `${color}20`, color }}
    >
      {label}
    </span>
  )
}

// ─── SKU Card (shared) ──────────────────────────────────────

function SkuCard({
  sku,
  onNotes,
  onMilestones,
  onEdit,
  onDisco,
  onSource,
  updateSku,
}: {
  sku: TransitionSku
  onNotes: () => void
  onMilestones: () => void
  onEdit: () => void
  onDisco?: () => void
  onSource?: () => void
  updateSku: ReturnType<typeof useUpdateTransitionSku>
}) {
  const progress = calcTransitionProgress(sku)
  const isDiscoTrack = sku.track === 'disco_decision'

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 space-y-3 hover:border-[var(--border-subtle)] transition-colors">
      {/* Decision required banner for disco track */}
      {isDiscoTrack && sku.discoDecision === 'Pending' && (
        <div className="rounded-md px-3 py-1.5 text-[11px] font-bold text-white uppercase tracking-wider" style={{ background: '#DC2626' }}>
          Decision Required
        </div>
      )}
      {isDiscoTrack && sku.discoDecision !== 'Pending' && (
        <div className="rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{
          background: sku.discoDecision === 'Discontinue' ? '#6E6E7320' : '#10B98120',
          color: sku.discoDecision === 'Discontinue' ? '#6E6E73' : '#10B981',
        }}>
          Decision: {sku.discoDecision}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{sku.materialCode}</p>
          <p className="text-[12px] text-[var(--text-secondary)] line-clamp-2 mt-0.5">{sku.description}</p>
        </div>
        <StatusBadge label={sku.overallStatus} />
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
        <div className="text-[var(--text-tertiary)]">Current CM</div>
        <div className="text-[var(--text-primary)] font-medium text-right">{sku.currentCm || '—'}</div>
        {!isDiscoTrack && (
          <>
            <div className="text-[var(--text-tertiary)]">New CM</div>
            <div className="text-[var(--text-primary)] font-medium text-right">{sku.newCm || 'Not Assigned'}</div>
          </>
        )}
        {sku.track === 'loreal_coman' && (
          <>
            <div className="text-[var(--text-tertiary)]">L'Oreal Entity</div>
            <div className="text-[var(--text-primary)] font-medium text-right">{sku.lorealEntity || '—'}</div>
          </>
        )}
        {sku.track === 'full_buy' && sku.formulaOwner && (
          <>
            <div className="text-[var(--text-tertiary)]">Formula Owner</div>
            <div className="text-[var(--text-primary)] font-medium text-right">{sku.formulaOwner}</div>
          </>
        )}
        <div className="text-[var(--text-tertiary)]">CM Status</div>
        <div className="text-right">
          <StatusBadge label={sku.cmStatus} />
        </div>
      </div>

      {/* Formula / RM toggles */}
      {!isDiscoTrack && (
        <div className="flex items-center gap-4 text-[12px]">
          <button
            className="flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            onClick={() =>
              updateSku.mutate({ id: sku.id, formulaTransferred: !sku.formulaTransferred })
            }
          >
            {sku.formulaTransferred ? (
              <CheckCircle2 size={14} className="text-green-500" />
            ) : (
              <XCircle size={14} className="text-[var(--text-tertiary)]" />
            )}
            Formula
          </button>
          <button
            className="flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            onClick={() =>
              updateSku.mutate({ id: sku.id, rawMaterialsConfirmed: !sku.rawMaterialsConfirmed })
            }
          >
            {sku.rawMaterialsConfirmed ? (
              <CheckCircle2 size={14} className="text-green-500" />
            ) : (
              <XCircle size={14} className="text-[var(--text-tertiary)]" />
            )}
            RM
          </button>
        </div>
      )}

      {/* Progress */}
      {!isDiscoTrack && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--text-tertiary)]">Progress</span>
            <span className="text-[var(--text-secondary)] font-medium tabular-nums">{progress}%</span>
          </div>
          <ProgressBar value={progress} />
        </div>
      )}

      {/* Extra note for K5891000 */}
      {sku.materialCode === 'K5891000' && (
        <p className="text-[11px] text-[var(--danger)] italic">
          Note: 2 remaining batches in production
        </p>
      )}

      {/* Disco action buttons */}
      {isDiscoTrack && sku.discoDecision === 'Pending' && onDisco && onSource && (
        <div className="flex items-center gap-2">
          <button
            className="flex-1 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
            onClick={onDisco}
          >
            Discontinue Product
          </button>
          <button
            className="flex-1 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-green-500/30 text-green-400 hover:bg-green-500/10 transition-colors"
            onClick={onSource}
          >
            Source RM & Produce
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 pt-1 border-t border-[var(--border-subtle)]">
        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          onClick={onNotes}
        >
          <MessageSquare size={13} /> Notes
        </button>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          onClick={onMilestones}
        >
          <ListChecks size={13} /> Milestones
        </button>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          onClick={onEdit}
        >
          <Edit3 size={13} /> Edit
        </button>
      </div>
    </div>
  )
}

// ─── TrackColumn ────────────────────────────────────────────

function TrackColumn({
  track,
  skus,
  expandedGroups,
  toggleGroup,
  onSelectSku,
  setDrawerOpen,
  updateSku,
  setDiscoConfirmSku,
}: {
  track: string
  skus: TransitionSku[]
  expandedGroups: Record<string, boolean>
  toggleGroup: (key: string) => void
  onSelectSku: (sku: TransitionSku) => void
  setDrawerOpen: (d: 'notes' | 'milestones' | null) => void
  updateSku: ReturnType<typeof useUpdateTransitionSku>
  setDiscoConfirmSku: (sku: TransitionSku | null) => void
}) {
  const grouped = useMemo(() => groupByKey(skus, 'currentCm'), [skus])
  const color = TRACK_COLORS[track] || '#6E6E73'

  return (
    <div className="flex flex-col min-w-[340px] max-w-[420px] flex-1">
      {/* Column header */}
      <div
        className="rounded-t-xl px-4 py-3 border border-[var(--border-default)]"
        style={{ borderBottom: `3px solid ${color}` }}
      >
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
          {TRACK_LABELS[track] || track}
        </h3>
        <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{skus.length} SKU{skus.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto space-y-1 border-x border-b border-[var(--border-default)] rounded-b-xl bg-[var(--bg-elevated)] p-3" style={{ maxHeight: '65vh' }}>
        {Object.entries(grouped).map(([cmName, cmSkus]) => {
          const groupKey = `${track}-${cmName}`
          const isExpanded = expandedGroups[groupKey] !== false // default expanded

          return (
            <div key={groupKey} className="mb-2">
              <button
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
                onClick={() => toggleGroup(groupKey)}
              >
                <span className="text-[13px] font-medium text-[var(--text-primary)]">
                  {cmName} <span className="text-[var(--text-tertiary)] font-normal">({cmSkus.length})</span>
                </span>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {isExpanded && (
                <div className="space-y-2 mt-2">
                  {cmSkus.map(sku => (
                    <SkuCard
                      key={sku.id}
                      sku={sku}
                      updateSku={updateSku}
                      onNotes={() => { onSelectSku(sku); setDrawerOpen('notes') }}
                      onMilestones={() => { onSelectSku(sku); setDrawerOpen('milestones') }}
                      onEdit={() => { onSelectSku(sku); setDrawerOpen(null) }}
                      onDisco={track === 'disco_decision' ? () => setDiscoConfirmSku(sku) : undefined}
                      onSource={track === 'disco_decision' ? () => {
                        updateSku.mutate({
                          id: sku.id,
                          discoDecision: 'Find RM and Produce',
                          overallStatus: 'In Progress',
                          discoDecisionDate: new Date().toISOString(),
                        })
                      } : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {skus.length === 0 && (
          <p className="text-[13px] text-[var(--text-tertiary)] text-center py-8">No SKUs in this track</p>
        )}
      </div>
    </div>
  )
}

// ─── TrackView ──────────────────────────────────────────────

function TrackView({
  skus,
  expandedGroups,
  toggleGroup,
  onSelectSku,
  setDrawerOpen,
  updateSku,
  setDiscoConfirmSku,
}: {
  skus: TransitionSku[]
  expandedGroups: Record<string, boolean>
  toggleGroup: (key: string) => void
  onSelectSku: (sku: TransitionSku) => void
  setDrawerOpen: (d: 'notes' | 'milestones' | null) => void
  updateSku: ReturnType<typeof useUpdateTransitionSku>
  setDiscoConfirmSku: (sku: TransitionSku | null) => void
}) {
  const tracks: ('loreal_coman' | 'full_buy' | 'disco_decision')[] = ['loreal_coman', 'full_buy', 'disco_decision']
  const grouped = useMemo(() => groupByKey(skus, 'track'), [skus])

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {tracks.map(t => (
        <TrackColumn
          key={t}
          track={t}
          skus={grouped[t] || []}
          expandedGroups={expandedGroups}
          toggleGroup={toggleGroup}
          onSelectSku={onSelectSku}
          setDrawerOpen={setDrawerOpen}
          updateSku={updateSku}
          setDiscoConfirmSku={setDiscoConfirmSku}
        />
      ))}
    </div>
  )
}

// ─── AllSKUsTable ───────────────────────────────────────────

function AllSKUsTable({
  skus,
  filters,
  setFilters,
  onSelectSku,
  setDrawerOpen,
}: {
  skus: TransitionSku[]
  filters: Record<string, string>
  setFilters: (f: Record<string, string>) => void
  onSelectSku: (sku: TransitionSku) => void
  setDrawerOpen: (d: 'notes' | 'milestones' | null) => void
}) {
  const [sortKey, setSortKey] = useState<string>('materialCode')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const filtered = useMemo(() => {
    let result = [...skus]
    if (filters.track) result = result.filter(s => s.track === filters.track)
    if (filters.status) result = result.filter(s => s.overallStatus === filters.status)
    if (filters.cm) result = result.filter(s => s.currentCm === filters.cm)
    if (filters.priority) result = result.filter(s => s.priority === filters.priority)
    return result
  }, [skus, filters])

  const sorted = useMemo(() => {
    return filtered.sort((a, b) => {
      const aVal = String((a as any)[sortKey] ?? '')
      const bVal = String((b as any)[sortKey] ?? '')
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    })
  }, [filtered, sortKey, sortDir])

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const uniqueCms = useMemo(() => [...new Set(skus.map(s => s.currentCm).filter(Boolean))].sort(), [skus])

  const updateFilter = (key: string, value: string) => {
    setFilters({ ...filters, [key]: value || '' })
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <Filter size={14} />
          <span className="text-[12px] font-medium">Filters:</span>
        </div>
        <select
          className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--text-primary)] outline-none"
          value={filters.track || ''}
          onChange={e => updateFilter('track', e.target.value)}
        >
          <option value="">All Tracks</option>
          {Object.entries(TRACK_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--text-primary)] outline-none"
          value={filters.status || ''}
          onChange={e => updateFilter('status', e.target.value)}
        >
          <option value="">All Statuses</option>
          {OVERALL_STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--text-primary)] outline-none"
          value={filters.cm || ''}
          onChange={e => updateFilter('cm', e.target.value)}
        >
          <option value="">All CMs</option>
          {uniqueCms.map(cm => (
            <option key={cm!} value={cm!}>{cm}</option>
          ))}
        </select>
        <select
          className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--text-primary)] outline-none"
          value={filters.priority || ''}
          onChange={e => updateFilter('priority', e.target.value)}
        >
          <option value="">All Priorities</option>
          {PRIORITY_OPTIONS.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {Object.values(filters).some(Boolean) && (
          <button
            className="text-[12px] text-[var(--accent)] hover:underline"
            onClick={() => setFilters({})}
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-default)]">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[var(--bg-elevated)] border-b border-[var(--border-default)]">
              {[
                { key: 'track', label: 'Track' },
                { key: 'materialCode', label: 'Material' },
                { key: 'description', label: 'Description' },
                { key: 'currentCm', label: 'CM (Current)' },
                { key: 'newCm', label: 'New CM' },
                { key: 'cmStatus', label: 'CM Status' },
                { key: 'formulaTransferred', label: 'Formula' },
                { key: 'rawMaterialsConfirmed', label: 'RM' },
                { key: '_progress', label: 'Progress' },
                { key: 'priority', label: 'Priority' },
                { key: 'overallStatus', label: 'Status' },
                { key: 'transitionOwner', label: 'Owner' },
              ].map(col => (
                <th
                  key={col.key}
                  className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider cursor-pointer hover:text-[var(--text-secondary)] whitespace-nowrap"
                  onClick={() => toggleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      <ArrowUpDown size={10} className="text-[var(--accent)]" />
                    )}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(sku => {
              const progress = calcTransitionProgress(sku)
              return (
                <tr
                  key={sku.id}
                  className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <td className="px-3 py-2.5"><TrackBadge track={sku.track} /></td>
                  <td className="px-3 py-2.5 font-medium text-[var(--text-primary)] whitespace-nowrap">{sku.materialCode}</td>
                  <td className="px-3 py-2.5 text-[var(--text-secondary)] max-w-[200px] truncate">{sku.description}</td>
                  <td className="px-3 py-2.5 text-[var(--text-primary)] whitespace-nowrap">{sku.currentCm || '—'}</td>
                  <td className="px-3 py-2.5 text-[var(--text-primary)] whitespace-nowrap">{sku.newCm || '—'}</td>
                  <td className="px-3 py-2.5"><StatusBadge label={sku.cmStatus} /></td>
                  <td className="px-3 py-2.5 text-center">
                    {sku.formulaTransferred ? (
                      <CheckCircle2 size={14} className="text-green-500 inline" />
                    ) : (
                      <XCircle size={14} className="text-[var(--text-tertiary)] inline" />
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {sku.rawMaterialsConfirmed ? (
                      <CheckCircle2 size={14} className="text-green-500 inline" />
                    ) : (
                      <XCircle size={14} className="text-[var(--text-tertiary)] inline" />
                    )}
                  </td>
                  <td className="px-3 py-2.5 min-w-[80px]">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={progress} />
                      <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums whitespace-nowrap">{progress}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge label={sku.priority} color={priorityColor(sku.priority)} />
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge label={sku.overallStatus} /></td>
                  <td className="px-3 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">{sku.transitionOwner || '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                        title="Notes"
                        onClick={() => { onSelectSku(sku); setDrawerOpen('notes') }}
                      >
                        <MessageSquare size={13} />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                        title="Milestones"
                        onClick={() => { onSelectSku(sku); setDrawerOpen('milestones') }}
                      >
                        <ListChecks size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-[var(--text-tertiary)] text-[13px]">
                  No SKUs match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── NotesDrawer ────────────────────────────────────────────

function NotesDrawer({
  sku,
  onClose,
}: {
  sku: TransitionSku
  onClose: () => void
}) {
  const createNote = useCreateTransitionNote()
  const [noteType, setNoteType] = useState(NOTE_TYPES[0])
  const [noteText, setNoteText] = useState('')

  const sortedNotes = useMemo(
    () => [...(sku.transitionNotes || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [sku.transitionNotes]
  )

  const handleSubmit = () => {
    if (!noteText.trim()) return
    createNote.mutate({ skuId: sku.id, noteType, noteText: noteText.trim() })
    setNoteText('')
  }

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-[var(--bg-surface)] border-l border-[var(--border-default)] shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">{sku.materialCode}</p>
          <p className="text-[12px] text-[var(--text-secondary)] truncate">{sku.description}</p>
        </div>
        <button
          className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          onClick={onClose}
        >
          <XCircle size={18} />
        </button>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {sortedNotes.length === 0 && (
          <p className="text-[13px] text-[var(--text-tertiary)] text-center py-8">No notes yet</p>
        )}
        {sortedNotes.map(note => (
          <div
            key={note.id}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <StatusBadge label={note.noteType} color="#0A84FF" />
              <span className="text-[11px] text-[var(--text-tertiary)]">{fmtDate(note.createdAt)}</span>
            </div>
            <p className="text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{note.noteText}</p>
          </div>
        ))}
      </div>

      {/* Add note form */}
      <div className="border-t border-[var(--border-default)] p-4 space-y-3">
        <select
          className={selectClass}
          value={noteType}
          onChange={e => setNoteType(e.target.value)}
        >
          {NOTE_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <textarea
          className={`${inputClass} resize-none`}
          rows={3}
          placeholder="Add a note..."
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSubmit() }}
        />
        <button
          className="w-full px-4 py-2.5 rounded-lg text-[13px] font-medium text-white transition-all disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
          disabled={!noteText.trim() || createNote.isPending}
          onClick={handleSubmit}
        >
          {createNote.isPending ? 'Adding...' : 'Add Note'}
        </button>
      </div>
    </div>
  )
}

// ─── MilestoneDrawer ────────────────────────────────────────

function MilestoneDrawer({
  sku,
  onClose,
}: {
  sku: TransitionSku
  onClose: () => void
}) {
  const updateMilestone = useUpdateTransitionMilestone()

  const milestones = sku.milestones || []
  const completedCount = milestones.filter(m => m.completed).length
  const total = milestones.length
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0

  const toggleMilestone = (m: TMilestone) => {
    updateMilestone.mutate({
      milestoneId: m.id,
      completed: !m.completed,
      completedDate: !m.completed ? new Date().toISOString() : null,
    })
  }

  const milestoneStatus = (m: TMilestone): 'complete' | 'overdue' | 'upcoming' | 'default' => {
    if (m.completed) return 'complete'
    if (m.dueDate) {
      const due = new Date(m.dueDate)
      const now = new Date()
      if (due < now) return 'overdue'
      const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      if (diff <= 14) return 'upcoming'
    }
    return 'default'
  }

  const statusIndicator: Record<string, { color: string; label: string }> = {
    complete: { color: '#10B981', label: 'Complete' },
    overdue: { color: '#DC2626', label: 'Overdue' },
    upcoming: { color: '#D97706', label: 'Upcoming' },
    default: { color: '#6E6E73', label: '' },
  }

  return (
    <div className="fixed inset-y-0 right-0 w-[560px] bg-[var(--bg-surface)] border-l border-[var(--border-default)] shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
        <div>
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">{sku.materialCode} Milestones</p>
          <p className="text-[12px] text-[var(--text-secondary)]">{completedCount}/{total} complete</p>
        </div>
        <button
          className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          onClick={onClose}
        >
          <XCircle size={18} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] text-[var(--text-secondary)]">Overall Progress</span>
          <span className="text-[14px] font-semibold text-[var(--text-primary)] tabular-nums">{pct}%</span>
        </div>
        <div className="w-full h-3 rounded-full bg-[var(--bg-input)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: pct >= 100 ? '#10B981' : pct >= 50 ? '#0A84FF' : '#7C3AED',
            }}
          />
        </div>
      </div>

      {/* Milestones list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-2">
        {milestones.length === 0 && (
          <p className="text-[13px] text-[var(--text-tertiary)] text-center py-8">No milestones defined</p>
        )}
        {milestones.map(m => {
          const st = milestoneStatus(m)
          const ind = statusIndicator[st]
          return (
            <div
              key={m.id}
              className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 hover:border-[var(--border-default)] transition-colors"
            >
              <button
                className="mt-0.5 flex-shrink-0"
                onClick={() => toggleMilestone(m)}
                disabled={updateMilestone.isPending}
              >
                {m.completed ? (
                  <CheckCircle2 size={18} className="text-green-500" />
                ) : (
                  <div className="w-[18px] h-[18px] rounded-full border-2 border-[var(--border-default)] hover:border-[var(--accent)] transition-colors" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-medium ${m.completed ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>
                  {m.milestoneName}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  {m.dueDate && (
                    <span className="text-[11px] text-[var(--text-tertiary)]">Due: {fmtDate(m.dueDate)}</span>
                  )}
                  {m.completedDate && (
                    <span className="text-[11px] text-[var(--text-tertiary)]">Done: {fmtDate(m.completedDate)}</span>
                  )}
                  {!m.completed && ind.label && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: ind.color }}>
                      {ind.label}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── DiscoConfirmModal ──────────────────────────────────────

function DiscoConfirmModal({
  sku,
  onCancel,
  onConfirm,
}: {
  sku: TransitionSku
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      {/* Modal */}
      <div className="relative bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] shadow-2xl p-6 max-w-md w-full mx-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(220,38,38,0.12)' }}>
            <AlertTriangle size={20} style={{ color: '#DC2626' }} />
          </div>
          <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">Discontinue Product</h3>
        </div>
        <p className="text-[14px] text-[var(--text-secondary)]">
          Are you sure you want to discontinue <strong className="text-[var(--text-primary)]">{sku.materialCode}</strong>?
        </p>
        <p className="text-[13px] text-[var(--text-tertiary)]">
          This will mark the SKU as discontinued and stop any transition efforts. This action can be reversed.
        </p>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-all"
            style={{ background: '#DC2626' }}
            onClick={onConfirm}
          >
            Confirm Discontinue
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Module ────────────────────────────────────────────

export function BrandTransitionModule() {
  const { data, isLoading, error } = useTransitionSkus()
  const seedMutation = useSeedTransitionData()
  const updateSku = useUpdateTransitionSku()

  const [viewTab, setViewTab] = useState<'track' | 'table'>('track')
  const [selectedSku, setSelectedSku] = useState<TransitionSku | null>(null)
  const [drawerOpen, setDrawerOpen] = useState<'notes' | 'milestones' | null>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [discoConfirmSku, setDiscoConfirmSku] = useState<TransitionSku | null>(null)

  const skus: TransitionSku[] = useMemo(() => (Array.isArray(data) ? data : []), [data])

  // Keep selectedSku in sync with latest data
  useEffect(() => {
    if (selectedSku) {
      const updated = skus.find(s => s.id === selectedSku.id)
      if (updated) setSelectedSku(updated)
    }
  }, [skus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-seed on mount if empty
  useEffect(() => {
    if (Array.isArray(data) && data.length === 0 && !seedMutation.isPending) {
      seedMutation.mutateAsync()
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: prev[key] === false ? true : false }))
  }

  const handleDrawerClose = () => {
    setDrawerOpen(null)
    setSelectedSku(null)
  }

  const handleDiscoConfirm = () => {
    if (!discoConfirmSku) return
    updateSku.mutate({
      id: discoConfirmSku.id,
      discoDecision: 'Discontinue',
      overallStatus: 'Discontinued',
      discoDecisionDate: new Date().toISOString(),
    })
    setDiscoConfirmSku(null)
  }

  // ─── Loading / Error States ─────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={20} className="animate-spin text-[var(--text-tertiary)]" />
        <span className="ml-3 text-[14px] text-[var(--text-tertiary)]">Loading transition data...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 gap-3">
        <AlertTriangle size={20} className="text-red-400" />
        <span className="text-[14px] text-red-400">Failed to load transition data</span>
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <DeadlineCountdownBanner skus={skus} />
      <KPICards skus={skus} />

      <div className="flex items-center justify-between">
        <ViewTabs viewTab={viewTab} setViewTab={setViewTab} />
        <p className="text-[12px] text-[var(--text-tertiary)]">{skus.length} total SKUs</p>
      </div>

      {viewTab === 'track' ? (
        <TrackView
          skus={skus}
          expandedGroups={expandedGroups}
          toggleGroup={toggleGroup}
          onSelectSku={setSelectedSku}
          setDrawerOpen={setDrawerOpen}
          updateSku={updateSku}
          setDiscoConfirmSku={setDiscoConfirmSku}
        />
      ) : (
        <AllSKUsTable
          skus={skus}
          filters={filters}
          setFilters={setFilters}
          onSelectSku={setSelectedSku}
          setDrawerOpen={setDrawerOpen}
        />
      )}

      {drawerOpen === 'notes' && selectedSku && (
        <NotesDrawer sku={selectedSku} onClose={handleDrawerClose} />
      )}

      {drawerOpen === 'milestones' && selectedSku && (
        <MilestoneDrawer sku={selectedSku} onClose={handleDrawerClose} />
      )}

      {discoConfirmSku && (
        <DiscoConfirmModal
          sku={discoConfirmSku}
          onCancel={() => setDiscoConfirmSku(null)}
          onConfirm={handleDiscoConfirm}
        />
      )}
    </div>
  )
}
