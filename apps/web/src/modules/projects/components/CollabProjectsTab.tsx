import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, LayoutGrid, Link2, Plus, Rows3, Search, Unlink, X,
} from 'lucide-react'
import * as client from '../api/projectsClient'
import { useModalBehaviour } from '../lib/useModalBehaviour'
import type { CollabProjectLink, CollabVisibility } from '../api/projectsClient'
import { ProjectsModule } from '../ProjectsModule'
import { CollabProjectBoard } from './CollabProjectBoard'
import { ProjectCreateWizard } from './ProjectCreateWizard'
import { HealthDot } from './HealthRing'
import { ProgressBar, formatDate } from './ProjectCard'
import { toPercent } from '../types'

// ─── Projects in a collab ────────────────────────────────────
// The Projects tab inside a collab workspace (§6.5). Two views over the same
// links: the projects themselves, and one unified board across all of them.
//
// Opening a project here renders the ordinary ProjectsModule under a collab
// scope — the same detail view every department sees, not a collab-specific
// copy of it. That is the whole point of the scope context.

const VISIBILITY_LABELS: Record<CollabVisibility, string> = {
  FULL: 'Full access',
  TASKS_ONLY: 'Tasks only',
  SUMMARY_ONLY: 'Summary only',
}

export function CollabProjectsTab({
  collabId, collabName, currentMemberId,
}: { collabId: string; collabName: string; currentMemberId?: string | null }) {
  const qc = useQueryClient()
  const [view, setView] = useState<'projects' | 'board'>('projects')
  const [adding, setAdding] = useState(false)
  const [creating, setCreating] = useState(false)
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const listKey = ['collab', collabId, 'projects']
  const { data, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: () => client.fetchCollabProjects(collabId),
  })

  const unlink = useMutation({
    mutationFn: (projectId: string) => client.unlinkProjectFromCollab(collabId, projectId),
    onSuccess: (res) => {
      setError(null)
      // Unlink is deliberately not silent: what it kept, and why, is the part
      // people need to know.
      setNotice((res.meta as any)?.note ?? 'Detached. No project work was deleted.')
      qc.invalidateQueries({ queryKey: ['collab', collabId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (err: any) => setError(err?.message ?? 'Could not detach that project'),
  })

  const links: CollabProjectLink[] = data?.data ?? []

  // A project opened from here renders under collab scope, so the detail view
  // knows it is being viewed through a workspace.
  if (openProjectId) {
    return (
      <ProjectsModule
        scope={{ type: 'collab', collabId, collabName }}
        projectId={openProjectId}
        onSelectProject={setOpenProjectId}
        currentMemberId={currentMemberId}
      />
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,69,58,0.08)' }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
          <span className="flex-1 text-[var(--text-primary)]">{error}</span>
          <button onClick={() => setError(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--bg-overlay)' }}>
          <span className="flex-1 text-[var(--text-secondary)]">{notice}</span>
          <button onClick={() => setNotice(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">Dismiss</button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Projects</h3>
          <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{links.length}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
            <button
              onClick={() => setView('projects')}
              title="Projects"
              className={`p-1.5 rounded-md transition-colors ${view === 'projects' ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'}`}
            ><Rows3 size={14} /></button>
            <button
              onClick={() => setView('board')}
              title="Unified board"
              className={`p-1.5 rounded-md transition-colors ${view === 'board' ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'}`}
            ><LayoutGrid size={14} /></button>
          </div>

          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all active:scale-[0.98]"
            style={{ background: 'var(--accent-secondary)' }}
          >
            <Plus size={14} />
            Add project
          </button>
        </div>
      </div>

      {view === 'board' ? (
        <CollabProjectBoard collabId={collabId} onOpenProject={setOpenProjectId} />
      ) : isLoading ? (
        <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">Loading projects…</p>
      ) : links.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] py-12 text-center">
          <p className="text-sm text-[var(--text-primary)]">No projects in this collab yet</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1 max-w-md mx-auto">
            Adding one does not copy it. The collab's departments get access to the same
            project their own tabs already show.
          </p>
          <button
            onClick={() => setAdding(true)}
            className="mt-3 text-xs text-[var(--accent-secondary)] hover:underline"
          >
            Add a project
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 transition-all hover:border-[var(--border-strong)]"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  onClick={() => setOpenProjectId(link.project.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <HealthDot band={link.project.healthBand} score={link.project.health} />
                    <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                      {link.project.projectNumber ?? '—'}
                    </span>
                    <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {link.project.title}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="w-32"><ProgressBar percent={toPercent(link.project.percentComplete)} /></div>
                    <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                      {toPercent(link.project.percentComplete)}%
                    </span>
                    {link.project._count && (
                      <span className="text-[11px] text-[var(--text-tertiary)]">
                        {link.project._count.tasks} tasks
                      </span>
                    )}
                  </div>

                  {/* Lanes, marking which ones this link put there — so it is
                      visible what detaching would take away. */}
                  {link.project.departments && link.project.departments.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {link.project.departments.map((d) => (
                        <span
                          key={d.departmentId}
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            background: 'var(--bg-overlay)',
                            color: 'var(--text-secondary)',
                            border: d.addedByLinkId === link.id
                              ? '1px dashed var(--border-strong)'
                              : '1px solid transparent',
                          }}
                          title={d.addedByLinkId === link.id ? 'Added by this collab link' : undefined}
                        >
                          {d.department.name}
                        </span>
                      ))}
                    </div>
                  )}
                </button>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: 'var(--bg-overlay)', color: 'var(--text-tertiary)' }}
                  >
                    {VISIBILITY_LABELS[link.visibility]}
                  </span>
                  <button
                    onClick={() => { setNotice(null); unlink.mutate(link.project.id) }}
                    disabled={unlink.isPending}
                    className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--danger)] disabled:opacity-50 transition-colors"
                  >
                    <Unlink size={10} /> Detach
                  </button>
                </div>
              </div>

              <p className="mt-2 border-t border-[var(--border-subtle)] pt-1.5 text-[10px] text-[var(--text-tertiary)]">
                Added {formatDate(link.linkedAt)}
                {link.linkedBy ? ` by ${link.linkedBy.name}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddProjectDialog
          collabId={collabId}
          collabName={collabName}
          alreadyLinked={new Set(links.map((l) => l.project.id))}
          onClose={() => setAdding(false)}
          onCreateNew={() => { setAdding(false); setCreating(true) }}
          onLinked={(message) => {
            setAdding(false)
            setNotice(message)
            qc.invalidateQueries({ queryKey: ['collab', collabId] })
            qc.invalidateQueries({ queryKey: ['projects'] })
          }}
        />
      )}

      {creating && (
        <ProjectCreateWizard
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false)
            // Created "in this collab" has to mean linked to it, or the wizard
            // silently makes an unrelated project and the user has to notice.
            try {
              await client.linkProjectToCollab(collabId, { projectId: id })
              setNotice('Created and added to this collab.')
            } catch (err: any) {
              setError(
                `Project created, but it could not be added to this collab: ${err?.message ?? 'unknown error'}`,
              )
            }
            qc.invalidateQueries({ queryKey: ['collab', collabId] })
            qc.invalidateQueries({ queryKey: ['projects'] })
            setOpenProjectId(id)
          }}
        />
      )}
    </div>
  )
}

// ─── Add project dialog ──────────────────────────────────────

function AddProjectDialog({
  collabId, collabName, alreadyLinked, onClose, onLinked, onCreateNew,
}: {
  collabId: string
  collabName: string
  alreadyLinked: Set<string>
  onClose: () => void
  onLinked: (message: string) => void
  onCreateNew: () => void
}) {
  const [search, setSearch] = useState('')
  // Escape closes, Tab is trapped, focus returns to the opener.
  const dialogRef = useModalBehaviour(onClose)

  const [visibility, setVisibility] = useState<CollabVisibility>('FULL')
  const [error, setError] = useState<string | null>(null)

  // Searches only what the actor can already see — the API scopes it, so this
  // cannot be used to discover projects someone lacks access to.
  const { data, isLoading } = useQuery({
    queryKey: ['projects', 'list', { search, limit: 25 }],
    queryFn: () => client.fetchProjects({ search: search || undefined, limit: 25 }),
  })

  const preview = useQuery({
    queryKey: ['collab', collabId, 'preview'],
    queryFn: async () => (await client.fetchLinkPreview(collabId)).data,
  })

  const link = useMutation({
    mutationFn: (projectId: string) =>
      client.linkProjectToCollab(collabId, { projectId, visibility }),
    onSuccess: (res) => {
      const added = res.data.departmentsAdded
      onLinked(
        added.length
          ? `Added. ${added.join(' and ')} now ${added.length === 1 ? 'has' : 'have'} access to this project.`
          : 'Added to this collab.',
      )
    },
    onError: (err: any) => setError(err?.message ?? 'Could not add that project'),
  })

  const projects = (data?.data ?? []).filter((p) => !alreadyLinked.has(p.id))

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Add a project to this collab"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Add a project</h2>
            {/* Said before the click, not after: this grants real access. */}
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
              {preview.data && preview.data.matched.length > 0
                ? `${preview.data.matched.map((d) => d.name).join(', ')} will get access to the same project — nothing is copied.`
                : `Adding a project to ${collabName} grants its departments access. Nothing is copied.`}
            </p>
            {preview.data && preview.data.unmatched.length > 0 && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--warning)' }}>
                No department in Nexus matches {preview.data.unmatched.join(', ')} — those will be skipped.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] transition-colors"
          >
            <X size={15} />
          </button>
        </header>

        <div className="px-5 py-4 space-y-3">
          {error && (
            <div role="alert" className="rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]" style={{ background: 'rgba(255,69,58,0.08)' }}>
              {error}
            </div>
          )}

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              autoFocus
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] pl-8 pr-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)]"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="collab-visibility" className="text-[11px] text-[var(--text-tertiary)]">Share as</label>
            <select
              id="collab-visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as CollabVisibility)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[11px] text-[var(--text-primary)] focus:outline-none"
            >
              <option value="FULL">Full access</option>
              <option value="TASKS_ONLY">Tasks only</option>
              <option value="SUMMARY_ONLY">Summary only — no tasks on the board</option>
            </select>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--border-subtle)]">
            {isLoading ? (
              <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">Searching…</p>
            ) : projects.length === 0 ? (
              <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">
                {search ? 'No projects match that.' : 'Every project you can see is already here.'}
              </p>
            ) : (
              <ul>
                {projects.map((p) => (
                  <li key={p.id} className="border-b border-[var(--border-subtle)] last:border-0">
                    <button
                      onClick={() => { setError(null); link.mutate(p.id) }}
                      disabled={link.isPending}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--bg-overlay)] disabled:opacity-50 transition-colors"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <HealthDot band={p.healthBand} score={p.health} />
                        <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                          {p.projectNumber ?? '—'}
                        </span>
                        <span className="truncate text-xs text-[var(--text-primary)]">{p.title}</span>
                      </span>
                      <Link2 size={12} className="shrink-0 text-[var(--text-tertiary)]" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-5 py-3">
          <button
            onClick={onCreateNew}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--accent-secondary)] hover:underline"
          >
            <Plus size={12} /> Create a new project in this collab
          </button>
          {link.isPending && <span className="text-[11px] text-[var(--text-tertiary)]">Adding…</span>}
        </footer>
      </div>
    </div>
  )
}
