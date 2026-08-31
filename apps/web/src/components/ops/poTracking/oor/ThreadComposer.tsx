// ─── Shared composer ────────────────────────────────────────
// One shell behind Comments, Notes, Meeting Updates and Emails so the four tabs
// feel like one surface with different fields, rather than four forms someone
// built on four different afternoons.

import { useState } from 'react'
import { Loader2, Send } from 'lucide-react'

export interface ComposerField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'date' | 'select' | 'tags'
  placeholder?: string
  options?: { value: string; label: string }[]
  required?: boolean
  full?: boolean
  rows?: number
}

export function ThreadComposer({
  fields,
  submitLabel,
  onSubmit,
  initial,
  hint,
}: {
  fields: ComposerField[]
  submitLabel: string
  onSubmit: (values: Record<string, string>) => Promise<void>
  initial?: Record<string, string>
  hint?: string
}) {
  const [values, setValues] = useState<Record<string, string>>(initial ?? {})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }))

  const missing = fields.filter((f) => f.required && !(values[f.name] ?? '').trim())

  const submit = async () => {
    if (missing.length > 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(values)
      setValues(initial ?? {})
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'That did not save. Try again.'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        {fields.map((field) => (
          <div key={field.name} style={{ gridColumn: field.full || field.type === 'textarea' ? '1 / -1' : undefined }}>
            <label className="block text-[11px] mb-1" style={{ color: 'var(--text-tertiary)' }}>
              {field.label}
              {field.required ? <span style={{ color: 'var(--danger)' }}> *</span> : null}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                value={values[field.name] ?? ''}
                onChange={(e) => set(field.name, e.target.value)}
                placeholder={field.placeholder}
                rows={field.rows ?? 3}
                className="w-full rounded-lg px-2.5 py-2 text-[13px]"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', resize: 'vertical' }}
              />
            ) : field.type === 'select' ? (
              <select
                value={values[field.name] ?? ''}
                onChange={(e) => set(field.name, e.target.value)}
                className="w-full rounded-lg px-2.5 py-2 text-[13px]"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              >
                <option value="">—</option>
                {field.options?.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === 'date' ? 'date' : 'text'}
                value={values[field.name] ?? ''}
                onChange={(e) => set(field.name, e.target.value)}
                placeholder={field.placeholder}
                className="w-full rounded-lg px-2.5 py-2 text-[13px]"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              />
            )}
          </div>
        ))}
      </div>

      {error ? (
        <div className="mt-2 text-[12px]" style={{ color: 'var(--danger)' }}>{error}</div>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{hint ?? ''}</span>
        <button
          type="button"
          onClick={submit}
          disabled={missing.length > 0 || busy}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium"
          style={{
            background: missing.length > 0 ? 'var(--bg-hover)' : 'var(--accent-secondary)',
            color: missing.length > 0 ? 'var(--text-tertiary)' : '#fff',
            cursor: missing.length > 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          {submitLabel}
        </button>
      </div>
    </div>
  )
}

/** The house convention, prefilled: MM.DD.YYYY - , so exported files stay
 *  readable to whoever is still working out of the spreadsheet. */
export function commentDatePrefix(today = new Date()): string {
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${mm}.${dd}.${today.getFullYear()} - `
}
