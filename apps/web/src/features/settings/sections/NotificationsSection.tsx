import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/features/users/api/usersApi'
import {
  updateNotifications, updatePreferences,
  type MeBundle, type NotificationCell,
} from '../api/settingsApi'
import { Section, SaveRow, Alert, Toggle } from '../components/SettingsPrimitives'

// ─── Notifications ───────────────────────────────────────────
// A matrix: one row per event, one column per channel. The alternative — a
// flat list of 24 toggles — makes it impossible to answer "what will email
// me?" without reading all of them.

const CHANNELS: { key: NotificationCell['channel']; label: string; hint: string }[] = [
  { key: 'in_app', label: 'In app', hint: 'The bell in the top bar.' },
  { key: 'email', label: 'Email', hint: 'Sent as it happens.' },
  { key: 'digest', label: 'Digest', hint: 'Batched into one summary.' },
]

const EVENT_LABELS: Record<string, { label: string; description: string }> = {
  task_assigned: { label: 'A task is assigned to me', description: 'Someone puts work in your name.' },
  task_due_soon: { label: 'A task of mine is due soon', description: '24 hours before the due date.' },
  task_overdue: { label: 'A task of mine is overdue', description: 'Once, the morning after.' },
  mention: { label: 'Someone mentions me', description: 'In a comment, task or document.' },
  comment_reply: { label: 'Someone replies to me', description: 'A direct reply to your comment.' },
  project_status_change: { label: 'A project I am on changes status', description: 'On track, at risk, blocked, complete.' },
  approval_requested: { label: 'Something needs my approval', description: 'You are the named approver.' },
  weekly_summary: { label: 'Weekly summary', description: 'What moved across everything you follow.' },
}

const keyOf = (c: NotificationCell) => `${c.channel}:${c.eventKey}`

export function NotificationsSection({ me }: { me: MeBundle }) {
  const qc = useQueryClient()
  const initial = me.notifications
  const [cells, setCells] = useState<NotificationCell[]>(initial)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const byKey = new Map(cells.map((c) => [keyOf(c), c]))
  const initialByKey = new Map(initial.map((c) => [keyOf(c), c.enabled]))
  const dirty = cells.some((c) => initialByKey.get(keyOf(c)) !== c.enabled)

  const toggle = (channel: string, eventKey: string, enabled: boolean) => {
    setCells((prev) => prev.map((c) =>
      c.channel === channel && c.eventKey === eventKey ? { ...c, enabled } : c))
    setSaved(false)
  }

  const save = useMutation({
    // Only the changed cells are sent. Posting all 24 would rewrite rows the
    // user never touched, which is how a default silently becomes a pin.
    mutationFn: () => updateNotifications(
      cells
        .filter((c) => initialByKey.get(keyOf(c)) !== c.enabled)
        .map((c) => ({ channel: c.channel, eventKey: c.eventKey, enabled: c.enabled })),
    ),
    onSuccess: (r) => {
      setCells(r.data)
      setSaved(true)
      setError(null)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save your notification settings.'),
  })

  const digest = useMutation({
    mutationFn: (digestFrequency: 'off' | 'daily' | 'weekly') => updatePreferences({ digestFrequency }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })

  const events = [...new Set(initial.map((c) => c.eventKey))]

  return (
    <div className="space-y-4">
      <Section
        title="What Nexus tells you"
        description="One row per thing that can happen, one column per way of hearing about it."
      >
        {error && <div className="mb-3"><Alert>{error}</Alert></div>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border-default)' }}>
                <th className="pb-2 text-left text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                  Event
                </th>
                {CHANNELS.map((ch) => (
                  <th key={ch.key} className="w-20 pb-2 text-center">
                    <span className="block text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                      {ch.label}
                    </span>
                    <span className="block text-[9px] font-normal normal-case text-[var(--text-tertiary)]">
                      {ch.hint}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((eventKey) => {
                const meta = EVENT_LABELS[eventKey] ?? { label: eventKey, description: '' }
                return (
                  <tr key={eventKey} className="border-b last:border-0" style={{ borderColor: 'var(--border-default)' }}>
                    <td className="py-2.5 pr-4">
                      <p className="text-xs text-[var(--text-primary)]">{meta.label}</p>
                      {meta.description && (
                        <p className="text-[10px] text-[var(--text-tertiary)]">{meta.description}</p>
                      )}
                    </td>
                    {CHANNELS.map((ch) => {
                      const cell = byKey.get(`${ch.key}:${eventKey}`)
                      if (!cell) return <td key={ch.key} />
                      return (
                        <td key={ch.key} className="py-2.5 text-center">
                          <div className="flex justify-center">
                            <Toggle
                              checked={cell.enabled}
                              onChange={(v) => toggle(ch.key, eventKey, v)}
                              label={`${meta.label} — ${ch.label}`}
                            />
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <SaveRow
          dirty={dirty}
          saving={save.isPending}
          saved={saved}
          onSave={() => { setError(null); save.mutate() }}
          onReset={() => setCells(initial)}
        />
      </Section>

      <Section title="Digest" description="When the batched summary is sent. Individual events still follow the matrix above.">
        <div className="flex flex-wrap gap-1.5">
          {(['off', 'daily', 'weekly'] as const).map((f) => {
            const active = (me.preferences?.digestFrequency ?? 'daily') === f
            return (
              <button
                key={f}
                onClick={() => digest.mutate(f)}
                disabled={digest.isPending}
                aria-pressed={active}
                className="rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors disabled:opacity-50"
                style={
                  active
                    ? { background: 'var(--accent)', color: '#fff', borderColor: 'transparent' }
                    : { background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }
                }
              >
                {f === 'off' ? 'Never' : f}
              </button>
            )
          })}
        </div>
        {me.preferences?.digestFrequency === 'off' && (
          <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">
            Nothing in the Digest column will reach you while this is off.
          </p>
        )}
      </Section>
    </div>
  )
}
