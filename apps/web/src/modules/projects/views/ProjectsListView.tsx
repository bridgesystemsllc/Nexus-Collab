import { useMemo, useState } from 'react'
import { LayoutGrid, Table2, Plus, Search, FolderKanban, FileBarChart, BarChart3 } from 'lucide-react'
import { useProjects, useProjectTypes } from '../hooks/useProjects'
import { useProjectScope } from '../context/ProjectScopeContext'
import { PortfolioReports } from '../components/PortfolioReports'
import { AnalyticsView } from './AnalyticsView'
import { ProjectCard, ProgressBar, SlipBadge, formatDate, slipDays } from '../components/ProjectCard'
import { DepartmentLaneChips } from '../components/DepartmentLaneChips'
import { HealthDot } from '../components/HealthRing'
import {
  STATUS_LABELS, toPercent, type ProjectSummary, type ProjectStatus, type HealthBand,
} from '../types'

// ─── Projects list ───────────────────────────────────────────
// Identical under every scope. The only difference is the department filter
// the scope context supplies, so a department tab and the portfolio share this
// component rather than one being a copy of the other.

const STATUS_FILTERS: ProjectStatus[] = ['ACTIVE', 'AT_RISK', 'BLOCKED', 'ON_HOLD', 'APPROVED', 'DRAFT', 'COMPLETED']
const HEALTH_FILTERS: HealthBand[] = ['GREEN', 'AMBER', 'RED']

export function ProjectsListView({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: () => void }) {
  const { departmentId, includeParticipating, isPortfolio, label } = useProjectScope()
  const [reportsOpen, setReportsOpen] = useState(false)
  const [view, setView] = useState<'cards' | 'table' | 'analytics'>('table')
  const [status, setStatus] = useState<string | null>(null)
  const [health, setHealth] = useState<string | null>(null)
  const [typeId, setTypeId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data: types = [] } = useProjectTypes()

  const params = useMemo(
    () => ({
      ...(departmentId ? { departmentId, includeParticipating } : {}),
      ...(status ? { status } : {}),
      ...(health ? { health } : {}),
      ...(typeId ? { typeId } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      page,
      limit: 25,
    }),
    [departmentId, includeParticipating, status, health, typeId, search, page],
  )

  const { data, isLoading, isError, error, refetch } = useProjects(params)
  const projects = data?.data ?? []
  const meta = data?.meta ?? {}
  const hasFilters = !!(status || health || typeId || search.trim())

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
      active
        ? 'bg-[var(--accent-secondary)] text-white border-transparent'
        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
    }`

  const reset = () => { setStatus(null); setHealth(null); setTypeId(null); setSearch(''); setPage(1) }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">
            {isPortfolio ? 'All initiatives' : 'Projects & Initiatives'}
          </h2>
          <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
            {meta.total ?? projects.length}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search projects…"
              className="w-48 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-secondary)]"
            />
          </div>

          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
            <button
              onClick={() => setView('table')}
              className={`p-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'}`}
              title="Table"
            ><Table2 size={14} /></button>
            <button
              onClick={() => setView('cards')}
              className={`p-1.5 rounded-md transition-colors ${view === 'cards' ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'}`}
              title="Cards"
            ><LayoutGrid size={14} /></button>
            <button
              onClick={() => setView('analytics')}
              className={`p-1.5 rounded-md transition-colors ${view === 'analytics' ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'}`}
              title="Analytics"
            ><BarChart3 size={14} /></button>
          </div>

          <button
            onClick={() => setReportsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
          >
            <FileBarChart size={14} />
            Reports
          </button>

          <button
            onClick={onCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all active:scale-[0.98]"
            style={{ background: 'var(--accent-secondary)' }}
          >
            <Plus size={14} />
            New Initiative
          </button>
        </div>
      </div>

      {/* Filters — analytics has its own scope and ignores these, so hiding
          them beats showing controls that appear to do nothing. */}
      <div className={`flex items-center gap-1.5 flex-wrap ${view === 'analytics' ? 'hidden' : ''}`}>
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-tertiary)] mr-1">Status</span>
        <button onClick={() => { setStatus(null); setPage(1) }} className={chip(!status)}>All</button>
        {STATUS_FILTERS.map((s) => (
          <button key={s} onClick={() => { setStatus(s); setPage(1) }} className={chip(status === s)}>
            {STATUS_LABELS[s]}
          </button>
        ))}
        <span className="w-px h-4 bg-[var(--border-default)] mx-1" />
        {HEALTH_FILTERS.map((h) => (
          <button key={h} onClick={() => { setHealth(health === h ? null : h); setPage(1) }} className={chip(health === h)}>
            {h[0] + h.slice(1).toLowerCase()}
          </button>
        ))}
        {types.length > 0 && (
          <select
            value={typeId ?? ''}
            onChange={(e) => { setTypeId(e.target.value || null); setPage(1) }}
            className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
          >
            <option value="">All types</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        )}
        {hasFilters && (
          <button onClick={reset} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] underline underline-offset-2 ml-1">
            Clear
          </button>
        )}
      </div>

      {/* Content */}
      {view === 'analytics' ? (
        // Analytics reads the portfolio through its own endpoints, so it does
        // not depend on the page of projects loaded above.
        <AnalyticsView />
      ) : isLoading ? (
        <ListSkeleton view={view} />
      ) : isError ? (
        <ErrorState message={(error as any)?.message} onRetry={() => refetch()} />
      ) : projects.length === 0 ? (
        <EmptyState hasFilters={hasFilters} label={label} onCreate={onCreate} onClear={reset} />
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 stagger">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onOpen={onOpen} highlightDepartmentId={departmentId} />
          ))}
        </div>
      ) : (
        <ProjectTable projects={projects} onOpen={onOpen} highlightDepartmentId={departmentId} />
      )}

      {/* Pagination */}
      {view !== 'analytics' && (meta.pages ?? 1) > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
          >Previous</button>
          <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
            Page {meta.page ?? page} of {meta.pages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= (meta.pages ?? 1)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
          >Next</button>
        </div>
      )}

      {reportsOpen && <PortfolioReports onClose={() => setReportsOpen(false)} />}
    </div>
  )
}

function ProjectTable({
  projects, onOpen, highlightDepartmentId,
}: { projects: ProjectSummary[]; onOpen: (id: string) => void; highlightDepartmentId?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
      <table className="nexus-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Title</th>
            <th>Type</th>
            <th>Health</th>
            <th>Progress</th>
            <th>PM</th>
            <th>Departments</th>
            <th>Target End</th>
            <th>Tasks</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const percent = toPercent(p.percentComplete)
            const slip = slipDays(p)
            return (
              <tr key={p.id} className="clickable-row" onClick={() => onOpen(p.id)}>
                <td className="font-mono text-xs text-[var(--text-tertiary)] whitespace-nowrap">
                  {p.projectNumber ?? '—'}
                </td>
                {/* The title identifies the row, so it gets the width. Type
                    was whitespace-nowrap with no cap, which let it expand and
                    squeeze titles down to "Goddess…". */}
                <td className="font-medium text-[var(--text-primary)] min-w-[240px] w-[38%]">
                  <span className="line-clamp-1">{p.title}</span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    {STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </td>
                <td className="text-[var(--text-secondary)] text-xs max-w-[180px]">
                  <span className="line-clamp-1">{p.projectType?.label ?? '—'}</span>
                </td>
                <td><HealthDot band={p.healthBand} score={p.health} /></td>
                <td className="min-w-[110px]">
                  <div className="flex items-center gap-2">
                    <ProgressBar percent={percent} />
                    <span className="tabular-nums text-xs text-[var(--text-secondary)] w-9 text-right">{percent}%</span>
                  </div>
                </td>
                <td className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                  {p.projectManager?.name ?? '—'}
                </td>
                <td><DepartmentLaneChips departments={p.departments} max={3} highlightDepartmentId={highlightDepartmentId} /></td>
                <td className="whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs" style={{ color: slip > 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                      {formatDate(p.targetEndDate)}
                    </span>
                    <SlipBadge days={slip} />
                  </div>
                </td>
                <td className="tabular-nums text-xs text-[var(--text-secondary)]">{p._count?.tasks ?? 0}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ListSkeleton({ view }: { view: 'cards' | 'table' }) {
  const rows = Array.from({ length: 5 })
  if (view === 'cards') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {rows.map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 animate-pulse">
            <div className="h-3 w-20 rounded bg-[var(--bg-overlay)] mb-3" />
            <div className="h-4 w-3/4 rounded bg-[var(--bg-overlay)] mb-2" />
            <div className="h-1.5 w-full rounded bg-[var(--bg-overlay)] mt-4" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
      {rows.map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border-subtle)] last:border-0 animate-pulse">
          <div className="h-3 w-16 rounded bg-[var(--bg-overlay)]" />
          <div className="h-3 flex-1 rounded bg-[var(--bg-overlay)]" />
          <div className="h-3 w-20 rounded bg-[var(--bg-overlay)]" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({
  hasFilters, label, onCreate, onClear,
}: { hasFilters: boolean; label: string; onCreate: () => void; onClear: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-default)] py-16 text-center">
      <div
        className="mx-auto mb-3 w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ background: 'var(--accent-secondary-light)', color: 'var(--accent-secondary)' }}
      >
        <FolderKanban size={22} />
      </div>
      {hasFilters ? (
        <>
          <p className="text-sm text-[var(--text-secondary)]">No initiatives match these filters</p>
          <button onClick={onClear} className="mt-2 text-xs text-[var(--accent-secondary)] hover:underline">
            Clear filters
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-[var(--text-primary)]">Start your first initiative</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1 max-w-sm mx-auto">
            {label} has no projects yet. An initiative gives cross-department work an owner,
            a timeline, and a check-in rhythm.
          </p>
          <button
            onClick={onCreate}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white transition-all active:scale-[0.98]"
            style={{ background: 'var(--accent-secondary)' }}
          >
            <Plus size={14} />
            New Initiative
          </button>
        </>
      )}
    </div>
  )
}

function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] py-12 text-center" style={{ background: 'rgba(255,69,58,0.04)' }}>
      <p className="text-sm text-[var(--text-primary)]">Could not load projects</p>
      <p className="text-xs text-[var(--text-tertiary)] mt-1">{message ?? 'Something went wrong.'}</p>
      <button
        onClick={onRetry}
        className="mt-3 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        Try again
      </button>
    </div>
  )
}
