import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Monitor, ShieldCheck } from 'lucide-react'
import { ApiError } from '@/features/users/api/usersApi'
import { fetchSessions, signOutOthers, type MeBundle } from '../api/settingsApi'
import { Section, Alert } from '../components/SettingsPrimitives'

/**
 * "in 6 days".
 *
 * `relativeTime` in the users module reads backwards from now and answers
 * "Just now" for anything in the future, which is every session expiry.
 */
function untilTime(iso: string): string {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
  if (mins <= 0) return 'now'
  if (mins < 60) return `in ${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}

// ─── Security ────────────────────────────────────────────────
// There is no password to change: Nexus signs in through Microsoft Entra, and
// the credential lives there. What is actually under this account's control is
// which sessions are alive, so that is what this section is about.

export function SecuritySection({ me }: { me: MeBundle }) {
  const qc = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sessions = useQuery({ queryKey: ['me', 'sessions'], queryFn: fetchSessions })

  const signOut = useMutation({
    mutationFn: signOutOthers,
    onSuccess: (r) => {
      setMessage(
        r.data.revoked === 0
          ? 'You were not signed in anywhere else.'
          : `Signed out of ${r.data.revoked} other session${r.data.revoked === 1 ? '' : 's'}.`,
      )
      setError(null)
      qc.invalidateQueries({ queryKey: ['me', 'sessions'] })
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not sign out the other sessions.'),
  })

  const [showAll, setShowAll] = useState(false)
  const rows = sessions.data ?? []
  const others = rows.filter((s) => !s.isCurrent).length
  // Sessions accumulate — every sign-in on every device leaves one until it
  // expires. Fifty identical rows is not information; the count plus a way to
  // end them is.
  const VISIBLE = 8
  const shown = showAll ? rows : rows.slice(0, VISIBLE)

  return (
    <div className="space-y-4">
      <Section title="How you sign in" description="Identity comes from Microsoft Entra, so there is no Nexus password.">
        <div className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <ShieldCheck size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
          <div>
            <p className="text-xs text-[var(--text-primary)]">Microsoft single sign-on</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
              Password changes, multi-factor and device policy are set in Microsoft 365, not here.
              Signed in as {me.profile.email}.
            </p>
          </div>
        </div>

        {/* §11 leaves MFA out of this build but asks for the hook. Saying so is
            better than a toggle that does nothing. */}
        <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-dashed px-3 py-2.5" style={{ borderColor: 'var(--border-strong)' }}>
          <KeyRound size={15} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
          <div>
            <p className="text-xs text-[var(--text-primary)]">Two-factor authentication</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
              Enforced by your Microsoft tenant policy today. A Nexus-level second factor is not
              built yet.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Active sessions"
        description="Every browser currently signed in as you."
        action={
          others > 0 ? (
            <button
              onClick={() => { setMessage(null); setError(null); signOut.mutate() }}
              disabled={signOut.isPending}
              className="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{ borderColor: 'var(--border-default)', color: 'var(--danger)' }}
            >
              {signOut.isPending ? 'Signing out…' : `Sign out ${others} other${others === 1 ? '' : 's'}`}
            </button>
          ) : undefined
        }
      >
        {error && <div className="mb-3"><Alert>{error}</Alert></div>}
        {message && (
          <p role="status" className="mb-3 text-[11px] text-[var(--text-secondary)]">{message}</p>
        )}

        {sessions.isLoading ? (
          <div className="space-y-1.5" aria-busy="true">
            {[0, 1].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
          </div>
        ) : sessions.isError ? (
          <Alert>Could not read your sessions.</Alert>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--text-tertiary)]">No sessions on record.</p>
        ) : (
          <ul className="space-y-1.5">
            {shown.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                style={{ borderColor: s.isCurrent ? 'var(--accent)' : 'var(--border-default)' }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Monitor size={13} className="shrink-0 text-[var(--text-tertiary)]" />
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--text-primary)]">
                      {s.isCurrent ? 'This browser' : 'Another browser'}
                    </p>
                    {/* The session store keeps no user agent, so claiming a
                        device name here would be invention. The expiry is the
                        one honest fact available. */}
                    <p className="text-[10px] text-[var(--text-tertiary)]">
                      Expires {untilTime(s.expiresAt)} · {s.id.slice(0, 8)}…
                    </p>
                  </div>
                </div>
                {s.isCurrent && (
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ color: 'var(--accent)', background: 'var(--accent-subtle)' }}>
                    Current
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {rows.length > VISIBLE && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="mt-2 text-[11px] font-medium"
            style={{ color: 'var(--accent)' }}
          >
            {showAll ? 'Show fewer' : `Show all ${rows.length} sessions`}
          </button>
        )}

        <p className="mt-3 text-[10px] text-[var(--text-tertiary)]">
          Signing out the others leaves this browser signed in — ending the session you are using
          to do it would lose the page you are on.
        </p>
      </Section>
    </div>
  )
}
