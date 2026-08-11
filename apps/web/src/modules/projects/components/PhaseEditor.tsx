import { useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from 'lucide-react'
import {
  useCreatePhase, useUpdatePhase, useDeletePhase, useReorderPhases,
} from '../hooks/useProjects'

// Phase management for the Gantt.
//
// `sequence` is unique per project (@@unique([projectId, sequence])) and the
// create route returns 409 on a clash, so the next sequence is derived here
// rather than asked for. If a concurrent create still wins the race, the
// server's message is surfaced verbatim.

interface Phase {
  id: string
  name: string
  sequence: number
  startDate?: string | null
  endDate?: string | null
}

export function PhaseEditor({
  projectId, phases, canEdit,
}: { projectId: string; phases: Phase[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = useCreatePhase(projectId)
  const update = useUpdatePhase(projectId)
  const remove = useDeletePhase(projectId)
  const reorder = useReorderPhases(projectId)

  if (!canEdit) return null

  const ordered = [...phases].sort((a, b) => a.sequence - b.sequence)
  const nextSequence = ordered.length ? Math.max(...ordered.map((p) => p.sequence)) + 1 : 1

  const submit = async () => {
    if (!name.trim()) { setError('A phase name is required'); return }
    // The server rejects this too (projectTimeline.ts:191); checking here
    // turns a round trip into an immediate hint.
    if (start && end && end < start) { setError('A phase cannot end before it starts'); return }
    setError(null)
    try {
      await create.mutateAsync({
        name: name.trim(),
        sequence: nextSequence,
        ...(start ? { startDate: start } : {}),
        ...(end ? { endDate: end } : {}),
      })
      setName(''); setStart(''); setEnd(''); setAdding(false)
    } catch (err: any) {
      setError(err?.message ?? 'Could not add the phase')
    }
  }

  const resetDraft = () => {
    setAdding(false); setName(''); setStart(''); setEnd(''); setError(null)
  }

  const move = async (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= ordered.length) return
    const ids = ordered.map((p) => p.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setError(null)
    try {
      await reorder.mutateAsync(ids)
    } catch (err: any) {
      setError(err?.message ?? 'Could not reorder the phases')
    }
  }

  const field = `rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)]
    px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]`

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)]">Phases</span>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs text-[var(--accent)] inline-flex items-center gap-1 hover:underline"
          >
            <Plus size={12} />
            Add phase
          </button>
        )}
      </div>

      <ul className="space-y-1">
        {ordered.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2 text-xs group">
            <span className="tabular-nums text-[var(--text-tertiary)] w-5">{p.sequence}</span>
            <input
              defaultValue={p.name}
              onBlur={(e) => {
                const next = e.target.value.trim()
                if (next && next !== p.name) {
                  update.mutateAsync({ phaseId: p.id, name: next }).catch((err) =>
                    setError(err?.message ?? 'Could not rename the phase'))
                }
              }}
              className={`${field} flex-1`}
            />
            <button type="button" onClick={() => void move(i, -1)} disabled={i === 0}
              aria-label={`Move ${p.name} earlier`}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30">
              <ChevronUp size={13} />
            </button>
            <button type="button" onClick={() => void move(i, 1)} disabled={i === ordered.length - 1}
              aria-label={`Move ${p.name} later`}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30">
              <ChevronDown size={13} />
            </button>
            <button
              type="button"
              aria-label={`Delete ${p.name}`}
              onClick={() => {
                setError(null)
                remove.mutateAsync(p.id).catch((err) =>
                  setError(err?.message ?? 'Could not delete the phase'))
              }}
              className="text-[var(--text-tertiary)] hover:text-[var(--danger)] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input autoFocus value={name} placeholder="Phase name" maxLength={200}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { resetDraft() }
              if (e.key === 'Enter') { e.preventDefault(); void submit() }
            }}
            className={`${field} flex-1 min-w-[10rem]`} />
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={field} />
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={field} />
          <button type="button" onClick={() => void submit()} disabled={create.isPending}
            className="px-2.5 py-1 rounded-md text-xs font-medium text-white inline-flex items-center gap-1.5 disabled:opacity-60"
            style={{ background: 'var(--accent-secondary)' }}>
            {create.isPending && <Loader2 size={12} className="animate-spin" />}
            Add
          </button>
          <button type="button" onClick={resetDraft}
            className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Cancel
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  )
}
