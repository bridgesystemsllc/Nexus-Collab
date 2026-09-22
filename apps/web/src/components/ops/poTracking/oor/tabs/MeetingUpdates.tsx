// ─── Meeting updates ────────────────────────────────────────
// Structured on purpose: decision, next action, owner, due date. An overdue
// next action badges the line back in the grid, which is the whole reason this
// is a record type rather than another comment — a decision nobody carried out
// should surface itself without anyone remembering to look.

import { useState } from 'react'
import { AlertTriangle, Clock, Loader2 } from 'lucide-react'
import { isTouchBaseDue, TOUCH_BASE_CADENCE, type OorRiskLevel } from '@nexus/shared'
import { useOorCollection, useOorMutations } from '../useOorQueries'
import { ThreadComposer } from '../ThreadComposer'
import { Pill } from '../OorPills'
import { formatLongDate, daysUntil } from '../oorFormat'

interface MeetingUpdate {
  id: string
  meetingDate: string
  meetingTitle: string | null
  attendees: string[]
  decision: string | null
  nextAction: string | null
  ownerId: string | null
  dueDate: string | null
  status: string
  body: string | null
}

interface MeetingUpdatesTabProps {
  lineId: string
  riskLevel?: OorRiskLevel | string
}

export function MeetingUpdatesTab({ lineId, riskLevel }: MeetingUpdatesTabProps) {
  const updates = useOorCollection<MeetingUpdate>(lineId, 'meeting-updates')
  const { addRecord } = useOorMutations(lineId)
  const [loggingTouchBase, setLoggingTouchBase] = useState(false)

  // Determine last meeting date for touch-base calculation
  const lastMeetingAt = updates.data?.rows?.[0]?.meetingDate ?? null
  const touchBaseDue = riskLevel ? isTouchBaseDue({
    riskLevel: riskLevel as OorRiskLevel,
    lastMeetingAt,
  }) : false
  const cadenceDays = TOUCH_BASE_CADENCE[(riskLevel as OorRiskLevel) ?? 'on_track'] ?? 7

  // Log a touch-base meeting update with pre-filled defaults
  const logTouchBase = async () => {
    setLoggingTouchBase(true)
    try {
      const today = new Date()
      const dueDate = new Date(today.getTime() + cadenceDays * 24 * 60 * 60 * 1000)
      await addRecord.mutateAsync({
        path: 'meeting-updates',
        body: {
          meetingDate: today.toISOString().slice(0, 10),
          meetingTitle: 'Touch-base check-in',
          attendees: [],
          nextAction: 'Follow up on status',
          dueDate: dueDate.toISOString().slice(0, 10),
        },
      })
    } finally {
      setLoggingTouchBase(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Touch-base due alert with quick-log CTA */}
      {touchBaseDue && (
        <div
          className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
          style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)' }}
        >
          <div className="flex items-center gap-2">
            <Clock size={14} style={{ color: 'var(--warning)' }} />
            <span className="text-[13px] font-medium" style={{ color: 'var(--warning)' }}>
              Touch base due
            </span>
            <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
              — {riskLevel === 'critical' ? 'weekly' : 'biweekly'} check-in required
            </span>
          </div>
          <button
            type="button"
            onClick={logTouchBase}
            disabled={loggingTouchBase}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium"
            style={{
              background: 'var(--warning)',
              color: '#fff',
              opacity: loggingTouchBase ? 0.6 : 1,
            }}
          >
            {loggingTouchBase ? 'Logging…' : 'Log touch-base'}
          </button>
        </div>
      )}

      <ThreadComposer
        fields={[
          { name: 'meetingDate', label: 'Meeting date', type: 'date', required: true },
          { name: 'meetingTitle', label: 'Meeting', type: 'text', placeholder: 'Ops sync' },
          { name: 'attendees', label: 'Attendees', type: 'text', placeholder: 'Comma separated', full: true },
          { name: 'decision', label: 'Decision', type: 'textarea', rows: 2 },
          { name: 'nextAction', label: 'Next action', type: 'text' },
          { name: 'dueDate', label: 'Due', type: 'date' },
        ]}
        submitLabel="Log meeting"
        hint="An overdue next action badges this line back in the grid."
        onSubmit={async (values) => {
          await addRecord.mutateAsync({
            path: 'meeting-updates',
            body: {
              meetingDate: values.meetingDate,
              meetingTitle: values.meetingTitle || undefined,
              attendees: (values.attendees ?? '').split(',').map((a) => a.trim()).filter(Boolean),
              decision: values.decision || undefined,
              nextAction: values.nextAction || undefined,
              dueDate: values.dueDate || undefined,
            },
          })
        }}
      />

      {updates.isLoading ? (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
          <Loader2 size={13} className="animate-spin" /> Loading meeting updates…
        </div>
      ) : (updates.data?.rows.length ?? 0) === 0 ? (
        <div className="text-[13px] py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
          No meeting updates logged against this line.
        </div>
      ) : (
        <div className="space-y-2">
          {updates.data!.rows.map((m) => {
            const days = m.dueDate ? daysUntil(m.dueDate) : null
            const overdue = m.status === 'open' && days !== null && days < 0
            return (
              <div
                key={m.id}
                className="rounded-xl px-3 py-2.5"
                style={{ background: 'var(--bg-surface)', border: `1px solid ${overdue ? 'var(--danger)' : 'var(--border-default)'}` }}
              >
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {m.meetingTitle ?? 'Meeting'}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{formatLongDate(m.meetingDate)}</span>
                  {m.status !== 'open' ? <Pill tone="success">{m.status.replace('_', ' ')}</Pill> : null}
                  {overdue ? <Pill tone="danger" icon={AlertTriangle}>Overdue</Pill> : null}
                </div>
                {m.attendees?.length ? (
                  <div className="text-[11px] mb-1" style={{ color: 'var(--text-tertiary)' }}>{m.attendees.join(', ')}</div>
                ) : null}
                {m.decision ? (
                  <div className="text-[13px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Decision: </span>{m.decision}
                  </div>
                ) : null}
                {m.nextAction ? (
                  <div className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Next: </span>{m.nextAction}
                    {m.dueDate ? (
                      <span style={{ color: overdue ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                        {' '}— due {formatLongDate(m.dueDate)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
