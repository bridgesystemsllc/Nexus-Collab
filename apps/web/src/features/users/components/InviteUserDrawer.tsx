import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Copy, RotateCcw, X } from 'lucide-react'
import { inviteUserSchema, fieldErrors } from '@nexus/shared'
import { useModalBehaviour } from '@/modules/projects/lib/useModalBehaviour'
import {
  ApiError, inviteUser, fetchMe, fetchDepartments,
  type ApiFieldErrors, type InviteResponse,
} from '../api/usersApi'
import { PermissionPreview } from './PermissionPreview'

// ─── Invite ──────────────────────────────────────────────────
// A right-side drawer, not a modal (§7.2) — the permission preview needs
// vertical room, and a centred dialog would either scroll or crop it.
//
// The role select offers only roles the actor may actually grant. The server
// enforces the rank rule regardless; offering an option that will be refused
// on submit is a worse way to teach the rule.

interface Props {
  onClose: () => void
  onInvited: (result: InviteResponse) => void
}

export function InviteUserDrawer({ onClose, onInvited }: Props) {
  const ref = useModalBehaviour<HTMLElement>(onClose)
  const qc = useQueryClient()

  const [form, setForm] = useState({
    email: '', firstName: '', lastName: '', roleId: '', departmentId: '', message: '',
  })
  const [errors, setErrors] = useState<ApiFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  /// Set when the address belongs to a deactivated account — the server's
  /// reactivate suggestion, surfaced as an action instead of a dead end.
  const [reactivate, setReactivate] = useState<{ memberId: string; name: string } | null>(null)

  const me = useQuery({ queryKey: ['rbac', 'me'], queryFn: fetchMe })
  const departments = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments, staleTime: 5 * 60_000 })

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    // Clear the field's error as soon as it is touched: leaving a stale message
    // under an input the user is actively fixing reads as unresponsive.
    if (errors[k]) setErrors(({ [k]: _, ...rest }) => rest)
    if (k === 'email') setReactivate(null)
  }

  const invite = useMutation({
    mutationFn: () =>
      inviteUser({
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        roleId: form.roleId,
        departmentId: form.departmentId || null,
        ...(form.message.trim() ? { message: form.message.trim() } : {}),
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      onInvited(result)
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? {})
        setFormError(err.fields ? null : err.message)
        if (err.extra.suggestion === 'reactivate') {
          setReactivate({
            memberId: String(err.extra.memberId),
            name: String(err.extra.name ?? 'that person'),
          })
        }
        return
      }
      setFormError('Something went wrong.')
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setReactivate(null)

    // The same schema the server uses. Catching it here means the common
    // mistakes never cost a round trip, and the messages match exactly.
    const parsed = inviteUserSchema.safeParse({
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      roleId: form.roleId,
      departmentId: form.departmentId || undefined,
      ...(form.message.trim() ? { message: form.message.trim() } : {}),
    })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    invite.mutate()
  }

  const roles = me.data?.assignableRoles ?? []
  const field =
    'w-full rounded-lg border bg-[var(--bg-surface)] px-2.5 py-2 text-xs text-[var(--text-primary)] transition-colors focus:outline-none'
  const borderFor = (k: string) =>
    errors[k] ? { borderColor: 'var(--danger)' } : { borderColor: 'var(--border)' }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(0,0,0,0.28)' }}
      onClick={onClose}
      role="presentation"
    >
      <aside
        ref={ref}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col border-l bg-[var(--bg-surface)]"
        style={{ borderColor: 'var(--border)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Invite a user"
      >
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Invite someone</h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
              They sign in with their Microsoft account — there is no password to set.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
          >
            <X size={15} />
          </button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {formError && (
              <div role="alert" className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11px]" style={{ background: 'rgba(216,53,42,0.08)' }}>
                <AlertTriangle size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
                <span className="text-[var(--text-primary)]">{formError}</span>
              </div>
            )}

            {reactivate && (
              <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: 'var(--warning)', background: 'rgba(199,119,0,0.06)' }}>
                <p className="text-[11px] text-[var(--text-primary)]">
                  <b>{reactivate.name}</b> already has a deactivated account with this address.
                </p>
                <button
                  type="button"
                  onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('nexus:open-user', { detail: reactivate.memberId })) }}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium"
                  style={{ color: 'var(--accent)' }}
                >
                  <RotateCcw size={11} /> Open their profile to reactivate
                </button>
              </div>
            )}

            <Field label="Email" error={errors.email} required>
              <input
                type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                autoFocus className={field} style={borderFor('email')} placeholder="name@company.com"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label="First name" error={errors.firstName} required>
                <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} className={field} style={borderFor('firstName')} />
              </Field>
              <Field label="Last name" error={errors.lastName} required>
                <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} className={field} style={borderFor('lastName')} />
              </Field>
            </div>

            <Field label="Role" error={errors.roleId} required>
              <select value={form.roleId} onChange={(e) => set('roleId', e.target.value)} className={field} style={borderFor('roleId')}>
                <option value="">Choose a role…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {me.isSuccess && roles.length === 0 && (
                <span className="mt-1 block text-[10px] text-[var(--text-tertiary)]">
                  You cannot grant any role — only roles below your own can be assigned.
                </span>
              )}
            </Field>

            {/* The point of the drawer. Updates the moment the select changes,
                before anything is saved. */}
            <PermissionPreview roleId={form.roleId || null} />

            <Field label="Department" error={errors.departmentId}>
              <select value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)} className={field} style={borderFor('departmentId')}>
                <option value="">No department</option>
                {(departments.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>

            <Field label="Personal message" error={errors.message}>
              <textarea
                value={form.message} onChange={(e) => set('message', e.target.value)}
                rows={2} className={`${field} resize-y`} style={borderFor('message')}
                placeholder="Optional — included in the invitation."
              />
            </Field>
          </div>

          <footer className="flex items-center justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button" onClick={onClose}
              className="rounded-lg border px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              style={{ borderColor: 'var(--border)' }}
            >
              Cancel
            </button>
            <button
              type="submit" disabled={invite.isPending}
              className="rounded-lg px-3 py-2 text-xs font-medium text-white transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {invite.isPending ? 'Sending…' : 'Send invitation'}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  )
}

function Field({
  label, error, required, children,
}: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  // The control is nested inside the label so the association is implicit —
  // a <label> merely adjacent to an input names nothing, and a screen reader
  // reads the field as unlabelled.
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
        {label}
        {required && <span style={{ color: 'var(--danger)' }}> *</span>}
      </span>
      {children}
      {/* Inline, under the field. Only true server failures use a toast (§7.3). */}
      {error && <span className="mt-1 block text-[10px]" style={{ color: 'var(--danger)' }} role="alert">{error}</span>}
    </label>
  )
}

/** Shown after a successful invite while email is unconfigured. */
export function InviteResultBanner({ result, onDismiss }: { result: InviteResponse; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  const url = result.meta.acceptUrl
  if (!url) return null

  return (
    <div className="flex items-start gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--warning)', background: 'rgba(199,119,0,0.06)' }}>
      <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-[var(--text-primary)]">
          Invitation created, but email is not configured — it was not sent.
        </p>
        <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
          Send this link to {result.data.invitation.email} yourself. It is single-use and expires in 7 days.
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded bg-[var(--bg-subtle)] px-1.5 py-1 text-[10px] text-[var(--text-secondary)]">
            {url}
          </code>
          <button
            onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[10px] text-[var(--text-secondary)]"
            style={{ borderColor: 'var(--border)' }}
          >
            {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
          </button>
        </div>
      </div>
      <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
        <X size={13} />
      </button>
    </div>
  )
}
