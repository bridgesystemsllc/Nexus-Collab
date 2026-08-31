import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Mail, X } from 'lucide-react'
import { updateMeSchema, fieldErrors } from '@nexus/shared'
import { ApiError, type ApiFieldErrors } from '@/features/users/api/usersApi'
import {
  updateProfile, requestEmailChange, cancelEmailChange,
  type MeBundle, type EmailChangeResponse,
} from '../api/settingsApi'
import { Section, Field, SaveRow, Alert, inputClass, borderFor } from '../components/SettingsPrimitives'

// ─── Account ─────────────────────────────────────────────────
// Name, title, contact, timezone — and the email change, which is the only
// thing on this page that is not simply a field.

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Asia/Dubai', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'UTC',
]

const LOCALES = [
  { value: 'en-CA', label: 'English (Canada)' },
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'fr-CA', label: 'Français (Canada)' },
]

export function AccountSection({ me }: { me: MeBundle }) {
  const qc = useQueryClient()
  const p = me.profile

  const initial = {
    firstName: p.firstName,
    lastName: p.lastName,
    displayName: p.displayName ?? '',
    jobTitle: p.jobTitle ?? '',
    phone: p.phone ?? '',
    timezone: p.timezone,
    locale: p.locale,
  }

  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<ApiFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // The server is the source of truth. If it changed underneath — another tab,
  // a verified email — the form takes the new values rather than holding a
  // stale copy the user did not type.
  useEffect(() => { setForm(initial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [
    p.firstName, p.lastName, p.displayName, p.jobTitle, p.phone, p.timezone, p.locale,
  ])

  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => form[k] !== initial[k])

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setSaved(false)
    if (errors[k]) setErrors(({ [k]: _, ...rest }) => rest)
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        displayName: form.displayName.trim() || null,
        jobTitle: form.jobTitle.trim() || null,
        phone: form.phone.trim() || null,
        timezone: form.timezone,
        locale: form.locale,
      }
      const parsed = updateMeSchema.safeParse(payload)
      if (!parsed.success) {
        setErrors(fieldErrors(parsed.error))
        throw new Error('invalid')
      }
      return updateProfile(payload)
    },
    onSuccess: () => {
      setSaved(true)
      setFormError(null)
      qc.invalidateQueries({ queryKey: ['me'] })
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? {})
        setFormError(err.fields ? null : err.message)
      }
    },
  })

  return (
    <div className="space-y-4">
      <Section title="Your details" description="How you appear to everyone else in the workspace.">
        {formError && <div className="mb-3"><Alert>{formError}</Alert></div>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" error={errors.firstName}>
            <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} className={inputClass} style={borderFor(errors.firstName)} />
          </Field>
          <Field label="Last name" error={errors.lastName}>
            <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} className={inputClass} style={borderFor(errors.lastName)} />
          </Field>
          <Field label="Display name" error={errors.displayName} hint="Optional. Used instead of your full name where space is tight.">
            <input value={form.displayName} onChange={(e) => set('displayName', e.target.value)} className={inputClass} style={borderFor(errors.displayName)} />
          </Field>
          <Field label="Job title" error={errors.jobTitle}>
            <input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} className={inputClass} style={borderFor(errors.jobTitle)} />
          </Field>
          <Field label="Phone" error={errors.phone} hint="Spaces and brackets are fine.">
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} style={borderFor(errors.phone)} placeholder="+1 555 123 4567" />
          </Field>
          <Field label="Timezone" error={errors.timezone} hint="Deadlines and quiet hours are read in this zone.">
            <select value={form.timezone} onChange={(e) => set('timezone', e.target.value)} className={inputClass} style={borderFor(errors.timezone)}>
              {/* The stored value may not be in the shortlist — an admin can set
                  anything the tz database knows. Keep it rather than silently
                  reassigning someone to New York on their next save. */}
              {!TIMEZONES.includes(form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Language" error={errors.locale}>
            <select value={form.locale} onChange={(e) => set('locale', e.target.value)} className={inputClass} style={borderFor(errors.locale)}>
              {!LOCALES.some((l) => l.value === form.locale) && <option value={form.locale}>{form.locale}</option>}
              {LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </Field>
        </div>

        <SaveRow
          dirty={dirty}
          saving={save.isPending}
          saved={saved}
          onSave={() => { setFormError(null); save.mutate() }}
          onReset={() => { setForm(initial); setErrors({}) }}
        />
      </Section>

      <EmailCard me={me} />

      <Section title="Role and access" description="Set by an administrator — not something you can change here.">
        <dl className="space-y-1">
          <Row label="Role" value={p.role?.name ?? 'No role'} />
          <Row label="Department" value={p.department?.name ?? '—'} />
          <Row label="Permissions" value={`${me.permissions.length} in effect`} />
          <Row label="Joined" value={new Date(p.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} />
        </dl>
      </Section>
    </div>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3 border-b py-1.5 last:border-0" style={{ borderColor: 'var(--border-default)' }}>
    <dt className="text-xs text-[var(--text-tertiary)]">{label}</dt>
    <dd className="text-xs text-[var(--text-primary)]">{value}</dd>
  </div>
)

// ─── Email change ────────────────────────────────────────────

function EmailCard({ me }: { me: MeBundle }) {
  const qc = useQueryClient()
  const p = me.profile
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EmailChangeResponse | null>(null)
  const [copied, setCopied] = useState(false)

  const request = useMutation({
    mutationFn: () => requestEmailChange(newEmail.trim()),
    onSuccess: (r) => {
      setResult(r)
      setNewEmail('')
      setError(null)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err) => setError(err instanceof ApiError ? (err.fields?.newEmail ?? err.message) : 'Could not start the change.'),
  })

  const cancel = useMutation({
    mutationFn: cancelEmailChange,
    onSuccess: () => { setResult(null); qc.invalidateQueries({ queryKey: ['me'] }) },
  })

  return (
    <Section title="Email address" description="Signing in still goes through Microsoft; this is where Nexus writes to you.">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
        <Mail size={13} className="text-[var(--text-tertiary)]" />
        <span className="text-xs text-[var(--text-primary)]">{p.email}</span>
        {p.emailVerifiedAt
          ? <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--success)' }}><Check size={10} /> Confirmed</span>
          : <span className="text-[10px] text-[var(--text-tertiary)]">Not confirmed</span>}
      </div>

      {p.pendingEmail && (
        <div className="mt-2">
          <Alert tone="warning">
            <p>
              Waiting for confirmation at <b>{p.pendingEmail}</b>. Nothing changes until the link
              in that message is opened.
            </p>
            <button
              onClick={() => cancel.mutate()}
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium"
              style={{ color: 'var(--accent)' }}
            >
              <X size={11} /> Cancel the change
            </button>
          </Alert>
        </div>
      )}

      {/* Only appears while email is unconfigured — otherwise the link went out
          and there is nothing to show. Deliberately shown for any address: the
          server hands back a link regardless, and a link that quietly failed to
          appear would tell the user the address is already someone else's. */}
      {result?.meta.confirmUrl && (
        <div className="mt-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--warning)', background: 'rgba(199,119,0,0.06)' }}>
          <p className="text-[11px] text-[var(--text-primary)]">
            Email is not configured on this deployment, so nothing was sent. Open this link to confirm:
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded bg-[var(--bg-surface)] px-1.5 py-1 text-[10px] text-[var(--text-secondary)]">
              {result.meta.confirmUrl}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(result.meta.confirmUrl!); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[10px] text-[var(--text-secondary)]"
              style={{ borderColor: 'var(--border-default)' }}
            >
              {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Field label="New email address" error={error ?? undefined}>
            <input
              type="email" value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); setError(null) }}
              placeholder="you@company.com" className={inputClass} style={borderFor(error ?? undefined)}
            />
          </Field>
        </div>
        <button
          onClick={() => { setError(null); request.mutate() }}
          disabled={!newEmail.trim() || request.isPending}
          className="rounded-lg border px-3 py-2 text-xs font-medium text-[var(--text-primary)] disabled:opacity-40"
          style={{ borderColor: 'var(--border-default)' }}
        >
          {request.isPending ? 'Sending…' : 'Send confirmation'}
        </button>
      </div>
    </Section>
  )
}
