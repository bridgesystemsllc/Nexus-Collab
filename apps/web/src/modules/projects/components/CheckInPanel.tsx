import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Clock, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate } from './ProjectCard'

// ─── Check-ins ───────────────────────────────────────────────
// Four questions, deliberately. Progress, blockers, what you need from other
// departments, confidence. Anything longer does not get filled out, and an
// unanswered check-in is worth less than a short one.

type Confidence = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'

const CONFIDENCE: { value: Confidence; label: string; color: string }[] = [
  { value: 'ON_TRACK', label: 'On track', color: 'var(--success)' },
  { value: 'AT_RISK', label: 'At risk', color: 'var(--warning)' },
  { value: 'OFF_TRACK', label: 'Off track', color: 'var(--danger)' },
]

interface Checkin {
  id: string
  departmentId: string | null
  status: 'PENDING' | 'RESPONDED' | 'OVERDUE' | 'SKIPPED'
  requestedAt: string
  dueAt: string
  respondedAt: string | null
  progressSummary: string | null
  blockers: string | null
  needsFromOthers: string | null
  confidence: Confidence | null
  department?: { id: string; name: string; color?: string | null } | null
  respondent?: { id: string; name: string } | null
}

interface ComplianceRow {
  departmentId: string
  department: string
  asked: number
  answered: number
  rate: number
}

export function CheckInPanel({
  projectId, canRequest,
}: { projectId: string; canRequest: boolean }) {
  const qc = useQueryClient()
  const [answering, setAnswering] = useState<Checkin | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['projects', 'checkins', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/checkins`)).data,
  })

  const request = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/checkins/request`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
    onError: (err: any) =>
      setError(err?.response?.data?.error?.message ?? 'Could not request a check-in'),
  })

  const checkins: Checkin[] = data?.data ?? []
  const compliance: ComplianceRow[] = data?.meta?.compliance ?? []
  const nextLabel: string | null = data?.meta?.nextCheckinLabel ?? null
  const cadence: string = data?.meta?.cadence ?? 'WEEKLY'

  const outstanding = checkins.filter((c) => c.status === 'PENDING' || c.status === 'OVERDUE')
  const answered = checkins.filter((c) => c.status === 'RESPONDED')

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">Loading check-ins…</p>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,69,58,0.08)' }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
            <span className="flex-1 text-[var(--text-primary)]">{error}</span>
            <button onClick={() => setError(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">Dismiss</button>
          </div>
        )}

        {/* Outstanding */}
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-xs font-medium text-[var(--text-primary)]">Awaiting a response</h3>
            {canRequest && (
              <button
                onClick={() => { setError(null); request.mutate() }}
                disabled={request.isPending}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white disabled:opacity-50 transition-all active:scale-[0.98]"
                style={{ background: 'var(--accent-secondary)' }}
              >
                <Send size={11} />
                {request.isPending ? 'Requesting…' : 'Request now'}
              </button>
            )}
          </div>

          {outstanding.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">
              Nothing outstanding. {nextLabel ? `Next check-in ${nextLabel}.` : 'No cadence set.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {outstanding.map((c) => {
                const overdue = c.status === 'OVERDUE'
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                    style={{
                      borderColor: overdue ? 'var(--danger)' : 'var(--border-subtle)',
                      background: overdue ? 'rgba(255,69,58,0.05)' : undefined,
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--text-primary)]">
                        {c.department?.name ?? 'All hands'}
                      </p>
                      <p className="text-[11px] flex items-center gap-1" style={{ color: overdue ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                        <Clock size={10} />
                        {overdue ? 'Overdue — was due' : 'Due'} {formatDate(c.dueAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => setAnswering(c)}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
                    >
                      Respond
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* History */}
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
          <h3 className="text-xs font-medium text-[var(--text-primary)] mb-3">Response history</h3>
          {answered.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">No check-ins answered yet.</p>
          ) : (
            <ol className="space-y-3">
              {answered.map((c) => {
                const tone = CONFIDENCE.find((x) => x.value === c.confidence)
                return (
                  <li key={c.id} className="border-l-2 pl-3" style={{ borderColor: tone?.color ?? 'var(--border-default)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-[var(--text-primary)]">
                        {c.department?.name ?? 'All hands'}
                        {tone && (
                          <span className="ml-2 font-normal" style={{ color: tone.color }}>{tone.label}</span>
                        )}
                      </p>
                      <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">
                        {formatDate(c.respondedAt)}
                        {c.respondent ? ` · ${c.respondent.name}` : ''}
                      </span>
                    </div>
                    {c.progressSummary && (
                      <p className="text-xs text-[var(--text-secondary)] mt-1 whitespace-pre-wrap">{c.progressSummary}</p>
                    )}
                    {c.blockers && (
                      <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>
                        <strong>Blocked:</strong> {c.blockers}
                      </p>
                    )}
                    {c.needsFromOthers && (
                      <p className="text-xs text-[var(--text-secondary)] mt-1">
                        <strong>Needs:</strong> {c.needsFromOthers}
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>

      {/* Compliance — the number that shows which lane actually engages */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 h-fit">
        <h3 className="text-xs font-medium text-[var(--text-primary)] mb-1">Compliance</h3>
        <p className="text-[11px] text-[var(--text-tertiary)] mb-3">
          {cadence.toLowerCase()} cadence{nextLabel ? ` · next ${nextLabel}` : ''}
        </p>
        {compliance.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">No check-ins requested yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {compliance.map((row) => (
              <li key={row.departmentId}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[var(--text-primary)]">{row.department}</span>
                  <span className="tabular-nums text-[var(--text-secondary)]">
                    {row.answered}/{row.asked}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--bg-overlay)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${row.rate}%`,
                      background: row.rate >= 80 ? 'var(--success)' : row.rate >= 50 ? 'var(--warning)' : 'var(--danger)',
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {answering && (
        <CheckInResponseForm
          checkin={answering}
          onClose={() => setAnswering(null)}
          onDone={() => { setAnswering(null); qc.invalidateQueries({ queryKey: ['projects'] }) }}
        />
      )}
    </div>
  )
}

function CheckInResponseForm({
  checkin, onClose, onDone,
}: { checkin: Checkin; onClose: () => void; onDone: () => void }) {
  const [progressSummary, setProgress] = useState('')
  const [blockers, setBlockers] = useState('')
  const [needsFromOthers, setNeeds] = useState('')
  const [confidence, setConfidence] = useState<Confidence | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/projects/checkins/${checkin.id}/respond`, {
        ...(progressSummary.trim() ? { progressSummary: progressSummary.trim() } : {}),
        ...(blockers.trim() ? { blockers: blockers.trim() } : {}),
        ...(needsFromOthers.trim() ? { needsFromOthers: needsFromOthers.trim() } : {}),
        confidence,
      }),
    onSuccess: onDone,
    onError: (err: any) =>
      setError(err?.response?.data?.error?.message ?? 'Could not submit your response'),
  })

  const field =
    'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-secondary)]'
  const label = 'block text-xs font-medium text-[var(--text-secondary)] mb-1.5'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Check-in response"
      >
        <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {checkin.department?.name ?? 'All hands'} check-in
          </h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            Due {formatDate(checkin.dueAt)} · four questions, keep it short
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className={label} htmlFor="ci-progress">Progress since last check-in</label>
            <textarea id="ci-progress" className={field} rows={3} value={progressSummary} onChange={(e) => setProgress(e.target.value)} autoFocus />
          </div>
          <div>
            <label className={label} htmlFor="ci-blockers">Blockers</label>
            <textarea id="ci-blockers" className={field} rows={2} value={blockers} onChange={(e) => setBlockers(e.target.value)} placeholder="Leave empty if nothing is blocked" />
          </div>
          <div>
            <label className={label} htmlFor="ci-needs">What you need from other departments</label>
            <textarea id="ci-needs" className={field} rows={2} value={needsFromOthers} onChange={(e) => setNeeds(e.target.value)} />
          </div>
          <div>
            <span className={label}>Confidence</span>
            <div className="flex items-center gap-2">
              {CONFIDENCE.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setConfidence(c.value)}
                  className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all"
                  style={
                    confidence === c.value
                      ? { borderColor: c.color, background: `${c.color}14`, color: c.color }
                      : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }
                  }
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,69,58,0.08)' }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
              <span className="text-[var(--text-primary)]">{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-subtle)]">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Cancel
          </button>
          <button
            onClick={() => { setError(null); submit.mutate() }}
            // Confidence is the one field that must be answered: it is the
            // signal the rollup reads, and prose alone cannot be aggregated.
            disabled={!confidence || submit.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40 transition-all active:scale-[0.98]"
            style={{ background: 'var(--accent-secondary)' }}
          >
            <CheckCircle2 size={13} />
            {submit.isPending ? 'Sending…' : 'Submit check-in'}
          </button>
        </div>
      </div>
    </div>
  )
}
