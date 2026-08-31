// ─── Meeting updates ────────────────────────────────────────
// Structured on purpose: decision, next action, owner, due date. An overdue
// next action badges the line back in the grid, which is the whole reason this
// is a record type rather than another comment — a decision nobody carried out
// should surface itself without anyone remembering to look.

import { AlertTriangle, Loader2 } from 'lucide-react'
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

export function MeetingUpdatesTab({ lineId }: { lineId: string }) {
  const updates = useOorCollection<MeetingUpdate>(lineId, 'meeting-updates')
  const { addRecord } = useOorMutations(lineId)

  return (
    <div className="space-y-3">
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
