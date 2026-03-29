import {
  ArrowRight,
  AlertTriangle,
  Beaker,
  Box,
  Calendar,
  Clock,
  Factory,
  FlaskConical,
  Package,
  Repeat2,
  Users,
} from 'lucide-react'
import { Dialog } from './Dialog'

interface ItemDetailDialogProps {
  item: any | null
  moduleType: string | null
  onClose: () => void
}

// ─── Brief Detail ─────────────────────────────────────────
function BriefDetail({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Brand" value={d.brand} />
        <Field label="Contract Manufacturer" value={d.cm} />
        <Field label="Status" value={d.status} badge />
        <Field label="Phase" value={`${d.phase} of ${d.totalPhases}`} />
      </div>
      <PhaseProgress phase={d.phase} total={d.totalPhases} />
      {d.notes && <NoteBlock text={d.notes} />}
    </div>
  )
}

// ─── CM Productivity Detail ───────────────────────────────
function CMDetail({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      {d.status === 'attention' && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--danger-light)] border border-[var(--danger)]">
          <AlertTriangle size={14} className="text-[var(--danger)]" />
          <span className="text-sm text-[var(--danger)] font-medium">Needs Attention</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <MetricCard label="On-Time Delivery" value={`${d.onTime}%`} color={d.onTime >= 90 ? 'var(--success)' : d.onTime >= 80 ? 'var(--warning)' : 'var(--danger)'} />
        <MetricCard label="Quality Score" value={`${d.quality}%`} color={d.quality >= 90 ? 'var(--success)' : d.quality >= 80 ? 'var(--warning)' : 'var(--danger)'} />
        <MetricCard label="Active POs" value={d.activePOs} />
        <MetricCard label="Open Issues" value={d.openIssues} color={d.openIssues > 0 ? 'var(--warning)' : undefined} />
      </div>
      {d.brands?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2 uppercase tracking-wider">Brands</p>
          <div className="flex flex-wrap gap-1.5">
            {d.brands.map((b: string) => (
              <span key={b} className="badge badge-info text-xs">{b}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tech Transfer Detail ─────────────────────────────────
function TransferDetail({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
        <div className="text-center flex-1">
          <p className="text-xs text-[var(--text-tertiary)]">From</p>
          <p className="text-sm font-medium text-[var(--text-primary)]">{d.from}</p>
        </div>
        <ArrowRight size={16} className="text-[var(--accent)]" />
        <div className="text-center flex-1">
          <p className="text-xs text-[var(--text-tertiary)]">To</p>
          <p className="text-sm font-medium text-[var(--text-primary)]">{d.to}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Status" value={d.status} badge />
        <Field label="Target Date" value={d.target} />
        <Field label="Documents" value={`${d.docs} files`} />
        <Field label="Progress" value={`${d.progress}%`} />
      </div>
      <ProgressBar value={d.progress} />
    </div>
  )
}

// ─── Formulation Detail ───────────────────────────────────
function FormulationDetail({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Version" value={d.ver} mono />
        <Field label="Status" value={d.status} badge />
        <Field label="Stability" value={d.stability} badge />
      </div>
      {d.changes && (
        <div>
          <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2 uppercase tracking-wider">Changes</p>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">{d.changes}</p>
        </div>
      )}
    </div>
  )
}

// ─── SKU Pipeline Detail ──────────────────────────────────
function SKUDetail({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="SKU" value={d.sku} mono />
        <Field label="UPC" value={d.upc} mono />
        <Field label="Status" value={d.status} badge />
        <Field label="Owner" value={d.owner} />
        <Field label="Step" value={`${d.step} of ${d.totalSteps}`} />
      </div>
      <StepVisualization step={d.step} total={d.totalSteps} />
      {d.blocker && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-[var(--danger-light)] border border-[var(--danger)]">
          <AlertTriangle size={14} className="text-[var(--danger)] mt-0.5" />
          <div>
            <p className="text-xs font-medium text-[var(--danger)]">Blocker</p>
            <p className="text-sm text-[var(--danger)]">{d.blocker}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Inventory Detail ─────────────────────────────────────
function InventoryDetail({ d }: { d: any }) {
  const statusColors: Record<string, string> = {
    emergency: 'var(--danger)',
    critical: 'var(--warning)',
    healthy: 'var(--success)',
    overstock: 'var(--info)',
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="SKU" value={d.sku} mono />
        <Field label="Status">
          <span className="font-medium" style={{ color: statusColors[d.status] ?? 'var(--text-secondary)' }}>{d.status}</span>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="On-Hand" value={d.onHand?.toLocaleString()} />
        <MetricCard label="Committed" value={d.committed?.toLocaleString()} />
        <MetricCard label="Available" value={d.available?.toLocaleString()} color={d.available === 0 ? 'var(--danger)' : undefined} />
      </div>
      <MetricCard
        label="Coverage"
        value={`${d.coverageMonths} months`}
        color={
          d.coverageMonths === 0 ? 'var(--danger)' :
          d.coverageMonths < 1 ? 'var(--warning)' :
          d.coverageMonths > 20 ? 'var(--info)' : undefined
        }
      />
    </div>
  )
}

// ─── Production Detail ────────────────────────────────────
function ProductionDetail({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="PO Number" value={d.poNumber} mono />
        <Field label="Status" value={d.status} badge />
        <Field label="Manufacturer" value={d.cm} />
        <Field label="Quantity" value={d.qty?.toLocaleString()} />
        <Field label="ETA" value={d.eta} />
      </div>
      <div>
        <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2 uppercase tracking-wider">Progress</p>
        <ProgressBar value={d.progress} />
      </div>
    </div>
  )
}

// ─── Shared Components ────────────────────────────────────
function Field({ label, value, badge, mono, children }: { label: string; value?: any; badge?: boolean; mono?: boolean; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-tertiary)] mb-1">{label}</p>
      {children ?? (
        badge ? (
          <span className="badge badge-accent text-xs">{value}</span>
        ) : (
          <p className={`text-sm text-[var(--text-primary)] ${mono ? 'font-mono' : ''}`}>{value ?? '--'}</p>
        )
      )}
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: any; color?: string }) {
  return (
    <div className="p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
      <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
      <p className="text-lg font-semibold tabular-nums" style={{ color: color ?? 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-[var(--text-tertiary)]">Progress</span>
        <span className="tabular-nums text-[var(--text-secondary)]">{value}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, background: value === 100 ? 'var(--success)' : 'var(--accent)' }}
        />
      </div>
    </div>
  )
}

function PhaseProgress({ phase, total }: { phase: number; total: number }) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2 uppercase tracking-wider">Phase Progress</p>
      <div className="flex items-center gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className="h-2.5 flex-1 rounded-full"
            style={{ background: i < phase ? 'var(--accent)' : 'var(--border-default)' }}
          />
        ))}
        <span className="text-xs text-[var(--text-tertiary)] tabular-nums ml-1">{phase}/{total}</span>
      </div>
    </div>
  )
}

function StepVisualization({ step, total }: { step: number; total: number }) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2 uppercase tracking-wider">Pipeline Steps</p>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="flex items-center">
            <div
              className={`w-4 h-4 rounded-full border-2 transition-colors ${
                i < step ? 'bg-[var(--accent)] border-[var(--accent)]' : 'bg-transparent border-[var(--border-default)]'
              } ${i === step - 1 ? 'ring-2 ring-[var(--accent-glow)]' : ''}`}
            />
            {i < total - 1 && (
              <div className="w-6 h-0.5 mx-0.5" style={{ background: i < step ? 'var(--accent)' : 'var(--border-default)' }} />
            )}
          </div>
        ))}
        <span className="text-xs text-[var(--text-tertiary)] ml-2 tabular-nums">{step}/{total}</span>
      </div>
    </div>
  )
}

function NoteBlock({ text }: { text: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2 uppercase tracking-wider">Notes</p>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">{text}</p>
    </div>
  )
}

// ─── Module Type to Title/Icon Mapping ────────────────────
const MODULE_CONFIG: Record<string, { title: string; icon: React.ElementType }> = {
  BRIEFS: { title: 'Brief', icon: Beaker },
  CM_PRODUCTIVITY: { title: 'Contract Manufacturer', icon: Users },
  TECH_TRANSFERS: { title: 'Tech Transfer', icon: Repeat2 },
  FORMULATIONS: { title: 'Formulation', icon: FlaskConical },
  SKU_PIPELINE: { title: 'SKU Pipeline', icon: Package },
  INVENTORY_HEALTH: { title: 'Inventory', icon: Box },
  PRODUCTION_TRACKING: { title: 'Production Order', icon: Factory },
}

// ─── Main Component ───────────────────────────────────────
export function ItemDetailDialog({ item, moduleType, onClose }: ItemDetailDialogProps) {
  if (!item || !moduleType) return null

  const d = item.data
  const config = MODULE_CONFIG[moduleType]
  const itemName = d?.name || d?.product || d?.poNumber || config?.title || 'Item'

  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      title={itemName}
      subtitle={config?.title}
      wide
    >
      {moduleType === 'BRIEFS' && <BriefDetail d={d} />}
      {moduleType === 'CM_PRODUCTIVITY' && <CMDetail d={d} />}
      {moduleType === 'TECH_TRANSFERS' && <TransferDetail d={d} />}
      {moduleType === 'FORMULATIONS' && <FormulationDetail d={d} />}
      {moduleType === 'SKU_PIPELINE' && <SKUDetail d={d} />}
      {moduleType === 'INVENTORY_HEALTH' && <InventoryDetail d={d} />}
      {moduleType === 'PRODUCTION_TRACKING' && <ProductionDetail d={d} />}
    </Dialog>
  )
}
