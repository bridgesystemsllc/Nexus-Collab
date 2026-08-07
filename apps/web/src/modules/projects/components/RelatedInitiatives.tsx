import { useQuery } from '@tanstack/react-query'
import { FolderKanban } from 'lucide-react'
import * as client from '../api/projectsClient'
import type { LinkedModule } from '../api/projectsClient'
import { HealthDot } from './HealthRing'
import { ProgressBar, formatDate } from './ProjectCard'
import { toPercent } from '../types'

// ─── Related Initiatives ─────────────────────────────────────
// The reverse direction of §8.3: dropped into any other module's detail page
// so a Brief, Formulation, Artwork job or Production Order shows which
// initiatives it belongs to.
//
// One join table read from the other end — no duplicated data, and no
// requirement for the host module to know anything about projects beyond its
// own record id.
//
//   <RelatedInitiatives module="BRIEF" recordId={brief.id} />
//
// Renders nothing at all when there are no links, so a page that drops it in
// unconditionally does not grow an empty box.

export function RelatedInitiatives({
  module,
  recordId,
  onOpenProject,
  title = 'Related initiatives',
}: {
  module: LinkedModule
  recordId: string | null | undefined
  onOpenProject?: (projectId: string) => void
  title?: string
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['projects', 'related', module, recordId ?? ''],
    queryFn: async () => (await client.fetchRelatedInitiatives(module, recordId as string)).data,
    enabled: !!recordId,
  })

  // Silent while loading and silent when empty: this panel is a guest on
  // someone else's page and should not occupy space it has nothing to fill.
  if (!recordId || isLoading || isError) return null
  if (!data || data.length === 0) return null

  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
        <FolderKanban size={12} className="text-[var(--text-tertiary)]" />
        {title}
        <span className="text-[var(--text-tertiary)] font-normal tabular-nums">{data.length}</span>
      </h3>

      <ul className="space-y-1.5">
        {data.map((link) => {
          const p = link.project
          const Wrapper = onOpenProject ? 'button' : 'div'
          return (
            <li key={link.id}>
              <Wrapper
                {...(onOpenProject
                  ? { onClick: () => onOpenProject(p.id), type: 'button' as const }
                  : {})}
                className={`w-full rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-left transition-colors ${
                  onOpenProject ? 'hover:border-[var(--border-strong)] active:scale-[0.995]' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <HealthDot band={p.healthBand as any} score={p.health} />
                  <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                    {p.projectNumber ?? '—'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">
                    {p.title}
                  </span>
                  {/* Why this record is attached — SOURCE reads very
                      differently from BLOCKS. */}
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px]"
                    style={{ background: 'var(--bg-overlay)', color: 'var(--text-tertiary)' }}
                  >
                    {link.linkType.toLowerCase()}
                  </span>
                </div>

                <div className="mt-1.5 flex items-center gap-2">
                  <div className="w-24"><ProgressBar percent={toPercent(p.percentComplete)} /></div>
                  <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">
                    {toPercent(p.percentComplete)}%
                  </span>
                  {p.ownerDepartment && (
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      {p.ownerDepartment.name}
                    </span>
                  )}
                  {p.targetEndDate && (
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      due {formatDate(p.targetEndDate)}
                    </span>
                  )}
                </div>
              </Wrapper>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
