// ─── Activity ───────────────────────────────────────────────
// Every comment, note, meeting, email and status change on one timeline. This
// is the tab someone opens when the question is "what happened to this PO" and
// they do not yet know which kind of record holds the answer.

import { useState } from 'react'
import { CalendarClock, FileText, Loader2, Mail, MessageSquare, GitCommitHorizontal } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatLongDate } from '../oorFormat'

type Kind = 'comment' | 'note' | 'meeting' | 'email' | 'status'

interface Entry {
  id: string
  kind: Kind
  at: string
  actor: string | null
  summary: string
}

const KIND_META: Record<Kind, { label: string; icon: React.ElementType; tone: string }> = {
  comment: { label: 'Comment', icon: MessageSquare, tone: 'var(--accent-secondary)' },
  note: { label: 'Note', icon: FileText, tone: 'var(--text-secondary)' },
  meeting: { label: 'Meeting', icon: CalendarClock, tone: 'var(--warning)' },
  email: { label: 'Email', icon: Mail, tone: 'var(--info)' },
  status: { label: 'Change', icon: GitCommitHorizontal, tone: 'var(--success)' },
}

const ALL: Kind[] = ['comment', 'note', 'meeting', 'email', 'status']

export function ActivityTab({ lineId }: { lineId: string }) {
  const [kinds, setKinds] = useState<Kind[]>([])

  const activity = useQuery({
    queryKey: ['oor', 'activity', lineId, kinds],
    queryFn: async () => {
      const { data } = await api.get(`/operations/oor/lines/${lineId}/activity`, {
        params: kinds.length ? { kind: kinds.join(',') } : {},
      })
      return data as { rows: Entry[]; total: number }
    },
  })

  const toggle = (k: Kind) => setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {ALL.map((k) => {
          const active = kinds.includes(k)
          const meta = KIND_META[k]
          const Icon = meta.icon
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              aria-pressed={active}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px]"
              style={{
                background: active ? 'var(--accent-secondary-light)' : 'transparent',
                border: `1px solid ${active ? 'var(--accent-secondary)' : 'var(--border-default)'}`,
                color: active ? 'var(--accent-secondary)' : 'var(--text-secondary)',
              }}
            >
              <Icon size={11} /> {meta.label}
            </button>
          )
        })}
      </div>

      {activity.isLoading ? (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
          <Loader2 size={13} className="animate-spin" /> Loading history…
        </div>
      ) : (activity.data?.rows.length ?? 0) === 0 ? (
        <div className="text-[13px] py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
          Nothing has happened on this line yet.
        </div>
      ) : (
        <div style={{ borderLeft: '2px solid var(--border-default)', paddingLeft: 14, marginLeft: 6 }}>
          {activity.data!.rows.map((e) => {
            const meta = KIND_META[e.kind]
            const Icon = meta.icon
            return (
              <div key={`${e.kind}-${e.id}`} className="relative py-2">
                <span
                  className="absolute flex items-center justify-center rounded-full"
                  style={{ left: -22, top: 10, width: 16, height: 16, background: 'var(--bg-base)', color: meta.tone }}
                >
                  <Icon size={11} />
                </span>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{formatLongDate(e.at)}</span>
                  <span className="text-[11px]" style={{ color: meta.tone }}>{meta.label}</span>
                  {e.actor ? <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>· {e.actor}</span> : null}
                </div>
                <div className="text-[13px] leading-snug" style={{ color: 'var(--text-secondary)' }}>{e.summary}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
