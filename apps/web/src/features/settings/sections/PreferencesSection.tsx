import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/features/users/api/usersApi'
import {
  updatePreferences, PREFERENCE_DEFAULTS,
  type MeBundle, type Preferences,
} from '../api/settingsApi'
import { Section, Field, SaveRow, Alert, Toggle, inputClass, borderFor } from '../components/SettingsPrimitives'

// ─── Preferences ─────────────────────────────────────────────
// How the app behaves for one person. Nothing here is visible to anyone else,
// which is why none of it is audited as an authority change — though the write
// still lands in the trail.

const LANDING_PAGES = [
  { value: 'dashboard', label: 'Command Center' },
  { value: 'everything', label: 'Everything' },
  { value: 'projects', label: 'Projects' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'people', label: 'People' },
]

const DATE_FORMATS = [
  { value: 'MMM d, yyyy', label: 'Aug 24, 2026' },
  { value: 'd MMM yyyy', label: '24 Aug 2026' },
  { value: 'yyyy-MM-dd', label: '2026-08-24' },
  { value: 'MM/dd/yyyy', label: '08/24/2026' },
]

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Minutes from midnight → "9:30 PM", and back. */
const toTimeInput = (mins: number | null) =>
  mins === null ? '' : `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
const fromTimeInput = (v: string): number | null => {
  if (!v) return null
  const [h = '0', m = '0'] = v.split(':')
  return Number(h) * 60 + Number(m)
}

export function PreferencesSection({ me }: { me: MeBundle }) {
  const qc = useQueryClient()
  // A member who has never opened this page has no row. Showing the same
  // defaults the server would apply keeps the screen honest — an empty form
  // would imply nothing is set, when in fact everything is.
  const initial: Preferences = me.preferences ?? PREFERENCE_DEFAULTS

  const [form, setForm] = useState<Preferences>(initial)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = (Object.keys(initial) as (keyof Preferences)[]).some((k) => form[k] !== initial[k])
  const quietOn = form.quietHoursStart !== null || form.quietHoursEnd !== null

  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setSaved(false)
    setFieldError(null)
  }

  const save = useMutation({
    mutationFn: () => updatePreferences(form),
    onSuccess: () => {
      setSaved(true)
      setError(null)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        // Quiet hours are validated against the stored pair on the server, so
        // its message is the specific one — show it on the field, not as a
        // banner floating above an unrelated form.
        const quiet = err.fields?.quietHoursEnd ?? err.fields?.quietHoursStart
        if (quiet) setFieldError(quiet)
        else setError(err.message)
        return
      }
      setError('Could not save your preferences.')
    },
  })

  return (
    <div className="space-y-4">
      <Section title="Appearance" description="Applies to your account on every device you sign in from.">
        {error && <div className="mb-3"><Alert>{error}</Alert></div>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Theme" hint="Nexus currently ships light only; the choice is stored for when dark lands.">
            <select value={form.theme} onChange={(e) => set('theme', e.target.value as Preferences['theme'])} className={inputClass} style={borderFor()}>
              <option value="system">Match my system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
          <Field label="Density">
            <select value={form.density} onChange={(e) => set('density', e.target.value as Preferences['density'])} className={inputClass} style={borderFor()}>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact — more rows on screen</option>
            </select>
          </Field>
          <Field label="Open Nexus on">
            <select value={form.defaultLandingPage} onChange={(e) => set('defaultLandingPage', e.target.value)} className={inputClass} style={borderFor()}>
              {!LANDING_PAGES.some((l) => l.value === form.defaultLandingPage) && (
                <option value={form.defaultLandingPage}>{form.defaultLandingPage}</option>
              )}
              {LANDING_PAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </Field>
          {/* Not a Field: a <button> inside a <label> is not valid markup, so
              the Toggle carries its own aria-label instead. */}
          <div>
            <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
              Collapse the sidebar by default
            </span>
            <div className="pt-1.5">
              <Toggle
                checked={form.sidebarCollapsed}
                onChange={(v) => set('sidebarCollapsed', v)}
                label="Collapse the sidebar by default"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Dates and times" description="How Nexus writes dates back to you.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Week starts on">
            <select value={form.weekStartsOn} onChange={(e) => set('weekStartsOn', Number(e.target.value))} className={inputClass} style={borderFor()}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </Field>
          <Field label="Date format">
            <select value={form.dateFormat} onChange={(e) => set('dateFormat', e.target.value)} className={inputClass} style={borderFor()}>
              {!DATE_FORMATS.some((f) => f.value === form.dateFormat) && (
                <option value={form.dateFormat}>{form.dateFormat}</option>
              )}
              {DATE_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Time format">
            <select value={form.timeFormat} onChange={(e) => set('timeFormat', e.target.value as Preferences['timeFormat'])} className={inputClass} style={borderFor()}>
              <option value="12h">1:30 PM</option>
              <option value="24h">13:30</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Quiet hours" description="Email and digest are held back during these hours; in-app is never held.">
        <div className="flex items-center gap-2">
          <Toggle
            checked={quietOn}
            label="Use quiet hours"
            onChange={(v) => {
              // Set as a pair or not at all — the server refuses a half-set
              // range, and offering one input at a time would walk the user
              // straight into that refusal.
              setForm((f) => ({
                ...f,
                quietHoursStart: v ? 1320 : null,
                quietHoursEnd: v ? 420 : null,
              }))
              setSaved(false)
              setFieldError(null)
            }}
          />
          <span className="text-xs text-[var(--text-secondary)]">Use quiet hours</span>
        </div>

        {quietOn && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="From">
              <input
                type="time" value={toTimeInput(form.quietHoursStart)}
                onChange={(e) => set('quietHoursStart', fromTimeInput(e.target.value))}
                className={inputClass} style={borderFor()}
              />
            </Field>
            <Field label="Until" error={fieldError ?? undefined} hint={`In ${me.profile.timezone.replace(/_/g, ' ')}. A range that crosses midnight is fine.`}>
              <input
                type="time" value={toTimeInput(form.quietHoursEnd)}
                onChange={(e) => set('quietHoursEnd', fromTimeInput(e.target.value))}
                className={inputClass} style={borderFor(fieldError ?? undefined)}
              />
            </Field>
          </div>
        )}

        <SaveRow
          dirty={dirty}
          saving={save.isPending}
          saved={saved}
          onSave={() => { setError(null); save.mutate() }}
          onReset={() => { setForm(initial); setError(null); setFieldError(null) }}
        />
      </Section>
    </div>
  )
}
