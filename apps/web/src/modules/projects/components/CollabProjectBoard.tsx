import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Ban, Clock, EyeOff } from 'lucide-react'
import * as client from '../api/projectsClient'
import type { CollabBoardCard } from '../api/projectsClient'
import { formatDate } from './ProjectCard'

// ─── Unified collab board ────────────────────────────────────
// One board across every project shared into this collab, swimlaned by
// department (§6.5). The point is the cross-project view: Marketing's column
// holds their work on all of it at once, and each card names the project it
// belongs to — without that chip a mixed board is a pile.
//
// Cards mutate the same Task rows the department tabs do. Completing one here
// completes it everywhere, because there is nothing else to complete.

const STATUS_ORDER = ['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETE']

const HEALTH_COLOR: Record<string, string> = {
  GREEN: 'var(--success)',
  AMBER: 'var(--warning)',
  RED: 'var(--danger)',
}

export function CollabProjectBoard({
  collabId, onOpenProject,
}: { collabId: string; onOpenProject?: (projectId: string) => void }) {
  const qc = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['collab', collabId, 'board'],
    queryFn: async () => (await client.fetchCollabBoard(collabId)).data,
  })

  const setStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      client.setTaskStatus(taskId, status),
    // Everything project-shaped is invalidated, not just this board: the same
    // task is on the department tab and in the project's own view, and leaving
    // those stale is how "one source of truth" stops being visibly true.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collab', collabId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">Loading board…</p>
  }
  if (isError || !data) {
    return (
      <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">
        {(error as any)?.message ?? 'Could not load the board'}
      </p>
    )
  }

  if (data.lanes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-default)] py-12 text-center">
        <p className="text-sm text-[var(--text-primary)]">Nothing on the board yet</p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          {data.projects.length === 0
            ? 'Add a project to this collab to see its work here.'
            : 'The linked projects have no open tasks.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Totals */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-tertiary)]">
        <span>
          <b className="text-[var(--text-primary)] tabular-nums">{data.totals.tasks}</b> tasks
          across <b className="text-[var(--text-primary)] tabular-nums">{data.projects.length}</b> projects
        </span>
        {data.totals.blocked > 0 && (
          <span className="flex items-center gap-1" style={{ color: 'var(--danger)' }}>
            <Ban size={11} /> {data.totals.blocked} blocked
          </span>
        )}
        {data.totals.overdue > 0 && (
          <span className="flex items-center gap-1" style={{ color: 'var(--warning)' }}>
            <Clock size={11} /> {data.totals.overdue} overdue
          </span>
        )}
      </div>

      {/* Projects excluded by their own visibility setting — said out loud, so
          an incomplete board is never mistaken for a complete one. */}
      {data.excludedProjects.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-[11px]" style={{ background: 'var(--bg-overlay)' }}>
          <EyeOff size={12} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
          <span className="text-[var(--text-secondary)]">
            {data.excludedProjects.map((p) => p.title).join(', ')}
            {data.excludedProjects.length === 1 ? ' is' : ' are'} shared as summary only —
            {data.excludedProjects.length === 1 ? ' its' : ' their'} tasks are not on this board.
          </span>
        </div>
      )}

      {/* Swimlanes */}
      <div className="space-y-4">
        {data.lanes.map((lane) => (
          <section key={lane.departmentId ?? 'unassigned'}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: lane.color ?? 'var(--text-tertiary)' }}
              />
              <h3 className="text-xs font-medium text-[var(--text-primary)]">{lane.departmentName}</h3>
              <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">{lane.cards.length}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
              {STATUS_ORDER.map((status) => {
                const cards = lane.cards.filter((c) => c.status === status)
                if (cards.length === 0) return null
                return (
                  <div key={status} className="space-y-1.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                      {status.replace(/_/g, ' ')} · {cards.length}
                    </p>
                    {cards.map((card) => (
                      <BoardCard
                        key={card.id}
                        card={card}
                        onOpenProject={onOpenProject}
                        onComplete={
                          card.status === 'COMPLETE'
                            ? undefined
                            : () => setStatus.mutate({ taskId: card.id, status: 'COMPLETE' })
                        }
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function BoardCard({
  card, onOpenProject, onComplete,
}: {
  card: CollabBoardCard
  onOpenProject?: (projectId: string) => void
  onComplete?: () => void
}) {
  const overdue = card.dueDate && new Date(card.dueDate) < new Date() && card.status !== 'COMPLETE'

  return (
    <div
      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 transition-all hover:border-[var(--border-strong)]"
      style={card.status === 'BLOCKED' ? { borderColor: 'var(--danger)' } : undefined}
    >
      {/* The project chip. On a cross-project board this is what makes a card
          mean anything. */}
      <button
        onClick={() => onOpenProject?.(card.project.id)}
        disabled={!onOpenProject}
        className="mb-1.5 inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] enabled:hover:border-[var(--border-strong)] enabled:hover:text-[var(--text-primary)] transition-colors"
      >
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ background: HEALTH_COLOR[card.project.healthBand] ?? 'var(--text-tertiary)' }}
        />
        <span className="truncate">{card.project.projectNumber ?? card.project.title}</span>
      </button>

      <p className="text-xs text-[var(--text-primary)] leading-snug">
        {card.taskNumber != null && (
          <span className="text-[var(--text-tertiary)] tabular-nums">#{card.taskNumber} </span>
        )}
        {card.title}
      </p>

      {card.status === 'BLOCKED' && card.blockedReason && (
        <p className="mt-1 flex items-start gap-1 text-[10px]" style={{ color: 'var(--danger)' }}>
          <AlertTriangle size={9} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2">{card.blockedReason}</span>
        </p>
      )}

      {card.isCrossDept && card.acceptanceStatus === 'PENDING' && (
        <p className="mt-1 text-[10px]" style={{ color: 'var(--warning)' }}>
          Requested from another department — awaiting acceptance
        </p>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[10px] text-[var(--text-tertiary)]">
          {card.owner?.name ?? 'Unassigned'}
          {card.dueDate && (
            <span style={overdue ? { color: 'var(--danger)' } : undefined}>
              {' · '}{formatDate(card.dueDate)}
            </span>
          )}
        </span>
        {onComplete && (
          <button
            onClick={onComplete}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] transition-colors"
          >
            Done
          </button>
        )}
      </div>
    </div>
  )
}
