// ─── Summary cards ──────────────────────────────────────────
// Five numbers that describe the whole filtered set, computed in SQL rather
// than from the visible page. Each one is also a filter: the question "how many
// are critical" and the action "show me those" are the same gesture.

import { AlertTriangle, Boxes, DollarSign, Layers, Lock } from 'lucide-react'
import type { OorSummary } from './useOorQueries'

export type StatKey = 'open' | 'value' | 'short' | 'critical' | 'awaiting'

const CARDS: {
  key: StatKey
  label: string
  icon: React.ElementType
  tone: string
  value: (s: OorSummary) => string
  filterable: boolean
}[] = [
  { key: 'open', label: 'Open lines', icon: Layers, tone: 'var(--text-secondary)', filterable: false,
    value: (s) => s.openLines.toLocaleString('en-US') },
  { key: 'value', label: 'Open value', icon: DollarSign, tone: 'var(--text-secondary)', filterable: false,
    value: (s) => s.openValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) },
  { key: 'short', label: 'Lines short', icon: Boxes, tone: 'var(--danger)', filterable: true,
    value: (s) => s.linesShort.toLocaleString('en-US') },
  { key: 'critical', label: 'Critical', icon: AlertTriangle, tone: 'var(--danger)', filterable: true,
    value: (s) => s.critical.toLocaleString('en-US') },
  { key: 'awaiting', label: 'Awaiting customer', icon: Lock, tone: 'var(--warning)', filterable: true,
    value: (s) => s.awaitingCustomerApproval.toLocaleString('en-US') },
]

export function OorStatCards({
  summary,
  active,
  onToggle,
  loading,
}: {
  summary: OorSummary | undefined
  active: StatKey | null
  onToggle: (key: StatKey) => void
  loading?: boolean
}) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {CARDS.map((card) => {
        const isActive = active === card.key
        const Icon = card.icon
        return (
          <button
            key={card.key}
            type="button"
            disabled={!card.filterable}
            aria-pressed={card.filterable ? isActive : undefined}
            onClick={() => card.filterable && onToggle(card.key)}
            className="oor-stat-card text-left rounded-xl px-4 py-3 transition-all"
            style={{
              background: isActive ? 'var(--accent-secondary-light)' : 'var(--bg-surface)',
              border: `1px solid ${isActive ? 'var(--accent-secondary)' : 'var(--border-default)'}`,
              cursor: card.filterable ? 'pointer' : 'default',
              opacity: loading && !summary ? 0.55 : 1,
            }}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <Icon size={13} style={{ color: card.tone }} strokeWidth={2.2} />
              <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                {card.label}
              </span>
            </div>
            <div
              className="text-[22px] leading-none font-semibold tabular-nums"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}
            >
              {summary ? card.value(summary) : '—'}
            </div>
          </button>
        )
      })}
    </div>
  )
}
