import { useReducer, useRef, useEffect } from 'react'
import { Pencil, Loader2 } from 'lucide-react'
import { inlineEditReducer, currentDraft, INITIAL, type InlineEditState } from '../lib/inlineEdit'

// Click-to-edit for a single project field.
//
// Read mode is a real <button>, not a hover-only pencil, so the affordance is
// keyboard reachable and announced. The pencil is decoration on top of it.
//
// Blur deliberately does not save. Autosave-on-blur loses work when focus
// moves somewhere unexpected and leaves no undo point.

interface Props<T> {
  value: T
  variant: 'text' | 'prose' | 'date' | 'select'
  onSave: (next: T) => Promise<unknown>
  canEdit: boolean
  /** Announced to screen readers on the edit affordance, e.g. "Business case". */
  label: string
  placeholder?: string
  maxLength?: number
  options?: { value: string; label: string }[]
}

export function InlineEdit<T extends string | string[] | null>({
  value, variant, onSave, canEdit, label, placeholder = 'Not set', maxLength, options = [],
}: Props<T>) {
  const [state, dispatch] = useReducer(
    inlineEditReducer<T>,
    INITIAL as InlineEditState<T>,
  )
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>(null)

  useEffect(() => {
    if (state.phase === 'editing') inputRef.current?.focus()
  }, [state.phase])

  const draft = currentDraft(state, value)

  const submit = async () => {
    dispatch({ type: 'SUBMIT' })
    try {
      await onSave(draft)
      dispatch({ type: 'RESOLVED' })
    } catch (err: any) {
      dispatch({ type: 'REJECTED', message: err?.message ?? 'Could not save' })
    }
  }

  if (!canEdit || state.phase === 'read') {
    const isEmpty = value === null || value === '' || (Array.isArray(value) && value.length === 0)
    const shown = isEmpty ? placeholder : Array.isArray(value) ? value.join(', ') : String(value)

    if (!canEdit) {
      return (
        <p className={`text-sm whitespace-pre-wrap ${isEmpty ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]'}`}>
          {shown}
        </p>
      )
    }

    return (
      <button
        type="button"
        onClick={() => dispatch({ type: 'BEGIN', value })}
        aria-label={`Edit ${label}`}
        className={`group w-full text-left flex items-start gap-2 rounded-md -mx-1 px-1 py-0.5
          hover:bg-[var(--bg-elevated)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]
          ${isEmpty ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]'}`}
      >
        <span className="flex-1 text-sm whitespace-pre-wrap">{shown}</span>
        <Pencil
          size={13}
          className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity text-[var(--text-tertiary)]"
        />
      </button>
    )
  }

  const busy = state.phase === 'saving'
  const shared = `w-full rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)]
    px-2 py-1.5 text-sm text-[var(--text-primary)]
    focus:outline-none focus:border-[var(--accent)] disabled:opacity-60`

  // Cmd/Ctrl+Enter saves everywhere. Plain Enter saves single-line variants
  // but must stay a newline in prose.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); dispatch({ type: 'CANCEL' }); return }
    if (e.key !== 'Enter') return
    if (e.metaKey || e.ctrlKey || variant !== 'prose') { e.preventDefault(); void submit() }
  }

  return (
    <div className="space-y-1.5">
      {variant === 'prose' ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={(draft as string) ?? ''}
          rows={5}
          maxLength={maxLength}
          disabled={busy}
          onChange={(e) => dispatch({ type: 'CHANGE', draft: e.target.value as T })}
          onKeyDown={onKeyDown}
          className={`${shared} resize-y leading-relaxed`}
        />
      ) : variant === 'select' ? (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={(draft as string) ?? ''}
          disabled={busy}
          onChange={(e) => dispatch({ type: 'CHANGE', draft: e.target.value as T })}
          onKeyDown={onKeyDown}
          className={shared}
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={variant === 'date' ? 'date' : 'text'}
          value={(draft as string) ?? ''}
          maxLength={maxLength}
          disabled={busy}
          onChange={(e) => dispatch({ type: 'CHANGE', draft: e.target.value as T })}
          onKeyDown={onKeyDown}
          className={shared}
        />
      )}

      {state.phase === 'failed' && (
        <p role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>
          {state.message}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'CANCEL' })}
          disabled={busy}
          className="px-2.5 py-1 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="px-2.5 py-1 rounded-md text-xs font-medium text-white inline-flex items-center gap-1.5 disabled:opacity-60"
          style={{ background: 'var(--accent-secondary)' }}
        >
          {busy && <Loader2 size={12} className="animate-spin" />}
          {busy ? 'Saving' : 'Save'}
        </button>
      </div>
    </div>
  )
}
