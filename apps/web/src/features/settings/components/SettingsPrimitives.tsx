import { AlertTriangle, Check } from 'lucide-react'

// ─── Shared settings chrome ──────────────────────────────────
// Six sections that look like six different products is the usual outcome of
// building them one at a time. These are the pieces they all use.

export function Section({
  title, description, children, action,
}: {
  title: string
  description?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="rounded-xl border p-5" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

/**
 * A labelled control.
 *
 * The control is nested inside the `<label>` rather than pointed at by `for`:
 * implicit association needs no id, so there is no way to add a field and
 * forget to wire one up. A `<label>` sitting next to an input, which is what
 * this was, labels nothing at all — assistive technology reads the input as
 * unnamed.
 *
 * Only for form controls. A `<button>` (the Toggle) inside a label is not
 * valid; those get their own aria-label.
 */
export function Field({
  label, error, hint, children,
}: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
      {error
        ? <span role="alert" className="mt-1 block text-[10px]" style={{ color: 'var(--danger)' }}>{error}</span>
        : hint && <span className="mt-1 block text-[10px] text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border bg-[var(--bg-surface)] px-2.5 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none'

export const borderFor = (error?: string) => ({ borderColor: error ? 'var(--danger)' : 'var(--border-default)' })

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'warning'; children: React.ReactNode }) {
  const color = tone === 'danger' ? 'var(--danger)' : 'var(--warning)'
  const bg = tone === 'danger' ? 'rgba(216,53,42,0.08)' : 'rgba(199,119,0,0.08)'
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11px]" style={{ background: bg }}>
      <AlertTriangle size={12} className="mt-0.5 shrink-0" style={{ color }} />
      <div className="min-w-0 flex-1 text-[var(--text-primary)]">{children}</div>
    </div>
  )
}

/**
 * The save button and its result, together.
 *
 * A separate toast for "Saved" scrolls away from the thing that was saved; on
 * a page of six independent forms that leaves the user guessing which one it
 * referred to.
 */
export function SaveRow({
  dirty, saving, saved, onSave, onReset, label = 'Save changes',
}: {
  dirty: boolean
  saving: boolean
  saved: boolean
  onSave: () => void
  onReset?: () => void
  label?: string
}) {
  return (
    <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3" style={{ borderColor: 'var(--border-default)' }}>
      {saved && !dirty && (
        <span className="mr-auto inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--success)' }}>
          <Check size={12} /> Saved
        </span>
      )}
      {dirty && onReset && (
        <button onClick={onReset} className="rounded-lg border px-3 py-1.5 text-xs text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-default)' }}>
          Discard
        </button>
      )}
      <button
        onClick={onSave}
        disabled={!dirty || saving}
        className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-all active:scale-[0.98] disabled:opacity-40"
        style={{ background: 'var(--accent)' }}
      >
        {saving ? 'Saving…' : label}
      </button>
    </div>
  )
}

export function Toggle({
  checked, onChange, label, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-[18px] w-8 shrink-0 rounded-full transition-colors disabled:opacity-40"
      style={{ background: checked ? 'var(--accent)' : 'var(--border-strong)' }}
    >
      <span
        className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all"
        style={{ left: checked ? 16 : 2 }}
      />
    </button>
  )
}

export const SectionSkeleton = () => (
  <div className="space-y-3" aria-busy="true">
    <div className="skeleton h-40 rounded-xl" />
    <div className="skeleton h-24 rounded-xl" />
  </div>
)
