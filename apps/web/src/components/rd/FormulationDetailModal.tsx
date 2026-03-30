import { useState, useMemo } from 'react'
import {
  X,
  Edit3,
  Trash2,
  Beaker,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
  Plus,
  FileText,
  Shield,
  AlertTriangle,
  Download,
  ExternalLink,
  FlaskConical,
  ListChecks,
  ClipboardList,
} from 'lucide-react'
import { IssueLogger } from '@/components/rd/IssueLogger'
import type { Issue } from '@/components/rd/IssueLogger'
import { NotesFeed } from '@/components/rd/NotesFeed'
import type { NoteEntry } from '@/components/rd/NotesFeed'
import { DocumentPanel } from '@/components/rd/DocumentPanel'
import type { FormulationFormData } from './NewFormulationModal'

// ─── Props ────────────────────────────────────────────────

interface FormulationDetailModalProps {
  open: boolean
  formulation: any
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  briefItems?: any[]
}

// ─── Helpers ──────────────────────────────────────────────

function SectionCard({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
      <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[var(--border-subtle)]">
        <Icon size={15} className="text-[var(--accent)]" />
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">{label}</h3>
      </div>
      {children}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value?: string | number | boolean | null }) {
  const display =
    value === undefined || value === null || value === ''
      ? '—'
      : typeof value === 'boolean'
        ? value ? 'Yes' : 'No'
        : String(value)

  return (
    <div>
      <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[14px] text-[var(--text-primary)]">{display}</p>
    </div>
  )
}

function StatusBadge({ label, colorMap }: { label: string; colorMap: Record<string, { bg: string; text: string }> }) {
  const colors = colorMap[label] || { bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' }
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold"
      style={{ background: colors.bg, color: colors.text }}
    >
      {label || '—'}
    </span>
  )
}

const FORMULATION_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Draft: { bg: 'var(--bg-hover)', text: '#6B7280' },
  'In Review': { bg: 'var(--info-light)', text: '#3B82F6' },
  Approved: { bg: 'var(--success-light)', text: '#10B981' },
  Rejected: { bg: 'var(--danger-light)', text: '#EF4444' },
  Archived: { bg: 'var(--bg-hover)', text: '#6B7280' },
}

const STABILITY_COLORS: Record<string, { bg: string; text: string }> = {
  Pass: { bg: 'var(--success-light)', text: 'var(--success)' },
  Fail: { bg: 'var(--danger-light)', text: 'var(--danger)' },
  Pending: { bg: 'var(--warning-light)', text: 'var(--warning)' },
  Ongoing: { bg: 'var(--info-light)', text: 'var(--info)' },
}

const REGULATORY_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Compliant: { bg: 'var(--success-light)', text: 'var(--success)' },
  'Under Review': { bg: 'var(--warning-light)', text: 'var(--warning)' },
  'Non-Compliant': { bg: 'var(--danger-light)', text: 'var(--danger)' },
}

const FDA_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Cleared: { bg: 'var(--success-light)', text: 'var(--success)' },
  Pending: { bg: 'var(--warning-light)', text: 'var(--warning)' },
  'Not Required': { bg: 'var(--bg-hover)', text: '#6B7280' },
}

const CHANGE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'Ingredient Substitution': { bg: '#EDE9FE', text: '#7C3AED' },
  'Percentage Adjustment': { bg: '#DBEAFE', text: '#2563EB' },
  'Process Change': { bg: '#FEF3C7', text: '#D97706' },
  'Packaging Change': { bg: '#FCE7F3', text: '#DB2777' },
  'Regulatory Update': { bg: '#D1FAE5', text: '#059669' },
  'Cost Optimization': { bg: '#E0E7FF', text: '#4338CA' },
  'Performance Improvement': { bg: '#CCFBF1', text: '#0D9488' },
  Other: { bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' },
}

const ISSUE_CATEGORIES = [
  'Stability', 'Sensory', 'Efficacy', 'Microbial', 'Manufacturing',
  'Regulatory', 'Cost', 'Supply Chain', 'Other',
]

const CHANGE_TYPES = [
  'Ingredient Substitution', 'Percentage Adjustment', 'Process Change',
  'Packaging Change', 'Regulatory Update', 'Cost Optimization',
  'Performance Improvement', 'Other',
]

function sdsStatus(expiryDate: string): { label: string; bg: string; text: string } {
  if (!expiryDate) return { label: '—', bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' }
  const now = new Date()
  const expiry = new Date(expiryDate)
  const diffDays = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { label: 'Expired', bg: 'var(--danger-light)', text: 'var(--danger)' }
  if (diffDays <= 90) return { label: 'Expiring Soon', bg: 'var(--warning-light)', text: 'var(--warning)' }
  return { label: 'Current', bg: 'var(--success-light)', text: 'var(--success)' }
}

// ─── Main Component ───────────────────────────────────────

export function FormulationDetailModal({
  open,
  formulation,
  onClose,
  onEdit,
  onDelete,
  briefItems,
}: FormulationDetailModalProps) {
  const [expandedChange, setExpandedChange] = useState<number | null>(null)
  const [showChangeForm, setShowChangeForm] = useState(false)
  const [showSdsForm, setShowSdsForm] = useState(false)
  const [docsTab, setDocsTab] = useState<'documents' | 'sds'>('documents')

  // Change form state
  const [changeDesc, setChangeDesc] = useState('')
  const [changeType, setChangeType] = useState('Ingredient Substitution')
  const [changeRationale, setChangeRationale] = useState('')
  const [versionBump, setVersionBump] = useState<'patch' | 'minor'>('patch')

  // SDS form state
  const [sdsIngredient, setSdsIngredient] = useState('')
  const [sdsSupplier, setSdsSupplier] = useState('')
  const [sdsVersion, setSdsVersion] = useState('')
  const [sdsExpiry, setSdsExpiry] = useState('')

  if (!open || !formulation) return null

  const f = formulation as FormulationFormData & { id?: string }

  // Find critical issues
  const criticalIssue = f.issues?.find(
    (i: any) => i.priority === 'Critical' && i.status !== 'Resolved'
  )

  const linkedBrief = briefItems?.find((b: any) => b.id === f.linkedBriefId)

  // Version bump calculation
  function bumpVersion(current: string, type: 'patch' | 'minor'): string {
    const clean = current.replace('v', '')
    const parts = clean.split('.')
    const major = parseInt(parts[0]) || 1
    const minor = parseInt(parts[1]) || 0
    if (type === 'minor') return `v${major + 1}.0`
    return `v${major}.${minor + 1}`
  }

  const handleSaveChange = () => {
    if (!changeDesc.trim()) return
    // In a real app this would call an onUpdate prop
    setShowChangeForm(false)
    setChangeDesc('')
    setChangeType('Ingredient Substitution')
    setChangeRationale('')
    setVersionBump('patch')
  }

  const handleSaveSds = () => {
    if (!sdsIngredient.trim()) return
    setShowSdsForm(false)
    setSdsIngredient('')
    setSdsSupplier('')
    setSdsVersion('')
    setSdsExpiry('')
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative z-10 flex flex-col bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl w-full max-w-[880px] animate-slide-in-right"
        style={{ height: '100vh' }}
      >
        {/* ── Critical Issue Banner ────────────────────────── */}
        {criticalIssue && (
          <div className="flex items-center gap-2 px-6 py-2.5 bg-[var(--danger-light)] border-b border-[var(--danger)]/20">
            <AlertTriangle size={15} className="text-[var(--danger)] flex-shrink-0" />
            <span className="text-[13px] font-semibold text-[var(--danger)]">
              Critical Issue — {criticalIssue.description}
            </span>
          </div>
        )}

        {/* ── Header ───────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium">Formulation</span>
              {f.brand && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                  {f.brand}
                </span>
              )}
              {f.version && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums"
                  style={{ background: 'var(--accent)', color: '#fff', fontFamily: 'monospace' }}
                >
                  {f.version}
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate">{f.product}</h2>
            <div className="flex items-center gap-4 mt-1.5 text-[12px] text-[var(--text-tertiary)]">
              {f.createdBy && (
                <span className="flex items-center gap-1">
                  <User size={12} /> Created by {f.createdBy} &middot; {f.createdAt}
                </span>
              )}
              {f.updatedAt && (
                <span className="flex items-center gap-1">
                  <Calendar size={12} /> Modified {f.updatedAt}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium btn-primary"
            >
              <Edit3 size={14} /> Edit
            </button>
            <button
              onClick={onDelete}
              className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)] transition-colors"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Scrollable Body ──────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Linked Brief Chip */}
          {f.linkedBriefId && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium">Linked Brief:</span>
              {linkedBrief ? (
                <button className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent)]/20 hover:bg-[var(--accent)]/10 transition-colors">
                  <FileText size={12} />
                  {f.linkedBriefName || linkedBrief.projectName}
                  <ExternalLink size={10} />
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium bg-[var(--bg-surface)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
                  <FileText size={12} />
                  {f.linkedBriefName || f.linkedBriefId}
                </span>
              )}
            </div>
          )}

          {/* ── Core Info Grid (3x2) ──────────────────────── */}
          <div className="grid grid-cols-3 gap-4">
            <div className="data-cell">
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Version</p>
              <p className="text-[16px] font-semibold text-[var(--text-primary)] tabular-nums" style={{ fontFamily: 'monospace' }}>
                {f.version || 'v1.0'}
              </p>
            </div>
            <div className="data-cell">
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Status</p>
              <StatusBadge label={f.status} colorMap={FORMULATION_STATUS_COLORS} />
            </div>
            <div className="data-cell">
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Stability</p>
              <StatusBadge label={f.stability} colorMap={STABILITY_COLORS} />
            </div>
            <div className="data-cell">
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Regulatory Status</p>
              <StatusBadge label={f.regulatoryStatus} colorMap={REGULATORY_STATUS_COLORS} />
            </div>
            <div className="data-cell">
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">FDA Status</p>
              <StatusBadge label={f.fdaStatus} colorMap={FDA_STATUS_COLORS} />
            </div>
            <div className="data-cell">
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Formula Code</p>
              <p className="text-[14px] text-[var(--text-primary)] font-medium">{f.formulaCode || '—'}</p>
            </div>
          </div>

          {/* ── Formula Details ────────────────────────────── */}
          <SectionCard icon={FlaskConical} label="Formula Details">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <DetailField label="Base Formula Reference" value={f.baseFormulaRef} />
              <DetailField label="Product Category" value={f.category} />
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">OTC Drug Facts Required</p>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{
                    background: f.isOTC ? 'var(--warning-light)' : 'var(--bg-hover)',
                    color: f.isOTC ? 'var(--warning)' : 'var(--text-tertiary)',
                  }}
                >
                  {f.isOTC ? 'Yes' : 'No'}
                </span>
              </div>
              <DetailField label="pH Range" value={f.phRange} />
              <DetailField label="Viscosity" value={f.viscosity} />
              <DetailField label="Fill Weight / Volume" value={f.fillWeight} />
            </div>

            {/* Active Ingredients (only if OTC) */}
            {f.isOTC && f.activeIngredients && (
              <div className="mb-4 p-3 rounded-lg border border-[var(--warning)]/20 bg-[var(--warning-light)]">
                <p className="text-[11px] text-[var(--warning)] uppercase tracking-wider font-semibold mb-1">Active Ingredients (OTC)</p>
                <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap">{f.activeIngredients}</p>
              </div>
            )}

            {/* Full INCI */}
            {f.inciIngredients && (
              <div className="mb-4">
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">Full INCI / Ingredient List</p>
                <pre className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed p-3 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-sans">
                  {f.inciIngredients}
                </pre>
              </div>
            )}

            {/* Restricted Ingredients Chips */}
            {Array.isArray(f.restrictedIngredients) && f.restrictedIngredients.length > 0 && (
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">Restricted Ingredients</p>
                <div className="flex flex-wrap gap-1.5">
                  {f.restrictedIngredients.map((ri: string, i: number) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--danger-light)] text-[var(--danger)] border border-[var(--danger)]/15"
                    >
                      {ri}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          {/* ── FDA / Regulatory ───────────────────────────── */}
          <SectionCard icon={Shield} label="FDA / Regulatory">
            <div className="grid grid-cols-2 gap-4">
              <DetailField label="Regulatory Category" value={f.regulatoryCategory} />
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">Drug Facts Panel Required</p>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{
                    background: f.drugFactsRequired ? 'var(--warning-light)' : 'var(--bg-hover)',
                    color: f.drugFactsRequired ? 'var(--warning)' : 'var(--text-tertiary)',
                  }}
                >
                  {f.drugFactsRequired ? 'Yes' : 'No'}
                </span>
              </div>
              <DetailField label="Active Drug Ingredients" value={f.activeDrugIngredients} />
              <DetailField label="Intended Use" value={f.intendedUse} />
              <DetailField label="Warnings Required" value={f.warningsRequired} />
              <DetailField label="Preservative System" value={f.preservativeSystem} />
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">Stability Testing Required</p>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{
                    background: f.stabilityRequired ? 'var(--success-light)' : 'var(--bg-hover)',
                    color: f.stabilityRequired ? 'var(--success)' : 'var(--text-tertiary)',
                  }}
                >
                  {f.stabilityRequired ? 'Yes' : 'No'}
                </span>
              </div>
              <DetailField label="Stability Test Duration" value={f.stabilityDuration} />
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">Stability Test Status</p>
                <StatusBadge label={f.stabilityTestStatus || f.stability} colorMap={STABILITY_COLORS} />
              </div>
              <DetailField label="Stability Test Expiry Date" value={f.stabilityExpiryDate} />
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">PET Status</p>
                <StatusBadge label={f.petStatus} colorMap={{
                  Pass: { bg: 'var(--success-light)', text: 'var(--success)' },
                  Fail: { bg: 'var(--danger-light)', text: 'var(--danger)' },
                  Pending: { bg: 'var(--warning-light)', text: 'var(--warning)' },
                  'N/A': { bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' },
                }} />
              </div>
            </div>

            {/* Country Registrations */}
            {Array.isArray(f.countryRegistrations) && f.countryRegistrations.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">Country Registrations</p>
                <div className="flex flex-wrap gap-1.5">
                  {f.countryRegistrations.map((c: string, i: number) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--info-light)] text-[var(--info)] border border-[var(--info)]/15"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Regulatory Notes */}
            {f.regulatoryNotes && (
              <div className="mt-4">
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Regulatory Notes</p>
                <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap p-3 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                  {f.regulatoryNotes}
                </p>
              </div>
            )}
          </SectionCard>

          {/* ── Formulation Changes Log ────────────────────── */}
          <SectionCard icon={ListChecks} label="Formulation Changes Log">
            {Array.isArray(f.changes) && f.changes.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                <table className="nexus-table w-full text-[13px]">
                  <thead>
                    <tr>
                      <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Change #</th>
                      <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Description</th>
                      <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Type</th>
                      <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Changed By</th>
                      <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Date</th>
                      <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Version</th>
                      <th className="text-right py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.changes.map((change: any, idx: number) => (
                      <>
                        <tr
                          key={idx}
                          className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <td className="py-2 px-3 text-[var(--text-tertiary)] tabular-nums">{idx + 1}</td>
                          <td className="py-2 px-3 text-[var(--text-primary)] max-w-[220px]">
                            <p className="truncate">{change.description}</p>
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
                              style={{
                                background: (CHANGE_TYPE_COLORS[change.changeType] || CHANGE_TYPE_COLORS.Other).bg,
                                color: (CHANGE_TYPE_COLORS[change.changeType] || CHANGE_TYPE_COLORS.Other).text,
                              }}
                            >
                              {change.changeType}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-[var(--text-secondary)]">{change.changedBy || '—'}</td>
                          <td className="py-2 px-3 text-[var(--text-secondary)] whitespace-nowrap">{change.date}</td>
                          <td className="py-2 px-3 text-[var(--text-secondary)] tabular-nums whitespace-nowrap" style={{ fontFamily: 'monospace' }}>
                            {change.fromVersion} → {change.toVersion}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => setExpandedChange(expandedChange === idx ? null : idx)}
                              className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
                              title="View rationale"
                            >
                              {expandedChange === idx ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          </td>
                        </tr>
                        {expandedChange === idx && (
                          <tr key={`${idx}-expanded`} className="border-t border-[var(--border-subtle)]">
                            <td colSpan={7} className="py-3 px-6 bg-[var(--bg-surface)]">
                              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Rationale</p>
                              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                                {change.rationale || 'No rationale provided.'}
                              </p>
                              {change.approvedBy && (
                                <p className="text-[12px] text-[var(--text-tertiary)] mt-2">
                                  Approved by: <span className="text-[var(--text-secondary)] font-medium">{change.approvedBy}</span>
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[13px] text-[var(--text-tertiary)] py-4 text-center">No changes logged yet.</p>
            )}

            {/* Add Change Form */}
            {showChangeForm ? (
              <div className="mt-3 p-4 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-subtle)] space-y-3">
                <textarea
                  placeholder="Describe the change... (required)"
                  value={changeDesc}
                  onChange={(e) => setChangeDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] resize-none"
                />
                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    value={changeType}
                    onChange={(e) => setChangeType(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    {CHANGE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[var(--text-tertiary)]">Bump:</span>
                    {(['patch', 'minor'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setVersionBump(type)}
                        className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
                          versionBump === type
                            ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                            : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--accent)]'
                        }`}
                      >
                        {type === 'patch' ? 'Patch +0.1' : 'Minor +1.0'}
                      </button>
                    ))}
                    <span className="text-[12px] text-[var(--text-tertiary)] tabular-nums" style={{ fontFamily: 'monospace' }}>
                      {f.version || 'v1.0'} → {bumpVersion(f.version || 'v1.0', versionBump)}
                    </span>
                  </div>
                </div>
                <textarea
                  placeholder="Rationale for this change..."
                  value={changeRationale}
                  onChange={(e) => setChangeRationale(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] resize-none"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => { setShowChangeForm(false); setChangeDesc(''); setChangeRationale('') }}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveChange}
                    disabled={!changeDesc.trim()}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
                  >
                    Save Change
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowChangeForm(true)}
                className="flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
              >
                <Plus size={13} /> Add Formula Change
              </button>
            )}
          </SectionCard>

          {/* ── Problems & Issues ──────────────────────────── */}
          <SectionCard icon={AlertTriangle} label="Problems & Issues">
            <IssueLogger
              issues={(f.issues || []) as any}
              onAdd={() => {}}
              onResolve={() => {}}
              categories={ISSUE_CATEGORIES}
              title="Formulation Issues"
            />
          </SectionCard>

          {/* ── Notes Feed ─────────────────────────────────── */}
          <SectionCard icon={ClipboardList} label="Notes">
            <NotesFeed
              notes={f.notes || []}
              onAdd={() => {}}
              onDelete={() => {}}
              currentUser={f.createdBy}
            />
          </SectionCard>

          {/* ── Documents & SDS Panel ──────────────────────── */}
          <SectionCard icon={FileText} label="Documents & SDS">
            {/* Tabs */}
            <div className="flex items-center gap-0 mb-4 border-b border-[var(--border-subtle)] -mt-1">
              {([
                { key: 'documents' as const, label: 'Documents', count: (f.files?.length || 0) + (f.sharepointLinks?.length || 0) },
                { key: 'sds' as const, label: 'SDS Sheets', count: f.sdsSheets?.length || 0 },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setDocsTab(tab.key)}
                  className="px-4 py-2 text-[13px] font-medium transition-colors relative"
                  style={{ color: docsTab === tab.key ? 'var(--accent)' : 'var(--text-tertiary)' }}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="ml-1.5 text-[11px] tabular-nums">({tab.count})</span>
                  )}
                  {docsTab === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Documents Tab */}
            {docsTab === 'documents' && (
              <DocumentPanel
                files={(f.files || []) as any}
                sharepointLinks={f.sharepointLinks || []}
                onUploadFiles={() => {}}
                onRemoveFile={() => {}}
                onAddSharePointLink={() => {}}
                onRemoveSharePointLink={() => {}}
              />
            )}

            {/* SDS Sheets Tab */}
            {docsTab === 'sds' && (
              <div>
                {Array.isArray(f.sdsSheets) && f.sdsSheets.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                    <table className="nexus-table w-full text-[13px]">
                      <thead>
                        <tr>
                          <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Ingredient / Chemical Name</th>
                          <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">SDS File</th>
                          <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Supplier</th>
                          <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Version / Date</th>
                          <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Expiry Date</th>
                          <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {f.sdsSheets.map((sheet: any, idx: number) => {
                          const status = sdsStatus(sheet.expiryDate)
                          return (
                            <tr
                              key={idx}
                              className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
                            >
                              <td className="py-2 px-3 text-[var(--text-primary)] font-medium">{sheet.ingredientName}</td>
                              <td className="py-2 px-3">
                                <a
                                  href={sheet.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                                >
                                  <FileText size={12} />
                                  {sheet.fileName || 'Download'}
                                  <Download size={10} />
                                </a>
                              </td>
                              <td className="py-2 px-3 text-[var(--text-secondary)]">{sheet.supplier || '—'}</td>
                              <td className="py-2 px-3 text-[var(--text-secondary)] whitespace-nowrap">{sheet.version || '—'}</td>
                              <td className="py-2 px-3 text-[var(--text-secondary)] whitespace-nowrap">{sheet.expiryDate || '—'}</td>
                              <td className="py-2 px-3">
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
                                  style={{ background: status.bg, color: status.text }}
                                >
                                  {status.label}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-[13px] text-[var(--text-tertiary)] py-4 text-center">No SDS sheets uploaded yet.</p>
                )}

                {/* Add SDS Form */}
                {showSdsForm ? (
                  <div className="mt-3 p-4 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-subtle)] space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Ingredient Name *</label>
                        <input
                          type="text"
                          value={sdsIngredient}
                          onChange={(e) => setSdsIngredient(e.target.value)}
                          placeholder="e.g. Sodium Lauryl Sulfate"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Supplier</label>
                        <input
                          type="text"
                          value={sdsSupplier}
                          onChange={(e) => setSdsSupplier(e.target.value)}
                          placeholder="e.g. BASF"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">SDS Version / Date</label>
                        <input
                          type="text"
                          value={sdsVersion}
                          onChange={(e) => setSdsVersion(e.target.value)}
                          placeholder="e.g. Rev 4.0 — 2025-01-15"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Expiry Date</label>
                        <input
                          type="date"
                          value={sdsExpiry}
                          onChange={(e) => setSdsExpiry(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">SDS File (PDF)</label>
                      <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-input)] cursor-pointer hover:border-[var(--accent)] transition-colors">
                        <FileText size={14} className="text-[var(--text-tertiary)]" />
                        <span className="text-[12px] text-[var(--text-tertiary)]">Choose PDF file...</span>
                        <input type="file" accept=".pdf" className="hidden" />
                      </label>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => { setShowSdsForm(false); setSdsIngredient(''); setSdsSupplier(''); setSdsVersion(''); setSdsExpiry('') }}
                        className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveSds}
                        disabled={!sdsIngredient.trim()}
                        className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
                      >
                        Save SDS
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSdsForm(true)}
                    className="flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
                  >
                    <Plus size={13} /> Upload SDS Sheet
                  </button>
                )}
              </div>
            )}
          </SectionCard>

        </div>
      </div>
    </div>
  )
}
