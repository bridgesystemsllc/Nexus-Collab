import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell, KeyRound, ScrollText, ShieldCheck, SlidersHorizontal, User,
} from 'lucide-react'
import { ApiError } from '@/features/users/api/usersApi'
import { fetchMeBundle, verifyEmailChange } from '../api/settingsApi'
import { Alert, SectionSkeleton } from '../components/SettingsPrimitives'
import { AccountSection } from '../sections/AccountSection'
import { PreferencesSection } from '../sections/PreferencesSection'
import { NotificationsSection } from '../sections/NotificationsSection'
import { SecuritySection } from '../sections/SecuritySection'
import { AccessSection } from '../sections/AccessSection'
import { AuditSection } from '../sections/AuditSection'

// ─── Settings ────────────────────────────────────────────────
// Six sections behind one fetch. The sections that only concern you are always
// present; the two that concern the workspace appear only for people who can
// act on them — a read-only Access screen is a screen that teaches nothing.

type SectionKey = 'account' | 'preferences' | 'notifications' | 'security' | 'access' | 'audit'

interface SectionDef {
  key: SectionKey
  label: string
  icon: typeof User
  /// Undefined means everyone.
  permission?: string
}

const SECTIONS: SectionDef[] = [
  { key: 'account', label: 'Account', icon: User },
  { key: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'security', label: 'Security', icon: ShieldCheck },
  { key: 'access', label: 'Access & permissions', icon: KeyRound, permission: 'roles:read' },
  { key: 'audit', label: 'Audit log', icon: ScrollText, permission: 'audit:read' },
]

export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMeBundle })

  // Same contract as the People directory: the page names itself in the URL so
  // a refresh comes back here, and the open section rides along so a link to
  // "Settings → Notifications" is a real link.
  useEffect(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('view', 'settings')
      return next
    }, { replace: true })
    return () => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('view')
        next.delete('section')
        return next
      }, { replace: true })
    }
  }, [setParams])

  const held = new Set((me.data?.permissions ?? []).map((p) => p.key))
  const visible = SECTIONS.filter((s) => !s.permission || held.has(s.permission))

  const requested = params.get('section') as SectionKey | null
  const active = visible.find((s) => s.key === requested)?.key ?? 'account'

  const go = (key: SectionKey) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    next.set('section', key)
    return next
  })

  return (
    <div className="projects-module mx-auto max-w-[1100px] space-y-4 p-6">
      <header>
        <h1 className="display-type text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Settings
        </h1>
        <p className="text-sm text-[var(--text-tertiary)]">
          Your account, how Nexus behaves for you, and — if you administer this workspace — who can
          do what
        </p>
      </header>

      <EmailConfirmationHandler />

      {/* No role at all means the permission catalogue was never seeded — every
          guard refuses and the admin sections silently disappear. Silently is
          the problem: an admin sees a Settings page missing half its contents
          with nothing to explain why. */}
      {me.isSuccess && !me.data.profile.role && (
        <Alert tone="warning">
          <p className="font-medium">This workspace has no roles set up yet.</p>
          <p className="mt-0.5 leading-relaxed">
            You have not been assigned a role, so Access &amp; permissions and the Audit log are
            hidden and nothing here can grant them. Restarting the API repairs this automatically;
            an administrator can also run{' '}
            <code className="rounded bg-[var(--bg-subtle)] px-1 py-0.5">pnpm db:seed:rbac</code>.
          </p>
        </Alert>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <nav className="lg:w-52 lg:shrink-0" aria-label="Settings sections">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {visible.map((s) => {
              const Icon = s.icon
              const on = s.key === active
              return (
                <li key={s.key}>
                  <button
                    onClick={() => go(s.key)}
                    aria-current={on ? 'page' : undefined}
                    className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors"
                    style={on
                      ? { background: 'var(--accent-subtle)', color: 'var(--accent)' }
                      : { color: 'var(--text-secondary)' }}
                  >
                    <Icon size={14} /> {s.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          {me.isLoading ? (
            <SectionSkeleton />
          ) : me.isError || !me.data ? (
            <Alert>Could not load your settings.</Alert>
          ) : (
            <>
              {active === 'account' && <AccountSection me={me.data} />}
              {active === 'preferences' && <PreferencesSection key={me.dataUpdatedAt} me={me.data} />}
              {active === 'notifications' && <NotificationsSection key={me.dataUpdatedAt} me={me.data} />}
              {active === 'security' && <SecuritySection me={me.data} />}
              {active === 'access' && <AccessSection me={me.data} />}
              {active === 'audit' && <AuditSection />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Completes an email change when the confirmation link is opened.
 *
 * The link is a plain URL sent to the new address, so it arrives as a page
 * load with a token in the query string rather than as a click inside the app.
 * The token is stripped from the URL as soon as it is used — leaving it there
 * puts it in the browser history and in whatever the next page shares.
 */
function EmailConfirmationHandler() {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const token = params.get('token')

  const verify = useMutation({
    mutationFn: (t: string) => verifyEmailChange(t),
    onSettled: () => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('token')
        return next
      }, { replace: true })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })

  useEffect(() => {
    if (token && verify.isIdle) verify.mutate(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (verify.isPending) {
    return <p className="text-xs text-[var(--text-tertiary)]">Confirming your new email address…</p>
  }
  if (verify.isSuccess) {
    return (
      <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--success)', background: 'rgba(30,158,90,0.06)' }}>
        Your email address is now <b>{verify.data.data.email}</b>.
      </div>
    )
  }
  if (verify.isError) {
    return (
      <Alert>
        {verify.error instanceof ApiError
          ? verify.error.message
          : 'That confirmation link could not be used.'}
      </Alert>
    )
  }
  return null
}
