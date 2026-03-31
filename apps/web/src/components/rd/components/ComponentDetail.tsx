import { useState, useMemo } from 'react'
import {
  X,
  Edit3,
  Star,
  Plus,
  ChevronDown,
  ChevronRight,
  Check,
  AlertTriangle,
  Clock,
  Package,
  FileText,
  Activity,
  Beaker,
  DollarSign,
  Users,
  ShieldCheck,
  Upload,
  Layers,
} from 'lucide-react'
import type {
  Component,
  FeasibilityStatus,
  CompatibilityResult,
  CompatibilityTest,
  ComponentRisk,
  ProductAssignment,
  RiskSeverity,
  MilestoneStatus,
} from './componentData'
import {
  COMPONENT_TYPE_COLORS,
  FEASIBILITY_STATUS_COLORS,
  COMPATIBILITY_BADGES,
  ALL_FEASIBILITY_STATUSES,
  TEST_TYPES,
  VENDOR_CERTIFICATIONS,
  getWorstCompatibility,
  getBestUnitCost,
  calculateLandedCost,
} from './componentData'

// ── Types ──────────────────────────────────────────────────────

type TabId =
  | 'overview'
  | 'feasibility'
  | 'vendors'
  | 'moq'
  | 'assignments'
  | 'compatibility'
  | 'files'
  | 'activity'

interface Props {
  open: boolean
  component: Component | null
  onClose: () => void
  onComponentUpdate: (updates: Partial<Component>) => void
}

// ── Tab Definitions ────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: Package },
  { id: 'feasibility', label: 'Feasibility & Timeline', icon: Clock },
  { id: 'vendors', label: 'Vendors & Quotes', icon: Users },
  { id: 'moq', label: 'MOQ & Cost', icon: DollarSign },
  { id: 'assignments', label: 'Assignments', icon: Layers },
  { id: 'compatibility', label: 'Compatibility', icon: Beaker },
  { id: 'files', label: 'Files & Specs', icon: FileText },
  { id: 'activity', label: 'Activity', icon: Activity },
]

// ── Pipeline Stages ────────────────────────────────────────────

const PIPELINE_STAGES: FeasibilityStatus[] = [
  'Concept',
  'Feasibility Review',
  'Sampling',
  'Sample Testing',
  'Compatibility Testing',
  'Cost Negotiation',
  'Approved',
  'Conditionally Approved',
  'Active',
  'Discontinued',
  'On Hold',
  'Replaced',
]

// ── File Categories ────────────────────────────────────────────

const FILE_CATEGORIES = [
  'Technical Drawings',
  'Vendor Quotes',
  'Sample Photos',
  'Test Reports',
  'SDS/Safety',
  'Certifications',
  'Reference',
]

// ── Severity Colors ────────────────────────────────────────────

const SEVERITY_COLORS: Record<RiskSeverity, string> = {
  Low: '#10B981',
  Medium: '#F59E0B',
  High: '#F97316',
  Critical: '#EF4444',
}

const MILESTONE_STATUS_COLORS: Record<MilestoneStatus, string> = {
  'Not Started': '#6B7280',
  'In Progress': '#3B82F6',
  'Completed': '#10B981',
  'Skipped': '#9CA3AF',
  'Overdue': '#EF4444',
}

const PRIORITY_COLORS: Record<string, string> = {
  Low: '#6B7280',
  Medium: '#3B82F6',
  High: '#F59E0B',
  Critical: '#EF4444',
}

// ── Small Reusable Components ──────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: `${color}18`, color }}
    >
      {label}
    </span>
  )
}

function DetailField({ label, value }: { label: string; value?: string | number | boolean | null }) {
  const display =
    value === undefined || value === null || value === ''
      ? '\u2014'
      : typeof value === 'boolean'
        ? value
          ? 'Yes'
          : 'No'
        : String(value)
  return (
    <div>
      <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[13px] text-[var(--text-primary)]">{display}</p>
    </div>
  )
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 mb-3 border-b border-[var(--border-subtle)]">
      <Icon size={15} className="text-[var(--accent)]" />
      <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">{label}</h3>
    </div>
  )
}

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={12}
          fill={n <= value ? '#F59E0B' : 'transparent'}
          className={n <= value ? 'text-[#F59E0B]' : 'text-[var(--text-tertiary)]'}
        />
      ))}
    </div>
  )
}

function CompatIcon({ status }: { status: CompatibilityResult }) {
  const badge = COMPATIBILITY_BADGES[status]
  const icons: Record<CompatibilityResult, React.ReactNode> = {
    pass: <Check size={14} style={{ color: badge.color }} />,
    fail: <X size={14} style={{ color: badge.color }} />,
    conditional: <AlertTriangle size={14} style={{ color: badge.color }} />,
    not_tested: <span className="w-3.5 h-3.5 rounded-full border-2" style={{ borderColor: badge.color }} />,
    in_progress: <Clock size={14} style={{ color: badge.color }} />,
  }
  return (
    <div className="flex items-center justify-center" title={badge.label}>
      {icons[status]}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export function ComponentDetail({ open, component, onClose, onComponentUpdate }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [statusNotes, setStatusNotes] = useState('')
  const [newStatus, setNewStatus] = useState<FeasibilityStatus | ''>('')
  const [costQty, setCostQty] = useState<number>(1000)
  const [costVendorIdx, setCostVendorIdx] = useState<number>(0)
  const [showTestForm, setShowTestForm] = useState(false)
  const [showRiskForm, setShowRiskForm] = useState(false)
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [historicalExpanded, setHistoricalExpanded] = useState(false)
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)

  // Test form state
  const [testForm, setTestForm] = useState({
    productName: '',
    formulaReference: '',
    testType: TEST_TYPES[0],
    testDate: '',
    lab: '',
    testDuration: '',
    testProtocol: '',
    status: 'in_progress' as CompatibilityResult,
    resultNotes: '',
    reportFileUrl: '',
    followUpRequired: false,
  })

  // Risk form state
  const [riskForm, setRiskForm] = useState({
    description: '',
    severity: 'Medium' as RiskSeverity,
    mitigationPlan: '',
  })

  // Assign form state
  const [assignForm, setAssignForm] = useState({
    productName: '',
    brand: '',
    sku: '',
    channels: [] as string[],
    formulaReference: '',
    annualVolumeUnits: 0,
  })

  if (!open || !component) return null

  const vendors = component.vendors || []
  const moqTiers = component.moqTiers || []
  const assignments = component.productAssignments || []
  const tests = component.compatibilityTests || []
  const milestones = component.milestones || []
  const risks = component.risks || []
  const files = component.files || []
  const activityLog = component.activityLog || []
  const brands = component.brands || []
  const tags = component.tags || []
  const certs = component.certifications || []

  const typeColor = COMPONENT_TYPE_COLORS[component.type]
  const statusColor = FEASIBILITY_STATUS_COLORS[component.status]
  const worstCompat = getWorstCompatibility(tests)
  const compatBadge = COMPATIBILITY_BADGES[worstCompat]
  const bestCost = getBestUnitCost(moqTiers)
  const costIsUnder = component.targetCostPerUnit > 0 && bestCost > 0 && bestCost <= component.targetCostPerUnit
  const costIsOver = component.targetCostPerUnit > 0 && bestCost > 0 && bestCost > component.targetCostPerUnit
  const primaryVendor = vendors.find((v) => v.vendorStatus === 'Primary')
  const activeAssignments = assignments.filter((a) => a.assignmentStatus === 'Active')
  const candidateAssignments = assignments.filter((a) => a.assignmentStatus === 'Candidate')
  const historicalAssignments = assignments.filter(
    (a) => a.assignmentStatus !== 'Active' && a.assignmentStatus !== 'Candidate'
  )

  const daysToApproval = component.targetApprovalDate
    ? Math.ceil(
        (new Date(component.targetApprovalDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null

  const currentStageIndex = PIPELINE_STAGES.indexOf(component.status)

  // ── Handlers ──────────────────────────────────────────────

  const handleStatusUpdate = () => {
    if (!newStatus) return
    onComponentUpdate({
      status: newStatus,
      feasibilityNotes: statusNotes ? `${component.feasibilityNotes}\n[${new Date().toISOString().slice(0, 10)}] ${statusNotes}` : component.feasibilityNotes,
    })
    setNewStatus('')
    setStatusNotes('')
  }

  const handleMarkMilestoneComplete = (idx: number) => {
    const updated = [...milestones]
    updated[idx] = {
      ...updated[idx],
      status: 'Completed',
      actualDate: new Date().toISOString().slice(0, 10),
    }
    onComponentUpdate({ milestones: updated })
  }

  const handleSetPrimaryVendor = (idx: number) => {
    const updated = vendors.map((v, i) => ({
      ...v,
      vendorStatus: i === idx ? ('Primary' as const) : v.vendorStatus === 'Primary' ? ('Secondary' as const) : v.vendorStatus,
    }))
    onComponentUpdate({ vendors: updated })
  }

  const handleLogRisk = () => {
    if (!riskForm.description) return
    const newRisk: ComponentRisk = {
      ...riskForm,
      status: 'Open',
      loggedBy: 'Current User',
      loggedAt: new Date().toISOString().slice(0, 10),
    }
    onComponentUpdate({ risks: [...risks, newRisk] })
    setRiskForm({ description: '', severity: 'Medium', mitigationPlan: '' })
    setShowRiskForm(false)
  }

  const handleLogTest = () => {
    if (!testForm.productName || !testForm.testType) return
    const newTest: CompatibilityTest = { ...testForm }
    onComponentUpdate({ compatibilityTests: [...tests, newTest] })
    setTestForm({
      productName: '',
      formulaReference: '',
      testType: TEST_TYPES[0],
      testDate: '',
      lab: '',
      testDuration: '',
      testProtocol: '',
      status: 'in_progress',
      resultNotes: '',
      reportFileUrl: '',
      followUpRequired: false,
    })
    setShowTestForm(false)
  }

  const handleAssignProduct = () => {
    if (!assignForm.productName) return
    const newAssignment: ProductAssignment = {
      ...assignForm,
      assignmentStatus: 'Active',
      notes: '',
    }
    onComponentUpdate({ productAssignments: [...assignments, newAssignment] })
    setAssignForm({ productName: '', brand: '', sku: '', channels: [], formulaReference: '', annualVolumeUnits: 0 })
    setShowAssignForm(false)
  }

  // ── Cost Modeling ─────────────────────────────────────────

  const costModel = useMemo(() => {
    if (vendors.length === 0 || moqTiers.length === 0) return null
    const vendorTiers = moqTiers
    const applicableTier = [...vendorTiers]
      .sort((a, b) => a.moqQuantity - b.moqQuantity)
      .reverse()
      .find((t) => costQty >= t.moqQuantity)
    if (!applicableTier) return null
    const unitCost = applicableTier.unitCost
    const toolingAmortized = costQty > 0 ? applicableTier.toolingCost / costQty : 0
    const shipping = applicableTier.shippingCostPerUnit
    const duty = (unitCost * applicableTier.dutyRatePct) / 100
    const totalLanded = unitCost + toolingAmortized + shipping + duty
    const delta = totalLanded - component.targetCostPerUnit
    return { unitCost, toolingAmortized, shipping, duty, totalLanded, delta }
  }, [costQty, costVendorIdx, moqTiers, vendors, component.targetCostPerUnit])

  // ── Compatibility Matrix ──────────────────────────────────

  const uniqueProducts = useMemo(() => {
    const set = new Set(tests.map((t) => t.productName))
    return Array.from(set)
  }, [tests])

  const uniqueTestTypes = useMemo(() => {
    const set = new Set(tests.map((t) => t.testType))
    return Array.from(set)
  }, [tests])

  const compatCounts = useMemo(() => {
    let pass = 0, conditional = 0, fail = 0, notTested = 0
    tests.forEach((t) => {
      if (t.status === 'pass') pass++
      else if (t.status === 'conditional') conditional++
      else if (t.status === 'fail') fail++
      else notTested++
    })
    return { pass, conditional, fail, notTested }
  }, [tests])

  // ── Render Tabs ───────────────────────────────────────────

  const renderOverview = () => (
    <div className="space-y-6">
      <div>
        <SectionHeader icon={Package} label="Physical Specifications" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <DetailField label="Material" value={component.material} />
          <DetailField label="Color" value={component.color} />
          <DetailField label="Finish" value={component.finish} />
          <DetailField label="Weight (Empty)" value={component.weightEmpty} />
          <DetailField label="Country of Manufacture" value={component.countryOfManufacture} />
          <DetailField label="PCR Content %" value={component.pcrContentPct ? `${component.pcrContentPct}%` : null} />
          <DetailField label="Recyclable" value={component.isRecyclable} />
          <DetailField label="Sub-Type" value={component.subType} />
          <DetailField label="Description" value={component.description} />
          {certs.length > 0 && (
            <div>
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">Certifications</p>
              <div className="flex flex-wrap gap-1">
                {certs.map((c) => (
                  <Badge key={c} label={c} color="#8B5CF6" />
                ))}
              </div>
            </div>
          )}
          {Object.entries(component.typeSpecs || {}).map(([key, val]) => (
            <DetailField key={key} label={key} value={String(val)} />
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div>
        <SectionHeader icon={Activity} label="Quick Stats" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
            <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider">Active Assignments</p>
            <p className="text-xl font-bold text-[var(--text-primary)] mt-1">{activeAssignments.length}</p>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
            <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider">Best Unit Cost</p>
            <p className="text-xl font-bold mt-1" style={{ color: costIsUnder ? '#10B981' : costIsOver ? '#EF4444' : 'var(--text-primary)' }}>
              {bestCost > 0 ? `$${bestCost.toFixed(2)}` : '\u2014'}
            </p>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
            <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider">Total Vendors</p>
            <p className="text-xl font-bold text-[var(--text-primary)] mt-1">{vendors.length}</p>
          </div>
          <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
            <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider">Days to Target Approval</p>
            <p className="text-xl font-bold mt-1" style={{ color: daysToApproval !== null && daysToApproval < 0 ? '#EF4444' : 'var(--text-primary)' }}>
              {daysToApproval !== null ? daysToApproval : '\u2014'}
            </p>
          </div>
        </div>
      </div>

      {/* Status Update */}
      <div>
        <SectionHeader icon={ShieldCheck} label="Status Update" />
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as FeasibilityStatus)}
              className="nexus-input text-[13px] flex-1"
            >
              <option value="">Select new status...</option>
              {ALL_FEASIBILITY_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button onClick={handleStatusUpdate} className="btn-primary px-4 py-2 text-[13px]" disabled={!newStatus}>
              Update
            </button>
          </div>
          <textarea
            value={statusNotes}
            onChange={(e) => setStatusNotes(e.target.value)}
            placeholder="Add notes for this status change..."
            className="nexus-input text-[13px] min-h-[60px]"
          />
        </div>
      </div>
    </div>
  )

  const renderFeasibility = () => (
    <div className="space-y-6">
      {/* Pipeline */}
      <div>
        <SectionHeader icon={Clock} label="Stage Pipeline" />
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {PIPELINE_STAGES.map((stage, idx) => {
            const isCompleted = idx < currentStageIndex
            const isCurrent = idx === currentStageIndex
            const isUpcoming = idx > currentStageIndex
            return (
              <div key={stage} className="flex items-center gap-1 flex-shrink-0">
                {idx > 0 && (
                  <div
                    className="w-4 h-0.5"
                    style={{ background: isCompleted || isCurrent ? '#10B981' : 'var(--border-default)' }}
                  />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
                    style={{
                      borderColor: isCompleted ? '#10B981' : isCurrent ? '#3B82F6' : 'var(--border-default)',
                      background: isCompleted ? '#10B981' : 'transparent',
                      animation: isCurrent ? 'pulse 2s ease-in-out infinite' : undefined,
                      boxShadow: isCurrent ? '0 0 0 3px rgba(59,130,246,0.3)' : undefined,
                    }}
                  >
                    {isCompleted && <Check size={8} className="text-white" />}
                  </div>
                  <span
                    className="text-[9px] max-w-[60px] text-center leading-tight"
                    style={{
                      color: isCurrent ? '#3B82F6' : isCompleted ? '#10B981' : 'var(--text-tertiary)',
                      fontWeight: isCurrent ? 600 : 400,
                    }}
                  >
                    {stage}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Milestones */}
      <div>
        <SectionHeader icon={Check} label="Milestones" />
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Milestone</th>
                <th>Target Date</th>
                <th>Actual Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m, idx) => (
                <tr key={idx}>
                  <td className="text-[13px] font-medium">{m.milestoneName}</td>
                  <td className="text-[13px]">{m.targetDate || '\u2014'}</td>
                  <td className="text-[13px]">{m.actualDate || '\u2014'}</td>
                  <td>
                    <Badge label={m.status} color={MILESTONE_STATUS_COLORS[m.status]} />
                  </td>
                  <td>
                    {m.status !== 'Completed' && m.status !== 'Skipped' && (
                      <button
                        onClick={() => handleMarkMilestoneComplete(idx)}
                        className="text-[12px] text-[var(--accent)] hover:underline"
                      >
                        Mark Complete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Risks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionHeader icon={AlertTriangle} label="Risk Log" />
          <button
            onClick={() => setShowRiskForm(!showRiskForm)}
            className="flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline"
          >
            <Plus size={14} /> Log Risk
          </button>
        </div>
        {showRiskForm && (
          <div className="p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] mb-4 space-y-3">
            <input
              type="text"
              placeholder="Risk description"
              value={riskForm.description}
              onChange={(e) => setRiskForm({ ...riskForm, description: e.target.value })}
              className="nexus-input text-[13px] w-full"
            />
            <div className="flex gap-3">
              <select
                value={riskForm.severity}
                onChange={(e) => setRiskForm({ ...riskForm, severity: e.target.value as RiskSeverity })}
                className="nexus-input text-[13px] flex-1"
              >
                {(['Low', 'Medium', 'High', 'Critical'] as RiskSeverity[]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button onClick={handleLogRisk} className="btn-primary px-4 py-2 text-[13px]">Save</button>
            </div>
            <textarea
              placeholder="Mitigation plan"
              value={riskForm.mitigationPlan}
              onChange={(e) => setRiskForm({ ...riskForm, mitigationPlan: e.target.value })}
              className="nexus-input text-[13px] w-full min-h-[48px]"
            />
          </div>
        )}
        {risks.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
            <table className="nexus-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Mitigation</th>
                  <th>Logged</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((r, idx) => (
                  <tr key={idx}>
                    <td className="text-[13px]">{r.description}</td>
                    <td><Badge label={r.severity} color={SEVERITY_COLORS[r.severity]} /></td>
                    <td><Badge label={r.status} color={r.status === 'Open' ? '#EF4444' : r.status === 'Mitigated' ? '#10B981' : '#6B7280'} /></td>
                    <td className="text-[12px] text-[var(--text-secondary)] max-w-[200px] truncate">{r.mitigationPlan || '\u2014'}</td>
                    <td className="text-[12px] text-[var(--text-tertiary)]">{r.loggedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-[var(--text-tertiary)]">No risks logged.</p>
        )}
      </div>
    </div>
  )

  const renderVendors = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader icon={Users} label="Vendors & Quotes" />
        <button className="flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline">
          <Plus size={14} /> Add Vendor
        </button>
      </div>
      {vendors.length === 0 ? (
        <p className="text-[13px] text-[var(--text-tertiary)]">No vendors added yet.</p>
      ) : (
        <div className="grid gap-4">
          {vendors.map((v, idx) => (
            <div
              key={idx}
              className="p-4 rounded-lg border bg-[var(--bg-primary)]"
              style={{ borderColor: v.vendorStatus === 'Primary' ? '#10B981' : 'var(--border-subtle)' }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-[14px] font-semibold text-[var(--text-primary)]">{v.vendorName}</h4>
                    <Badge
                      label={v.vendorStatus}
                      color={
                        v.vendorStatus === 'Primary'
                          ? '#10B981'
                          : v.vendorStatus === 'Secondary'
                            ? '#3B82F6'
                            : v.vendorStatus === 'Evaluating'
                              ? '#F59E0B'
                              : '#EF4444'
                      }
                    />
                  </div>
                  <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">{v.vendorType} &middot; {v.port || 'Location N/A'}</p>
                </div>
                {v.vendorStatus !== 'Primary' && (
                  <button
                    onClick={() => handleSetPrimaryVendor(idx)}
                    className="text-[12px] px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    Set as Primary
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <DetailField label="Contact" value={v.contactName} />
                <DetailField label="Email" value={v.contactEmail} />
                <DetailField label="Phone" value={v.contactPhone} />
                <DetailField label="Lead Time" value={v.leadTimeWeeks ? `${v.leadTimeWeeks} weeks` : null} />
                <DetailField label="Part Number" value={v.vendorPartNumber} />
                <DetailField label="Payment Terms" value={v.paymentTerms} />
                <DetailField label="Incoterms" value={v.incoterms} />
              </div>
              {(v.certifications || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {(v.certifications || []).map((c) => (
                    <Badge key={c} label={c} color="#8B5CF6" />
                  ))}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Overall</p>
                    <StarRating value={v.ratingOverall} />
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Quality</p>
                    <StarRating value={v.ratingQuality} />
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Communication</p>
                    <StarRating value={v.ratingCommunication} />
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Delivery</p>
                    <StarRating value={v.ratingDelivery} />
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Cost</p>
                    <StarRating value={v.ratingCost} />
                  </div>
                </div>
              </div>
              {v.notes && (
                <p className="text-[12px] text-[var(--text-tertiary)] mt-2 italic">{v.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderMOQ = () => (
    <div className="space-y-6">
      {/* Comparison Table */}
      <div>
        <SectionHeader icon={DollarSign} label="MOQ Tier Comparison" />
        {moqTiers.length === 0 ? (
          <p className="text-[13px] text-[var(--text-tertiary)]">No MOQ tiers defined.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
            <table className="nexus-table">
              <thead>
                <tr>
                  <th>MOQ</th>
                  <th>Unit Cost</th>
                  <th>Tooling</th>
                  <th>Shipping/Unit</th>
                  <th>Duty %</th>
                  <th>Landed Cost</th>
                  <th>Quote Ref</th>
                  <th>Valid Until</th>
                </tr>
              </thead>
              <tbody>
                {[...moqTiers]
                  .sort((a, b) => a.moqQuantity - b.moqQuantity)
                  .map((tier, idx) => {
                    const landed = calculateLandedCost(tier)
                    const isBest = landed === Math.min(...moqTiers.map((t) => calculateLandedCost(t)))
                    return (
                      <tr key={idx} style={isBest ? { background: 'rgba(16,185,129,0.06)' } : undefined}>
                        <td className="text-[13px] font-medium">{tier.moqQuantity.toLocaleString()}</td>
                        <td className="text-[13px]">${tier.unitCost.toFixed(3)}</td>
                        <td className="text-[13px]">${tier.toolingCost.toLocaleString()}</td>
                        <td className="text-[13px]">${tier.shippingCostPerUnit.toFixed(3)}</td>
                        <td className="text-[13px]">{tier.dutyRatePct}%</td>
                        <td className="text-[13px] font-semibold" style={{ color: isBest ? '#10B981' : 'var(--text-primary)' }}>
                          ${landed.toFixed(3)}
                          {isBest && <span className="ml-1 text-[10px]">BEST</span>}
                        </td>
                        <td className="text-[12px] text-[var(--text-tertiary)]">{tier.quoteReference || '\u2014'}</td>
                        <td className="text-[12px] text-[var(--text-tertiary)]">{tier.expiryDate || '\u2014'}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cost Modeling Calculator */}
      <div>
        <SectionHeader icon={DollarSign} label="Cost Modeling Calculator" />
        <div className="p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Order Quantity</label>
              <input
                type="number"
                value={costQty}
                onChange={(e) => setCostQty(Number(e.target.value))}
                className="nexus-input text-[13px] w-full"
              />
            </div>
            <div className="flex-1">
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Vendor</label>
              <select
                value={costVendorIdx}
                onChange={(e) => setCostVendorIdx(Number(e.target.value))}
                className="nexus-input text-[13px] w-full"
              >
                {vendors.length > 0 ? (
                  vendors.map((v, i) => (
                    <option key={i} value={i}>{v.vendorName}</option>
                  ))
                ) : (
                  <option value={0}>No vendors</option>
                )}
              </select>
            </div>
          </div>

          {costModel ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-3 border-t border-[var(--border-subtle)]">
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase">Unit Cost</p>
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">${costModel.unitCost.toFixed(3)}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase">Tooling Amortized</p>
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">${costModel.toolingAmortized.toFixed(3)}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase">Shipping/Unit</p>
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">${costModel.shipping.toFixed(3)}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase">Duty</p>
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">${costModel.duty.toFixed(3)}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase">Total Landed Cost</p>
                <p className="text-[18px] font-bold" style={{
                  color: costModel.delta <= 0 ? '#10B981' : costModel.delta <= component.maxAcceptableCost - component.targetCostPerUnit ? '#F59E0B' : '#EF4444',
                }}>
                  ${costModel.totalLanded.toFixed(3)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase">vs Target Delta</p>
                <p className="text-[15px] font-bold" style={{ color: costModel.delta <= 0 ? '#10B981' : '#EF4444' }}>
                  {costModel.delta > 0 ? '+' : ''}{costModel.delta.toFixed(3)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-[var(--text-tertiary)]">Add MOQ tiers to model costs.</p>
          )}
        </div>
      </div>
    </div>
  )

  const renderAssignments = () => {
    const renderAssignmentTable = (items: ProductAssignment[], label: string) => (
      <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
        <table className="nexus-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Brand</th>
              <th>SKU</th>
              <th>Channel</th>
              <th>Formula</th>
              <th>Annual Volume</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a, idx) => (
              <tr key={idx}>
                <td className="text-[13px] font-medium">{a.productName}</td>
                <td className="text-[13px]">{a.brand}</td>
                <td className="text-[12px] text-[var(--text-tertiary)]">{a.sku || '\u2014'}</td>
                <td className="text-[12px]">{(a.channels || []).join(', ') || '\u2014'}</td>
                <td className="text-[12px] text-[var(--text-tertiary)]">{a.formulaReference || '\u2014'}</td>
                <td className="text-[13px]">{a.annualVolumeUnits ? a.annualVolumeUnits.toLocaleString() : '\u2014'}</td>
                <td><Badge label={a.assignmentStatus} color={a.assignmentStatus === 'Active' ? '#10B981' : a.assignmentStatus === 'Candidate' ? '#F59E0B' : '#6B7280'} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <SectionHeader icon={Layers} label="Product Assignments" />
          <button
            onClick={() => setShowAssignForm(!showAssignForm)}
            className="flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline"
          >
            <Plus size={14} /> Assign to Product
          </button>
        </div>

        {showAssignForm && (
          <div className="p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Product name"
                value={assignForm.productName}
                onChange={(e) => setAssignForm({ ...assignForm, productName: e.target.value })}
                className="nexus-input text-[13px]"
              />
              <input
                type="text"
                placeholder="Brand"
                value={assignForm.brand}
                onChange={(e) => setAssignForm({ ...assignForm, brand: e.target.value })}
                className="nexus-input text-[13px]"
              />
              <input
                type="text"
                placeholder="SKU"
                value={assignForm.sku}
                onChange={(e) => setAssignForm({ ...assignForm, sku: e.target.value })}
                className="nexus-input text-[13px]"
              />
              <input
                type="number"
                placeholder="Annual Volume"
                value={assignForm.annualVolumeUnits || ''}
                onChange={(e) => setAssignForm({ ...assignForm, annualVolumeUnits: Number(e.target.value) })}
                className="nexus-input text-[13px]"
              />
            </div>
            <button onClick={handleAssignProduct} className="btn-primary px-4 py-2 text-[13px]">Assign</button>
          </div>
        )}

        {activeAssignments.length > 0 && (
          <div>
            <h4 className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Active ({activeAssignments.length})</h4>
            {renderAssignmentTable(activeAssignments, 'Active')}
          </div>
        )}

        {candidateAssignments.length > 0 && (
          <div>
            <h4 className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Candidate ({candidateAssignments.length})</h4>
            {renderAssignmentTable(candidateAssignments, 'Candidate')}
          </div>
        )}

        {historicalAssignments.length > 0 && (
          <div>
            <button
              onClick={() => setHistoricalExpanded(!historicalExpanded)}
              className="flex items-center gap-1 text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 hover:text-[var(--text-primary)]"
            >
              {historicalExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Historical ({historicalAssignments.length})
            </button>
            {historicalExpanded && renderAssignmentTable(historicalAssignments, 'Historical')}
          </div>
        )}

        {assignments.length === 0 && (
          <p className="text-[13px] text-[var(--text-tertiary)]">No product assignments.</p>
        )}
      </div>
    )
  }

  const renderCompatibility = () => {
    return (
      <div className="space-y-6">
        {/* Summary KPIs */}
        <div>
          <SectionHeader icon={Beaker} label="Compatibility Summary" />
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-center">
              <p className="text-xl font-bold text-[#10B981]">{compatCounts.pass}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Compatible</p>
            </div>
            <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-center">
              <p className="text-xl font-bold text-[#F59E0B]">{compatCounts.conditional}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Conditional</p>
            </div>
            <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-center">
              <p className="text-xl font-bold text-[#EF4444]">{compatCounts.fail}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Incompatible</p>
            </div>
            <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-center">
              <p className="text-xl font-bold text-[#6B7280]">{compatCounts.notTested}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase">Not Tested</p>
            </div>
          </div>
        </div>

        {/* Matrix */}
        {uniqueProducts.length > 0 && uniqueTestTypes.length > 0 && (
          <div>
            <h4 className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Compatibility Matrix</h4>
            <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
              <table className="nexus-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    {uniqueTestTypes.map((tt) => (
                      <th key={tt} className="text-center text-[11px]">{tt}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uniqueProducts.map((prod) => (
                    <>
                      <tr
                        key={prod}
                        className="cursor-pointer hover:bg-[var(--bg-hover)]"
                        onClick={() => setExpandedProduct(expandedProduct === prod ? null : prod)}
                      >
                        <td className="text-[13px] font-medium flex items-center gap-1">
                          {expandedProduct === prod ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          {prod}
                        </td>
                        {uniqueTestTypes.map((tt) => {
                          const test = tests.find((t) => t.productName === prod && t.testType === tt)
                          return (
                            <td key={tt} className="text-center">
                              {test ? <CompatIcon status={test.status} /> : <span className="text-[var(--text-tertiary)]">\u2014</span>}
                            </td>
                          )
                        })}
                      </tr>
                      {expandedProduct === prod && (
                        <tr key={`${prod}-detail`}>
                          <td colSpan={uniqueTestTypes.length + 1} className="p-0">
                            <div className="p-3 bg-[var(--bg-primary)] border-t border-[var(--border-subtle)]">
                              <div className="space-y-2">
                                {tests
                                  .filter((t) => t.productName === prod)
                                  .map((t, tIdx) => (
                                    <div key={tIdx} className="flex items-start gap-3 text-[12px]">
                                      <Badge label={t.testType} color="#3B82F6" />
                                      <Badge label={COMPATIBILITY_BADGES[t.status].label} color={COMPATIBILITY_BADGES[t.status].color} />
                                      <span className="text-[var(--text-tertiary)]">{t.testDate || 'No date'}</span>
                                      <span className="text-[var(--text-tertiary)]">{t.lab || 'No lab'}</span>
                                      {t.resultNotes && (
                                        <span className="text-[var(--text-secondary)] italic">{t.resultNotes}</span>
                                      )}
                                      {t.followUpRequired && <Badge label="Follow-up" color="#F59E0B" />}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Log Test Form */}
        <div className="flex items-center justify-between">
          <h4 className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Log Test Result</h4>
          <button
            onClick={() => setShowTestForm(!showTestForm)}
            className="flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline"
          >
            <Plus size={14} /> Log Test Result
          </button>
        </div>
        {showTestForm && (
          <div className="p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Product name"
                value={testForm.productName}
                onChange={(e) => setTestForm({ ...testForm, productName: e.target.value })}
                className="nexus-input text-[13px]"
              />
              <select
                value={testForm.testType}
                onChange={(e) => setTestForm({ ...testForm, testType: e.target.value })}
                className="nexus-input text-[13px]"
              >
                {TEST_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="date"
                value={testForm.testDate}
                onChange={(e) => setTestForm({ ...testForm, testDate: e.target.value })}
                className="nexus-input text-[13px]"
              />
              <input
                type="text"
                placeholder="Lab"
                value={testForm.lab}
                onChange={(e) => setTestForm({ ...testForm, lab: e.target.value })}
                className="nexus-input text-[13px]"
              />
              <input
                type="text"
                placeholder="Duration (e.g. 12 weeks)"
                value={testForm.testDuration}
                onChange={(e) => setTestForm({ ...testForm, testDuration: e.target.value })}
                className="nexus-input text-[13px]"
              />
              <input
                type="text"
                placeholder="Protocol"
                value={testForm.testProtocol}
                onChange={(e) => setTestForm({ ...testForm, testProtocol: e.target.value })}
                className="nexus-input text-[13px]"
              />
              <select
                value={testForm.status}
                onChange={(e) => setTestForm({ ...testForm, status: e.target.value as CompatibilityResult })}
                className="nexus-input text-[13px]"
              >
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="conditional">Conditional</option>
                <option value="in_progress">In Progress</option>
                <option value="inconclusive">Inconclusive</option>
              </select>
              <input
                type="text"
                placeholder="Formula reference"
                value={testForm.formulaReference}
                onChange={(e) => setTestForm({ ...testForm, formulaReference: e.target.value })}
                className="nexus-input text-[13px]"
              />
            </div>
            <textarea
              placeholder="Result notes"
              value={testForm.resultNotes}
              onChange={(e) => setTestForm({ ...testForm, resultNotes: e.target.value })}
              className="nexus-input text-[13px] w-full min-h-[48px]"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={testForm.followUpRequired}
                  onChange={(e) => setTestForm({ ...testForm, followUpRequired: e.target.checked })}
                  className="rounded border-[var(--border-default)]"
                />
                Follow-up Required
              </label>
              <button onClick={handleLogTest} className="btn-primary px-4 py-2 text-[13px] ml-auto">Save Test</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderFiles = () => (
    <div className="space-y-6">
      <SectionHeader icon={FileText} label="Files & Specs" />
      {FILE_CATEGORIES.map((cat) => {
        const catFiles = files.filter((f) => f.category === cat)
        return (
          <div key={cat}>
            <h4 className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">{cat}</h4>
            {catFiles.length > 0 ? (
              <div className="space-y-1">
                {catFiles.map((f, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]"
                  >
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-[var(--text-tertiary)]" />
                      <span className="text-[13px] text-[var(--text-primary)]">{f.name}</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-tertiary)]">{f.uploadedAt} by {f.uploadedBy}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-2 border-dashed border-[var(--border-subtle)] rounded-lg p-4 flex flex-col items-center justify-center text-center">
                <Upload size={20} className="text-[var(--text-tertiary)] mb-1" />
                <p className="text-[12px] text-[var(--text-tertiary)]">Drop files here or click to upload</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  const renderActivity = () => (
    <div className="space-y-4">
      <SectionHeader icon={Activity} label="Activity Log" />
      {activityLog.length === 0 ? (
        <p className="text-[13px] text-[var(--text-tertiary)]">No activity recorded.</p>
      ) : (
        <div className="relative pl-6">
          <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-[var(--border-subtle)]" />
          {activityLog.map((entry, idx) => {
            // Determine dot color based on content
            const isStatus = entry.toLowerCase().includes('status')
            const isVendor = entry.toLowerCase().includes('vendor')
            const isTest = entry.toLowerCase().includes('test') || entry.toLowerCase().includes('compat')
            const isAssign = entry.toLowerCase().includes('assign') || entry.toLowerCase().includes('product')
            const isRisk = entry.toLowerCase().includes('risk')
            const dotColor = isStatus
              ? '#3B82F6'
              : isVendor
                ? '#8B5CF6'
                : isTest
                  ? '#F59E0B'
                  : isAssign
                    ? '#10B981'
                    : isRisk
                      ? '#EF4444'
                      : 'var(--text-tertiary)'
            return (
              <div key={idx} className="relative flex items-start gap-3 mb-4">
                <div
                  className="absolute -left-[17px] top-1.5 w-2.5 h-2.5 rounded-full border-2 bg-[var(--bg-elevated)]"
                  style={{ borderColor: dotColor }}
                />
                <p className="text-[13px] text-[var(--text-secondary)]">{entry}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverview()
      case 'feasibility':
        return renderFeasibility()
      case 'vendors':
        return renderVendors()
      case 'moq':
        return renderMOQ()
      case 'assignments':
        return renderAssignments()
      case 'compatibility':
        return renderCompatibility()
      case 'files':
        return renderFiles()
      case 'activity':
        return renderActivity()
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative z-10 flex flex-col min-h-0 bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl w-full max-w-[960px] h-screen animate-slide-in-right"
      >
        {/* ── Header ────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold text-white"
                  style={{ background: typeColor }}
                >
                  {component.type}
                </span>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate">{component.name}</h2>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[12px] text-[var(--text-tertiary)]">{component.partNumber}</span>
                {primaryVendor && (
                  <span className="text-[12px] text-[var(--text-tertiary)]">
                    Vendor: <span className="text-[var(--text-secondary)]">{primaryVendor.vendorName}</span>
                  </span>
                )}
                {primaryVendor && (
                  <span className="text-[12px] text-[var(--text-tertiary)]">
                    Lead: <span className="text-[var(--text-secondary)]">{primaryVendor.leadTimeWeeks}w</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium btn-primary">
                <Edit3 size={14} /> Edit
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Badge Row */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge label={component.status} color={statusColor} />
            <Badge label={component.priority} color={PRIORITY_COLORS[component.priority]} />
            {/* Unit cost vs target */}
            {bestCost > 0 && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{
                  background: costIsUnder ? 'rgba(16,185,129,0.12)' : costIsOver ? 'rgba(239,68,68,0.12)' : 'rgba(107,114,128,0.12)',
                  color: costIsUnder ? '#10B981' : costIsOver ? '#EF4444' : '#6B7280',
                }}
              >
                ${bestCost.toFixed(2)} / ${component.targetCostPerUnit.toFixed(2)} target
              </span>
            )}
            <Badge label={compatBadge.label} color={compatBadge.color} />
            {assignments.length > 0 && (
              <span className="text-[11px] text-[var(--text-tertiary)]">
                {activeAssignments.length} product{activeAssignments.length !== 1 ? 's' : ''}
              </span>
            )}
            {brands.map((b) => (
              <span
                key={b}
                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)]"
              >
                {b}
              </span>
            ))}
          </div>
        </div>

        {/* ── Tab Bar ───────────────────────────────────────── */}
        <div className="flex items-center gap-0.5 px-6 border-b border-[var(--border-subtle)] overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap"
                style={{
                  borderBottomColor: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
                }}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ── Body ──────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {renderTab()}
        </div>
      </div>
    </div>
  )
}

export default ComponentDetail
