import {
  Download,
  Edit3,
  Trash2,
  FileText,
  Users,
  Package,
  Calendar,
  MapPin,
  X,
} from 'lucide-react'
import type { BriefFormData } from './NewBriefModal'
import { generateBriefPDF } from '@/utils/generateBriefPDF'

interface BriefDetailViewProps {
  open: boolean
  brief: (BriefFormData & { id: string }) | null
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
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

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    Draft: { bg: 'var(--bg-hover)', text: '#6B7280' },
    'Brief Submitted': { bg: 'var(--info-light)', text: '#3B82F6' },
    'In Formulation': { bg: 'var(--warning-light)', text: '#F59E0B' },
    'Stability Testing': { bg: 'var(--danger-light)', text: '#EF4444' },
    'Formula Approved': { bg: 'var(--success-light)', text: '#10B981' },
  }
  const colors = colorMap[status] || colorMap['Draft']
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold"
      style={{ background: colors.bg, color: colors.text }}
    >
      {status}
    </span>
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

export function BriefDetailView({ open, brief, onClose, onEdit, onDelete }: BriefDetailViewProps) {
  if (!open || !brief) return null

  const handleDownload = () => {
    generateBriefPDF(brief)
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
              <StatusBadge status={brief.briefStatus} />
              <span className="text-[13px] text-[var(--text-tertiary)]">{brief.brand}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
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
              <DetailField label="Contract Manufacturer" value={brief.contractManufacturer} />
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
                    </tr>
                  </thead>
                  <tbody>
                    {brief.projectContacts.map((c, i) => (
                      <tr key={i}>
                        <td className="font-medium">{c.name || '—'}</td>
                        <td>{c.role || '—'}</td>
                        <td className="text-[var(--accent)]">{c.email || '—'}</td>
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
    </div>
  )
}
