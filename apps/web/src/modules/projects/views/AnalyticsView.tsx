import { useQuery } from '@tanstack/react-query'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { AlertTriangle, Ban, Clock, Info, TrendingUp, Users } from 'lucide-react'
import * as client from '../api/projectsClient'
import { useProjectScope } from '../context/ProjectScopeContext'
import { CountUp } from '../components/CountUp'
import { HEALTH_COLORS } from '../types'

// ─── Analytics ───────────────────────────────────────────────
// Five panels over the five analytics endpoints. Each one answers a question a
// person actually asks on a Monday: how is the portfolio, is it getting better
// or worse, who is overloaded, which project types run late, and who is not
// answering their check-ins.
//
// Every panel states what it does not know. A dashboard that renders a
// confident zero where it has no data is worse than one that says so.

export function AnalyticsView() {
  const { departmentId, label, isPortfolio } = useProjectScope()
  const scope = departmentId ? { departmentId } : {}

  const summary = useQuery({
    queryKey: ['projects', 'analytics', 'summary', departmentId ?? 'all'],
    queryFn: async () => (await client.fetchAnalyticsSummary(scope)).data,
  })
  const trend = useQuery({
    queryKey: ['projects', 'analytics', 'trend', departmentId ?? 'all'],
    queryFn: async () => (await client.fetchHealthTrend({ ...scope, days: 90 })).data,
  })
  const workload = useQuery({
    queryKey: ['projects', 'analytics', 'workload', departmentId ?? 'all'],
    queryFn: async () => (await client.fetchWorkload(scope)).data,
  })
  const cycle = useQuery({
    queryKey: ['projects', 'analytics', 'cycle', departmentId ?? 'all'],
    queryFn: async () => (await client.fetchCycleTime(scope)).data,
  })
  const compliance = useQuery({
    queryKey: ['projects', 'analytics', 'compliance', departmentId ?? 'all'],
    queryFn: async () => (await client.fetchCheckinCompliance(scope)).data,
  })

  if (summary.isLoading) return <AnalyticsSkeleton />
  if (summary.isError) {
    return (
      <Panel title="Analytics">
        <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">
          {(summary.error as any)?.message ?? 'Could not load analytics'}
        </p>
      </Panel>
    )
  }

  const s = summary.data!

  return (
    <div className="stagger space-y-4">
      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Active initiatives"
          value={s.active}
          sub={`${s.total} total${isPortfolio ? '' : ` in ${label}`}`}
        />
        <Kpi
          label="Average completion"
          value={s.averagePercentComplete}
          suffix="%"
          sub="across active work"
        />
        <Kpi
          label="At risk"
          value={s.atRisk}
          tone={s.atRisk > 0 ? 'warning' : undefined}
          sub={s.atRisk === 0 ? 'everything green' : 'amber or red'}
        />
        <Kpi
          label="Overdue"
          value={s.overdue}
          tone={s.overdue > 0 ? 'danger' : undefined}
          sub={`${s.dueSoon} due in 14 days`}
        />
      </div>

      {/* ── Operational counts ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat icon={Ban} label="Blocked tasks" value={s.openBlockedTasks} tone="danger" />
        <MiniStat icon={Clock} label="Overdue tasks" value={s.overdueTasks} tone="warning" />
        <MiniStat icon={AlertTriangle} label="Overdue milestones" value={s.overdueMilestones} tone="warning" />
        <MiniStat icon={AlertTriangle} label="Critical risks" value={s.openCriticalRisks} tone="danger" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ── Health trend ── */}
        <Panel
          title="Health over time"
          icon={TrendingUp}
          hint={
            trend.data && trend.data.coverage.daysWithData < trend.data.coverage.daysRequested
              ? trend.data.coverage.daysWithData === 0
                ? 'No history recorded yet — the nightly sweep writes one point per project per day.'
                : `${trend.data.coverage.daysWithData} of the last 90 days have data. History starts ${trend.data.coverage.firstDay}.`
              : undefined
          }
        >
          {trend.isLoading ? (
            <Skeleton className="h-48" />
          ) : !trend.data || trend.data.coverage.daysWithData === 0 ? (
            <Empty>
              Nothing to plot yet. Health is recorded once a day; the chart fills in from tomorrow.
            </Empty>
          ) : (
            <HealthTrendChart points={trend.data.points} />
          )}
        </Panel>

        {/* ── Health mix ── */}
        <Panel title="Where the portfolio stands">
          <div className="space-y-3">
            <BandBar byHealth={s.byHealth} total={s.total} />
            <Distribution label="By priority" rows={s.byPriority} />
            <Distribution label="By status" rows={s.byStatus} />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 pt-1">
              <Row label="Average health" value={<CountUp value={s.averageHealth} suffix=" / 100" />} />
              <Row label="Projects slipping" value={<CountUp value={s.slip.projectsSlipping} />} />
              <Row
                label="Average slip"
                value={<CountUp value={s.slip.averageSlipDays} suffix=" days" />}
              />
              <Row label="Worst slip" value={<CountUp value={s.slip.maxSlipDays} suffix=" days" />} />
              <Row
                label="Budget spent"
                value={
                  s.budget.percentSpent === null
                    ? <span className="text-[var(--text-tertiary)]">no budgets set</span>
                    : <CountUp value={s.budget.percentSpent} suffix="%" />
                }
              />
              <Row
                label="Without a budget"
                value={<CountUp value={s.budget.projectsWithoutBudget} />}
              />
            </dl>
          </div>
        </Panel>
      </div>

      {/* ── Workload ── */}
      <Panel
        title="Who is carrying what"
        icon={Users}
        hint="Open tasks only — closed work is not a load."
      >
        {workload.isLoading ? (
          <Skeleton className="h-32" />
        ) : !workload.data?.assignees.length ? (
          <Empty>No open tasks in this scope.</Empty>
        ) : (
          <Table
            head={['', 'Open', 'Overdue', 'Blocked', 'Est. hours', 'Departments']}
            rows={workload.data.assignees.map((a) => [
              <span className={a.ownerId ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] italic'}>
                {a.ownerName}
              </span>,
              <Num v={a.open} />,
              <Num v={a.overdue} tone={a.overdue > 0 ? 'danger' : undefined} />,
              <Num v={a.blocked} tone={a.blocked > 0 ? 'warning' : undefined} />,
              a.estimatedHours === null
                ? <span className="text-[var(--text-tertiary)]">not estimated</span>
                : <Num v={a.estimatedHours} />,
              <span className="text-[var(--text-tertiary)]">{a.departments.join(', ') || '—'}</span>,
            ])}
          />
        )}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ── Cycle time ── */}
        <Panel
          title="Delivery time by type"
          hint="Slip is measured against the baseline. Projects that were never baselined are excluded, not scored as on time."
        >
          {cycle.isLoading ? (
            <Skeleton className="h-32" />
          ) : !cycle.data?.types.length ? (
            <Empty>No projects to measure yet.</Empty>
          ) : (
            <Table
              head={['Type', 'Projects', 'Avg slip', 'On time', 'No baseline']}
              rows={cycle.data.types.map((t) => [
                <span className="text-[var(--text-primary)]">{t.type}</span>,
                <Num v={t.projects} />,
                t.averageSlipDays === null
                  ? <Dash />
                  : <Num v={t.averageSlipDays} suffix="d" tone={t.averageSlipDays > 0 ? 'danger' : undefined} />,
                t.onTimePercent === null ? <Dash /> : <Num v={t.onTimePercent} suffix="%" />,
                <Num v={t.withoutBaseline} tone={t.withoutBaseline > 0 ? 'warning' : undefined} />,
              ])}
            />
          )}
        </Panel>

        {/* ── Check-in compliance ── */}
        <Panel
          title="Check-in compliance"
          hint={
            compliance.data && compliance.data.overall.stillOpen > 0
              ? `${compliance.data.overall.stillOpen} check-in${compliance.data.overall.stillOpen === 1 ? '' : 's'} still within their window, not counted here.`
              : 'Only check-ins whose window has closed are counted.'
          }
        >
          {compliance.isLoading ? (
            <Skeleton className="h-32" />
          ) : !compliance.data?.departments.length ? (
            <Empty>No check-ins have closed in the last 90 days.</Empty>
          ) : (
            <Table
              head={['Department', 'Asked', 'Answered', 'Rate', 'On time', 'Turnaround']}
              rows={compliance.data.departments.map((d) => [
                <span className="text-[var(--text-primary)]">{d.department}</span>,
                <Num v={d.asked} />,
                <Num v={d.answered} />,
                <Num v={d.rate} suffix="%" tone={d.rate < 60 ? 'danger' : d.rate < 85 ? 'warning' : undefined} />,
                <Num v={d.onTimeRate} suffix="%" />,
                d.averageHoursToRespond === null
                  ? <Dash />
                  : <Num v={d.averageHoursToRespond} decimals={1} suffix="h" />,
              ])}
            />
          )}
        </Panel>
      </div>
    </div>
  )
}

// ─── Chart ───────────────────────────────────────────────────

function HealthTrendChart({ points }: { points: client.HealthTrend['points'] }) {
  // Days with no snapshot are dropped from the plot rather than drawn as zero.
  // A gap in recording is not a day on which every project vanished.
  const data = points
    .filter((p) => p.total > 0)
    .map((p) => ({ ...p, label: p.day.slice(5) }))

  return (
    <div className="h-48 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            {(['GREEN', 'AMBER', 'RED'] as const).map((band) => (
              <linearGradient key={band} id={`grad-${band}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={HEALTH_COLORS[band]} stopOpacity={0.5} />
                <stop offset="100%" stopColor={HEALTH_COLORS[band]} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
            axisLine={false} tickLine={false} minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} allowDecimals={false}
            axisLine={false} tickLine={false} width={28}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 12, fontSize: 11,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            }}
            labelStyle={{ color: 'var(--text-tertiary)' }}
          />
          {(['RED', 'AMBER', 'GREEN'] as const).map((band) => (
            <Area
              key={band} type="monotone" dataKey={band} stackId="1"
              stroke={HEALTH_COLORS[band]} fill={`url(#grad-${band})`} strokeWidth={1.5}
              isAnimationActive
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** A compact chip row for a count-by breakdown — priority, status, and the like. */
function Distribution({ label, rows }: { label: string; rows: { key: string; count: number }[] }) {
  if (rows.length === 0) return null
  return (
    <div>
      <p className="mb-1 text-[11px] text-[var(--text-tertiary)]">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <span
            key={r.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
          >
            {r.key.replace(/_/g, ' ').toLowerCase()}
            <b className="tabular-nums text-[var(--text-primary)]">{r.count}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

function BandBar({ byHealth, total }: { byHealth: { key: string; count: number }[]; total: number }) {
  if (total === 0) return <Empty>No projects in this scope.</Empty>
  const order = ['GREEN', 'AMBER', 'RED']
  const bands = order
    .map((k) => ({ key: k, count: byHealth.find((b) => b.key === k)?.count ?? 0 }))
    .filter((b) => b.count > 0)

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-overlay)]">
        {bands.map((b) => (
          <div
            key={b.key}
            className="h-full transition-[width] duration-700"
            style={{
              width: `${(b.count / total) * 100}%`,
              background: HEALTH_COLORS[b.key as keyof typeof HEALTH_COLORS],
            }}
            title={`${b.count} ${b.key.toLowerCase()}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        {bands.map((b) => (
          <span key={b.key} className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: HEALTH_COLORS[b.key as keyof typeof HEALTH_COLORS] }}
            />
            {b.key.toLowerCase()}
            <b className="tabular-nums text-[var(--text-primary)]">{b.count}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Primitives ──────────────────────────────────────────────

const TONE: Record<string, string> = {
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  success: 'var(--success)',
}

function Kpi({
  label, value, suffix, sub, tone,
}: { label: string; value: number; suffix?: string; sub?: string; tone?: keyof typeof TONE }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 transition-all hover:border-[var(--border-strong)] hover:-translate-y-px">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p
        className="display-type mt-1 font-semibold tracking-tight"
        style={{ fontSize: 30, color: tone ? TONE[tone] : 'var(--text-primary)' }}
      >
        <CountUp value={value} suffix={suffix} />
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{sub}</p>}
    </div>
  )
}

function MiniStat({
  icon: Icon, label, value, tone,
}: { icon: React.ElementType; label: string; value: number; tone?: keyof typeof TONE }) {
  const active = value > 0
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5">
      <Icon size={14} style={{ color: active && tone ? TONE[tone] : 'var(--text-tertiary)' }} className="shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium leading-none" style={{ color: active && tone ? TONE[tone] : 'var(--text-primary)' }}>
          <CountUp value={value} />
        </p>
        <p className="mt-1 truncate text-[11px] text-[var(--text-tertiary)]">{label}</p>
      </div>
    </div>
  )
}

function Panel({
  title, icon: Icon, hint, children,
}: { title: string; icon?: React.ElementType; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <div className="mb-3">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
          {Icon && <Icon size={12} className="text-[var(--text-tertiary)]" />}
          {title}
        </h3>
        {hint && (
          <p className="mt-0.5 flex items-start gap-1 text-[11px] text-[var(--text-tertiary)]">
            <Info size={10} className="mt-0.5 shrink-0" />
            <span>{hint}</span>
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-overlay)]">
            {head.map((h, i) => (
              <th
                key={h + i}
                className={`px-2.5 py-1.5 font-medium text-[var(--text-tertiary)] whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--border-subtle)] last:border-0 transition-colors hover:bg-[var(--bg-overlay)]">
              {row.map((cell, j) => (
                <td key={j} className={`px-2.5 py-1.5 ${j === 0 ? 'text-left' : 'text-right tabular-nums'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const Num = ({ v, suffix, decimals, tone }: { v: number; suffix?: string; decimals?: number; tone?: keyof typeof TONE }) => (
  <CountUp
    value={v}
    suffix={suffix}
    decimals={decimals}
    style={{ color: tone && v > 0 ? TONE[tone] : 'var(--text-primary)' }}
  />
)

const Dash = () => <span className="text-[var(--text-tertiary)]">—</span>

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border-subtle)] py-1">
    <dt className="text-[11px] text-[var(--text-tertiary)]">{label}</dt>
    <dd className="text-[11px] font-medium text-[var(--text-primary)]">{value}</dd>
  </div>
)

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">{children}</p>
)

const Skeleton = ({ className }: { className?: string }) => (
  <div className={`skeleton rounded-lg ${className ?? 'h-24'}`} />
)

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-40" />
    </div>
  )
}
