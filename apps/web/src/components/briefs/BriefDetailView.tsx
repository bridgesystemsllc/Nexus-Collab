import { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  Download,
  Edit3,
  Factory,
  Trash2,
  FileText,
  Users,
  Package,
  Calendar,
  MapPin,
  X,
} from 'lucide-react'
import type { BriefFormData } from './NewBriefModal'
import { TaskAttachments } from '@/components/shared/TaskAttachments'
import { AddToCowork } from '@/components/shared/AddToCowork'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { BriefStatusSelect } from './BriefStatusSelect'
import { generateBriefPDF } from '@/utils/generateBriefPDF'
import { api } from '@/lib/api'

type BriefDetail = BriefFormData & { id: string; statusUpdatedAt?: string }

interface BriefDetailViewProps {
  open: boolean
  brief: BriefDetail | null
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  /** Notifies the parent after a successful status PATCH so the list stays in sync. */
  onStatusChange?: (briefStatus: string, statusUpdatedAt?: string) => void
  /** Opens the linked CM's profile in the CM Productivity tab (cross-tab navigation). */
  onOpenCm?: (cmId: string) => void
}

function formatStatusUpdated(iso: string): string {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return iso
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 mb-3 border-b border-[var(--border-subtle)]">
      <Icon size={15} className="text-[var(--accent)]" />
      <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">{label}</h3>
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

function PhaseBar({ phase }: { phase: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <div
          key={n}
          className="h-2 flex-1 rounded-full"
          style={{ background: n <= phase ? 'var(--accent)' : 'var(--border-default)' }}
        />
      ))}
      <span className="text-[12px] text-[var(--text-tertiary)] ml-1 tabular-nums">{phase}/5</span>
    </div>
  )
}

export function BriefDetailView({ open, brief, onClose, onEdit, onDelete, onStatusChange, onOpenCm }: BriefDetailViewProps) {
  const [status, setStatus] = useState(brief?.briefStatus ?? '')
  const [statusUpdatedAt, setStatusUpdatedAt] = useState<string | undefined>(brief?.statusUpdatedAt)
  const [savingStatus, setSavingStatus] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  // Keep local status in sync when a (different) brief is opened or updated.
  useEffect(() => {
    setStatus(brief?.briefStatus ?? '')
    setStatusUpdatedAt(brief?.statusUpdatedAt)
  }, [brief?.id, brief?.briefStatus, brief?.statusUpdatedAt])

  if (!open || !brief) return null

  const handleDownload = () => {
    generateBriefPDF(brief)
  }

  const handleStatusChange = async (next: string) => {
    if (savingStatus || next === status) return
    const previous = status
    setStatus(next) // optimistic
    setSavingStatus(true)
    try {
      const { data: updated } = await api.patch(`/briefs/${brief.id}`, {
        data: { briefStatus: next },
      })
      const updatedAt = (updated?.data as { statusUpdatedAt?: string } | undefined)?.statusUpdatedAt
      setStatusUpdatedAt(updatedAt)
      setToast({ message: 'Status updated', type: 'success' })
      onStatusChange?.(next, updatedAt)
    } catch (err) {
      console.error('Failed to update brief status:', err)
      setStatus(previous) // revert
      setToast({ message: 'Failed to update status', type: 'error' })
    } finally {
      setSavingStatus(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative z-10 flex flex-col bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl w-full max-w-[880px] animate-slide-in-right"
        style={{ height: '100vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate">{brief.projectName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <BriefStatusSelect value={status} onChange={handleStatusChange} disabled={savingStatus} />
              <span className="text-[13px] text-[var(--text-tertiary)]">{brief.brand}</span>
              {statusUpdatedAt && (
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  · Status updated {formatStatusUpdated(statusUpdatedAt)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <AddToCowork
              item={{ name: brief.projectName, type: 'Brief', id: brief.id, description: brief.brand ? `Brief — ${brief.brand}` : 'Brief' }}
              variant="ghost"
            />
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all"
            >
              <Download size={14} /> PDF
            </button>
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

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Project Overview */}
          <div>
            <SectionHeader icon={FileText} label="Project Overview" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <DetailField label="Company" value={brief.companyName} />
              <DetailField label="Date of Request" value={brief.dateOfRequest} />
              <DetailField label="Brand" value={brief.brand} />
              <DetailField label="Sub-Brand" value={brief.subBrand} />
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">Contract Manufacturer</p>
                {(() => {
                  const cmId = brief.cmId
                  const cmName = brief.contractManufacturer || (brief as any).cm || ''
                  if (cmId) {
                    return (
                      <button
                        type="button"
                        onClick={() => onOpenCm?.(cmId)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-subtle)] text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 hover:underline transition-colors"
                      >
                        <Factory size={13} />
                        {cmName || 'CM Profile'}
                        <ArrowUpRight size={12} />
                      </button>
                    )
                  }
                  if (cmName) {
                    return (
                      <p className="text-[14px] text-[var(--text-primary)]">
                        {cmName}{' '}
                        <span className="text-[11px] text-[var(--text-tertiary)]">(unlinked)</span>
                      </p>
                    )
                  }
                  return <p className="text-[14px] text-[var(--text-primary)]">—</p>
                })()}
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Phase Progress</p>
                <PhaseBar phase={brief.phase} />
              </div>
            </div>
          </div>

          {/* Project Contacts */}
          {brief.projectContacts?.length > 0 && (
            <div>
              <SectionHeader icon={Users} label="Project Contacts" />
              <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                <table className="nexus-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Title / Role</th>
                      <th>Email</th>
                      <th>Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brief.projectContacts.map((c, i) => (
                      <tr key={i}>
                        <td className="font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {c.name || '—'}
                            {c.source === 'nexus' && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-[var(--accent-light)] text-[var(--accent)]">
                                Nexus
                              </span>
                            )}
                          </span>
                        </td>
                        <td>{c.role || '—'}</td>
                        <td className="text-[var(--accent)]">{c.email || '—'}</td>
                        <td>{c.phone || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Project Objective */}
          <div>
            <SectionHeader icon={FileText} label="Project Objective" />
            <p className="text-[14px] text-[var(--text-primary)] leading-relaxed p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              {brief.projectObjective || '—'}
            </p>
            {brief.ingredients && (
              <div className="mt-3">
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Ingredients</p>
                <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">{brief.ingredients}</p>
              </div>
            )}
          </div>

          {/* Business Information */}
          <div>
            <SectionHeader icon={Calendar} label="Business Information" />
            <div className="grid grid-cols-2 gap-4">
              <DetailField label="Target Availability Date" value={brief.targetAvailabilityDate} />
              <DetailField label="Target Formula Date" value={brief.targetFormulaDate} />
              <DetailField label="Target Stability Date" value={brief.targetStabilityDate} />
              <DetailField label="Target Scale Up Date" value={brief.targetScaleUpDate} />
              <DetailField label="Markets" value={brief.markets?.join(', ')} />
              <DetailField label="Target Retail Price" value={brief.targetRetailPrice} />
              <DetailField label="Projected Annual Volume" value={brief.projectedAnnualVolume} />
              <DetailField label="MOQ" value={brief.moq} />
              <DetailField label="Target Cost Per Unit" value={brief.targetCostPerUnit} />
            </div>
          </div>

          {/* Design Criteria */}
          <div>
            <SectionHeader icon={Package} label="Design Criteria" />
            <div className="grid grid-cols-2 gap-4">
              <DetailField label="Product Description" value={brief.productDescription} />
              <DetailField label="Current Product Line" value={brief.isCurrentLine} />
              <div className="col-span-2">
                <DetailField label="Consumer Experience" value={brief.consumerExperience} />
              </div>
              <DetailField label="Feel" value={brief.feel} />
              <DetailField label="Fragrance" value={brief.fragrance} />
              <DetailField label="Appearance" value={brief.appearance} />
              <DetailField label="Typical Usage" value={brief.typicalUsage} />
              <DetailField label="Target Retail Chain" value={brief.retailChain} />
              <div className="col-span-2">
                <DetailField label="Restricted Ingredients" value={brief.restrictedIngredients} />
              </div>
              <div className="col-span-2">
                <DetailField label="Requested Ingredients" value={brief.requestedIngredients} />
              </div>
              <div className="col-span-2">
                <DetailField label="Key Benefits" value={brief.keyBenefits} />
              </div>
              <div className="col-span-2">
                <DetailField label="Copy Claims" value={brief.copyClaims} />
              </div>
              <div className="col-span-2">
                <DetailField label="Clinical Claims" value={brief.clinicalClaims} />
              </div>
            </div>
          </div>

          {/* Packaging */}
          <div>
            <SectionHeader icon={Package} label="Package Design Criteria" />
            <div className="grid grid-cols-2 gap-4">
              <DetailField label="Target Demographics" value={brief.targetDemographics} />
              <DetailField label="Intended Package" value={brief.intendedPackage} />
              <DetailField label="Intended Closure" value={brief.intendedClosure} />
              <DetailField label="Packaging Material" value={brief.packagingMaterial} />
              <DetailField label="Label Type" value={brief.labelType} />
              <DetailField label="Label Artwork Colors" value={brief.labelArtwork} />
              <DetailField label="Secondary Package" value={brief.secondaryPackage} />
              <DetailField label="Kit / Combos" value={brief.kitCombos} />
              <DetailField label="Packaging Cost Per Unit" value={brief.packagingCostPerUnit} />
              <div className="col-span-2">
                <DetailField label="Case Packout" value={brief.casePackout} />
              </div>
            </div>
            {brief.benchmarkImageUrl && (
              <div className="mt-3">
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Benchmark Image</p>
                <img src={brief.benchmarkImageUrl} alt="Benchmark" className="max-w-[300px] rounded-lg border border-[var(--border-subtle)]" />
              </div>
            )}
          </div>

          {/* Team Members */}
          {brief.teamMembers?.length > 0 && (
            <div>
              <SectionHeader icon={Users} label="Team Members" />
              <div className="grid grid-cols-2 gap-2">
                {brief.teamMembers.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="w-8 h-8 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent)] text-[12px] font-semibold">
                      {m.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[var(--text-primary)]">{m.name || '—'}</p>
                      <p className="text-[11px] text-[var(--text-tertiary)]">{m.role || '—'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Task Attachments (email / file / comment) */}
          <TaskAttachments taskId={brief.id} module="active_brief" />

          {/* Supporting Documents */}
          {brief.supportingDocs?.length > 0 && (
            <div>
              <SectionHeader icon={FileText} label="Supporting Documents" />
              <div className="space-y-2">
                {brief.supportingDocs.map((doc, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]">
                    <FileText size={16} className="text-[var(--accent)]" />
                    <span className="text-[13px] text-[var(--text-primary)] flex-1">{doc.name}</span>
                    {doc.source === 'onedrive' && (
                      <span className="text-[11px] text-[var(--success)] font-medium">OneDrive</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
