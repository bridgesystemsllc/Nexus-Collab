import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Link2, Plus, X } from 'lucide-react'
import * as client from '../api/projectsClient'
import { useModalBehaviour } from '../lib/useModalBehaviour'
import type { LinkedModule, ModuleLink } from '../api/projectsClient'

// ─── Linked records ──────────────────────────────────────────
// The forward direction of §8.3: what this project is bound to elsewhere in
// Nexus. The reverse view lives in RelatedInitiatives, reading the same join
// table from the other end.
//
// The label is cached on the link row. The linked module owns the record; this
// panel deliberately does not fetch from each of nine modules to render a
// title, which would be a fan-out per link on every page load.

const MODULE_LABELS: Record<LinkedModule, string> = {
  BRIEF: 'Brief',
  NPD: 'NPD project',
  FORMULATION: 'Formulation',
  ARTWORK: 'Artwork',
  COMPONENT: 'Component',
  TECH_TRANSFER: 'Tech transfer',
  PRODUCTION_ORDER: 'Production order',
  CM: 'Contract manufacturer',
  DASHBOARD_SKU: 'Dashboard SKU',
}

const LINK_TYPES: ModuleLink['linkType'][] = ['SOURCE', 'OUTPUT', 'RELATED', 'BLOCKS']

export function LinkedRecords({
  projectId, canEdit,
}: { projectId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const key = ['projects', 'links', projectId]
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => client.fetchProjectLinks(projectId),
  })

  const remove = useMutation({
    mutationFn: (linkId: string) => client.deleteProjectLink(linkId),
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: key })
    },
    onError: (err: any) => setError(err?.message ?? 'Could not remove that link'),
  })

  const links = data?.data ?? []

  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
          <Link2 size={12} className="text-[var(--text-tertiary)]" />
          Linked records
          {links.length > 0 && (
            <span className="font-normal tabular-nums text-[var(--text-tertiary)]">{links.length}</span>
          )}
        </h3>
        {canEdit && (
          <button
            onClick={() => { setError(null); setAdding(true) }}
            className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <Plus size={10} /> Link
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-primary)]" style={{ background: 'rgba(255,69,58,0.08)' }}>
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-[var(--text-tertiary)]">Loading…</p>
      ) : links.length === 0 ? (
        <p className="text-xs text-[var(--text-tertiary)]">
          Nothing linked yet.{canEdit ? ' Bind a brief, formulation or production order to keep the trail intact.' : ''}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {links.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] text-[var(--text-primary)]">
                  {l.label ?? l.recordId}
                </p>
                <p className="text-[10px] text-[var(--text-tertiary)]">
                  {MODULE_LABELS[l.module] ?? l.module} · {l.linkType.toLowerCase()}
                </p>
              </div>
              {canEdit && (
                <button
                  onClick={() => remove.mutate(l.id)}
                  disabled={remove.isPending}
                  aria-label={`Unlink ${l.label ?? l.recordId}`}
                  className="shrink-0 rounded p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--danger)] disabled:opacity-50"
                >
                  <X size={11} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddLinkDialog
          projectId={projectId}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); qc.invalidateQueries({ queryKey: key }) }}
        />
      )}
    </section>
  )
}

function AddLinkDialog({
  projectId, onClose, onAdded,
}: { projectId: string; onClose: () => void; onAdded: () => void }) {
  const [module, setModule] = useState<LinkedModule>('BRIEF')
  const [recordId, setRecordId] = useState('')
  const [label, setLabel] = useState('')
  const [linkType, setLinkType] = useState<ModuleLink['linkType']>('RELATED')
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      client.createProjectLink(projectId, {
        module, recordId: recordId.trim(),
        ...(label.trim() ? { label: label.trim() } : {}),
        linkType,
      }),
    onSuccess: onAdded,
    onError: (err: any) => setError(err?.message ?? 'Could not create that link'),
  })

  const field =
    'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)]'

  return (
    <Modal onClose={onClose} label="Link a record">
      <form
        onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate() }}
        className="space-y-3"
      >
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11px]" style={{ background: 'rgba(255,69,58,0.08)' }}>
            <AlertTriangle size={11} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
            <span className="text-[var(--text-primary)]">{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="link-module" className="mb-1 block text-[11px] text-[var(--text-tertiary)]">Module</label>
          <select id="link-module" value={module} onChange={(e) => setModule(e.target.value as LinkedModule)} className={field}>
            {(Object.keys(MODULE_LABELS) as LinkedModule[]).map((m) => (
              <option key={m} value={m}>{MODULE_LABELS[m]}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="link-record" className="mb-1 block text-[11px] text-[var(--text-tertiary)]">Record ID</label>
          <input
            id="link-record" value={recordId} onChange={(e) => setRecordId(e.target.value)}
            required autoFocus className={field} placeholder="The id of the record in that module"
          />
        </div>

        <div>
          <label htmlFor="link-label" className="mb-1 block text-[11px] text-[var(--text-tertiary)]">
            Label <span className="text-[var(--text-tertiary)]">(optional)</span>
          </label>
          <input
            id="link-label" value={label} onChange={(e) => setLabel(e.target.value)}
            className={field} placeholder="What to show in the list"
          />
        </div>

        <div>
          <label htmlFor="link-type" className="mb-1 block text-[11px] text-[var(--text-tertiary)]">Relationship</label>
          <select id="link-type" value={linkType} onChange={(e) => setLinkType(e.target.value as ModuleLink['linkType'])} className={field}>
            {LINK_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button" onClick={onClose}
            className="rounded-lg border border-[var(--border-default)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            type="submit" disabled={create.isPending || !recordId.trim()}
            className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-white transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'var(--accent-secondary)' }}
          >
            {create.isPending ? 'Linking…' : 'Link'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Modal shell with the accessibility the quality bar asks for — Escape closes,
 * Tab is trapped, focus returns to the opener — all of it from the shared hook
 * so every dialog in the module behaves identically.
 */
function Modal({
  onClose, label, children,
}: { onClose: () => void; label: string; children: React.ReactNode }) {
  const ref = useModalBehaviour(onClose)
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        ref={ref}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xl"
      >
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{label}</h2>
        {children}
      </div>
    </div>
  )
}
