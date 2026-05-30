import {
  BarChart3,
  CheckCircle2,
  DollarSign,
  Megaphone,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react'
import type { ElementType } from 'react'
import { useAppStore } from '@/stores/appStore'

const DEPARTMENT_DETAILS: Record<
  string,
  {
    name: string
    description: string
    icon: ElementType
    color: string
    metrics: { label: string; value: string; tone?: string }[]
    work: { title: string; status: string; owner: string; due: string }[]
  }
> = {
  'vendor-mgmt': {
    name: 'Vendor Mgmt',
    description: 'Vendor relationships, MOQ, PO management',
    icon: Truck,
    color: '#E8948A',
    metrics: [
      { label: 'Active Vendors', value: '12' },
      { label: 'Open POs', value: '8' },
      { label: 'MOQ Risks', value: '2', tone: 'var(--warning)' },
    ],
    work: [
      { title: 'Confirm TricorBraun bottle PO', status: 'Blocked', owner: 'Lisa C.', due: 'Mar 27' },
      { title: 'Paklab component pricing refresh', status: 'In Review', owner: 'Ahmad G.', due: 'Mar 30' },
    ],
  },
  finance: {
    name: 'Finance',
    description: 'COGS, margins, budgets',
    icon: BarChart3,
    color: '#00C7FF',
    metrics: [
      { label: 'Cost Reviews', value: '4' },
      { label: 'Margin Risks', value: '1', tone: 'var(--warning)' },
      { label: 'Approved', value: '9', tone: 'var(--success)' },
    ],
    work: [
      { title: 'Paklab 2026 pricing analysis', status: 'In Review', owner: 'David P.', due: 'Mar 30' },
      { title: 'AF Sensitive Kit cost review', status: 'Complete', owner: 'David P.', due: 'Mar 24' },
    ],
  },
  sales: {
    name: 'Sales',
    description: 'Customer demand, account signals, revenue follow-up',
    icon: TrendingUp,
    color: '#32D74B',
    metrics: [
      { label: 'Open Accounts', value: '7' },
      { label: 'At-Risk Orders', value: '2', tone: 'var(--danger)' },
      { label: 'Follow-ups', value: '11' },
    ],
    work: [
      { title: 'Amazon fill rate recovery plan', status: 'Not Started', owner: 'Ahmad G.', due: 'Mar 27' },
      { title: 'HSN Q3 promo readiness', status: 'Planning', owner: 'Sales', due: 'Apr 2' },
    ],
  },
  marketing: {
    name: 'Marketing',
    description: 'Launch assets, retail stories, campaign readiness',
    icon: Megaphone,
    color: '#BF5AF2',
    metrics: [
      { label: 'Launch Assets', value: '6' },
      { label: 'Reviews Pending', value: '3' },
      { label: 'Approved', value: '5', tone: 'var(--success)' },
    ],
    work: [
      { title: 'Create packaging artwork for 4 SKUs', status: 'In Progress', owner: 'Sarah K.', due: 'Apr 2' },
      { title: 'Scalp & Edge launch story', status: 'Draft', owner: 'Marketing', due: 'Apr 5' },
    ],
  },
}

export function CustomDeptPage() {
  const selectedDeptId = useAppStore((s) => s.selectedDeptId)
  const details = DEPARTMENT_DETAILS[selectedDeptId ?? ''] ?? DEPARTMENT_DETAILS['vendor-mgmt']
  const Icon = details.icon

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${details.color}20`, color: details.color }}
        >
          <Icon size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            {details.name}
          </h1>
          <p className="text-sm text-[var(--text-tertiary)]">{details.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {details.metrics.map((metric) => (
          <div key={metric.label} className="data-cell">
            <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
              {metric.label}
            </p>
            <p className="text-3xl font-semibold tabular-nums mt-2" style={{ color: metric.tone ?? 'var(--text-primary)' }}>
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
        <table className="nexus-table">
          <thead>
            <tr>
              <th>Workstream</th>
              <th>Status</th>
              <th>Owner</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {details.work.map((item) => (
              <tr key={item.title} className="clickable-row">
                <td className="font-medium text-[var(--text-primary)]">{item.title}</td>
                <td><span className="badge badge-info">{item.status}</span></td>
                <td className="text-[var(--text-secondary)]">{item.owner}</td>
                <td className="text-[var(--text-tertiary)]">{item.due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="data-cell flex items-start gap-3">
        <CheckCircle2 size={18} className="text-[var(--success)] mt-0.5" />
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Connected to command center workflows</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Department records continue to surface in Everything, Cowork Spaces, tasks, and Pulse as they are wired from live data.
          </p>
        </div>
      </div>
    </div>
  )
}
