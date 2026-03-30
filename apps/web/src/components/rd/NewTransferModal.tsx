import { useState, useEffect } from 'react'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Save,
  Plus,
  Trash2,
  Upload,
  FileText,
  ExternalLink,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────

export interface TransferFormData {
  product: string
  brand: string
  transferType: string
  priority: string
  linkedBriefId: string
  linkedBriefName: string
  requesterName: string
  requesterRole: string
  fromCM: string
  fromCMContact: string
  fromCMEmail: string
  fromFormulaRef: string
  fromLocation: string
  toCM: string
  toCMContact: string
  toCMEmail: string
  toFormulaRef: string
  toLocation: string
  transferGoal: string
  targetStartDate: string
  targetCompletionDate: string
  milestones: { label: string; targetDate: string; completed: boolean; completedDate: string; note: string }[]
  files: { name: string; url: string; source: string }[]
  sharepointLinks: { displayName: string; url: string }[]
  teamMembers: { name: string; role: string }[]
  status: string
  progress: number
  activityLog: { author: string; authorInitial: string; action: string; timestamp: string; type: string }[]
}

// ─── Constants ─────────────────────────────────────────────

const BRANDS = ["Carol's Daughter", 'Dermablend', 'Baxter of California', 'Ambi', 'AcneFree']
const TRANSFER_TYPES = ['Formula Transfer', 'Manufacturing Relocation', 'Scale-Up', 'Reformulation', 'New CM Onboarding']
const PRIORITIES = ['Critical', 'High', 'Standard']
const CM_OPTIONS = ['Kolmar', 'Cosway', 'Omnibus', 'Schwan Cosmetics', 'Mana Products']

const DEFAULT_MILESTONES = [
  'Brief Submitted',
  'Formula Shared',
  'Trial Batch Produced',
  'Stability Testing Started',
  'Stability Testing Complete',
  'Regulatory Review',
  'Scale-Up Approved',
  'Transfer Complete',
]

const STEPS = [
  'Basic Info',
  'Transfer Details',
  'Timeline',
  'Documents',
  'Team',
]

const EMPTY_FORM: TransferFormData = {
  product: '',
  brand: '',
  transferType: '',
  priority: 'Standard',
  linkedBriefId: '',
  linkedBriefName: '',
  requesterName: '',
  requesterRole: '',
  fromCM: '',
  fromCMContact: '',
  fromCMEmail: '',
  fromFormulaRef: '',
  fromLocation: '',
  toCM: '',
  toCMContact: '',
  toCMEmail: '',
  toFormulaRef: '',
  toLocation: '',
  transferGoal: '',
  targetStartDate: '',
  targetCompletionDate: '',
  milestones: DEFAULT_MILESTONES.map((label) => ({
    label,
    targetDate: '',
    completed: false,
    completedDate: '',
    note: '',
  })),
  files: [],
  sharepointLinks: [],
  teamMembers: [{ name: '', role: '' }],
  status: 'Draft',
  progress: 0,
  activityLog: [],
}

// ─── Props ─────────────────────────────────────────────────

interface NewTransferModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: TransferFormData) => void
  initialData?: TransferFormData | null
  isSubmitting?: boolean
  briefItems?: any[]
  cmItems?: any[]
}

// ─── Validation ────────────────────────────────────────────

function validateStep(step: number, form: TransferFormData): Record<string, string> {
  const errors: Record<string, string> = {}
  if (step === 0) {
    if (!form.product.trim()) errors.product = 'Product name is required'
  }
  if (step === 1) {
    if (!form.transferGoal.trim()) errors.transferGoal = 'Transfer goal / objective is required'
  }
  return errors
}

// ─── Shared Input Components ───────────────────────────────

function FormField({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
        {label}
        {required && <span className="text-[var(--danger)] ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[12px] text-[var(--danger)] mt-1">{error}</p>}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  error,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: boolean
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-[var(--bg-input)] border rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all ${
        error
          ? 'border-[var(--danger)] focus:border-[var(--danger)]'
          : 'border-[var(--border-default)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]'
      }`}
    />
  )
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
  error,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  error?: boolean
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`w-full bg-[var(--bg-input)] border rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all resize-y ${
        error
          ? 'border-[var(--danger)] focus:border-[var(--danger)]'
          : 'border-[var(--border-default)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]'
      }`}
    />
  )
}

function Select({
  value,
  onChange,
  options,
  placeholder,
  error,
  allowCustom,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  error?: boolean
  allowCustom?: boolean
}) {
  const [custom, setCustom] = useState(false)

  if (allowCustom && custom) {
    return (
      <div className="flex gap-2">
        <TextInput value={value} onChange={onChange} placeholder="Enter custom value" error={error} />
        <button
          type="button"
          onClick={() => setCustom(false)}
          className="text-[12px] text-[var(--accent)] hover:underline whitespace-nowrap"
        >
          Use list
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-[var(--bg-input)] border rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] outline-none transition-all ${
          error
            ? 'border-[var(--danger)]'
            : 'border-[var(--border-default)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]'
        }`}
      >
        <option value="">{placeholder || 'Select...'}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {allowCustom && (
        <button
          type="button"
          onClick={() => setCustom(true)}
          className="text-[12px] text-[var(--accent)] hover:underline whitespace-nowrap"
        >
          Custom
        </button>
      )}
    </div>
  )
}

// ─── Step Props ────────────────────────────────────────────

interface StepProps {
  form: TransferFormData
  setForm: (f: TransferFormData) => void
  errors: Record<string, string>
  briefItems?: any[]
  cmItems?: any[]
}

// ─── Step 1 — Basic Info ───────────────────────────────────

function Step1({ form, setForm, errors, briefItems }: StepProps) {
  const [briefSearch, setBriefSearch] = useState('')
  const [showBriefDropdown, setShowBriefDropdown] = useState(false)

  const filteredBriefs = (briefItems || []).filter((b: any) =>
    b.projectName?.toLowerCase().includes(briefSearch.toLowerCase())
  )

  const handleBriefSelect = (brief: any) => {
    setForm({
      ...form,
      linkedBriefId: brief.id,
      linkedBriefName: brief.projectName || '',
      product: brief.projectName || form.product,
      brand: brief.brand || form.brand,
    })
    setBriefSearch(brief.projectName || '')
    setShowBriefDropdown(false)
  }

  const clearBrief = () => {
    setForm({
      ...form,
      linkedBriefId: '',
      linkedBriefName: '',
    })
    setBriefSearch('')
  }

  return (
    <div className="space-y-5">
      <FormField label="Product Name" required error={errors.product}>
        <TextInput
          value={form.product}
          onChange={(v) => setForm({ ...form, product: v })}
          placeholder='e.g. "Ambi Fade Cream — Moderate"'
          error={!!errors.product}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Brand">
          <Select
            value={form.brand}
            onChange={(v) => setForm({ ...form, brand: v })}
            options={BRANDS}
            placeholder="Select brand"
          />
        </FormField>
        <FormField label="Transfer Type">
          <Select
            value={form.transferType}
            onChange={(v) => setForm({ ...form, transferType: v })}
            options={TRANSFER_TYPES}
            placeholder="Select type"
          />
        </FormField>
      </div>

      <FormField label="Priority">
        <div className="flex gap-2">
          {PRIORITIES.map((p) => {
            const colorMap: Record<string, string> = {
              Critical: 'var(--danger)',
              High: 'var(--warning)',
              Standard: '#6B7280',
            }
            const isActive = form.priority === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => setForm({ ...form, priority: p })}
                className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition-all ${
                  isActive
                    ? 'text-white border-transparent'
                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--accent)]'
                }`}
                style={isActive ? { background: colorMap[p] } : undefined}
              >
                {p}
              </button>
            )
          })}
        </div>
      </FormField>

      {/* Linked Brief */}
      <FormField label="Linked Brief (optional)">
        <div className="relative">
          <div className="flex gap-2">
            <input
              type="text"
              value={form.linkedBriefId ? form.linkedBriefName : briefSearch}
              onChange={(e) => {
                setBriefSearch(e.target.value)
                setShowBriefDropdown(true)
                if (form.linkedBriefId) clearBrief()
              }}
              onFocus={() => setShowBriefDropdown(true)}
              placeholder="Search briefs..."
              className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]"
            />
            {form.linkedBriefId && (
              <button
                type="button"
                onClick={clearBrief}
                className="px-2 text-[var(--text-tertiary)] hover:text-[var(--danger)]"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {showBriefDropdown && filteredBriefs.length > 0 && !form.linkedBriefId && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowBriefDropdown(false)} />
              <div className="absolute top-full left-0 right-0 mt-1 z-20 max-h-48 overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-xl">
                {filteredBriefs.map((b: any) => (
                  <button
                    key={b.id}
                    onClick={() => handleBriefSelect(b)}
                    className="w-full text-left px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <span className="font-medium">{b.projectName}</span>
                    {b.brand && (
                      <span className="ml-2 text-[var(--text-tertiary)]">{b.brand}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Requester Name">
          <TextInput
            value={form.requesterName}
            onChange={(v) => setForm({ ...form, requesterName: v })}
            placeholder="Full name"
          />
        </FormField>
        <FormField label="Requester Role">
          <TextInput
            value={form.requesterRole}
            onChange={(v) => setForm({ ...form, requesterRole: v })}
            placeholder="e.g. R&D Director"
          />
        </FormField>
      </div>
    </div>
  )
}

// ─── Step 2 — Transfer Details ─────────────────────────────

function Step2({ form, setForm, errors, cmItems }: StepProps) {
  const cmOptions = cmItems?.map((c: any) => c.name || c) || CM_OPTIONS

  return (
    <div className="space-y-5">
      {/* From CM */}
      <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-4">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">From / Sending CM</h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Contract Manufacturer">
            <Select
              value={form.fromCM}
              onChange={(v) => setForm({ ...form, fromCM: v })}
              options={cmOptions}
              placeholder="Select CM"
              allowCustom
            />
          </FormField>
          <FormField label="Location">
            <TextInput
              value={form.fromLocation}
              onChange={(v) => setForm({ ...form, fromLocation: v })}
              placeholder="e.g. Port Jervis, NY"
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Contact Name">
            <TextInput
              value={form.fromCMContact}
              onChange={(v) => setForm({ ...form, fromCMContact: v })}
              placeholder="Full name"
            />
          </FormField>
          <FormField label="Contact Email">
            <TextInput
              type="email"
              value={form.fromCMEmail}
              onChange={(v) => setForm({ ...form, fromCMEmail: v })}
              placeholder="email@company.com"
            />
          </FormField>
        </div>
        <FormField label="Formula Reference #">
          <TextInput
            value={form.fromFormulaRef}
            onChange={(v) => setForm({ ...form, fromFormulaRef: v })}
            placeholder="e.g. 14061-1.02"
          />
        </FormField>
      </div>

      {/* To CM */}
      <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-4">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">To / Receiving CM</h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Contract Manufacturer">
            <Select
              value={form.toCM}
              onChange={(v) => setForm({ ...form, toCM: v })}
              options={cmOptions}
              placeholder="Select CM"
              allowCustom
            />
          </FormField>
          <FormField label="Location">
            <TextInput
              value={form.toLocation}
              onChange={(v) => setForm({ ...form, toLocation: v })}
              placeholder="e.g. Greenville, SC"
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Contact Name">
            <TextInput
              value={form.toCMContact}
              onChange={(v) => setForm({ ...form, toCMContact: v })}
              placeholder="Full name"
            />
          </FormField>
          <FormField label="Contact Email">
            <TextInput
              type="email"
              value={form.toCMEmail}
              onChange={(v) => setForm({ ...form, toCMEmail: v })}
              placeholder="email@company.com"
            />
          </FormField>
        </div>
        <FormField label="Target Formula Reference # (optional)">
          <TextInput
            value={form.toFormulaRef}
            onChange={(v) => setForm({ ...form, toFormulaRef: v })}
            placeholder="TBD or reference number"
          />
        </FormField>
      </div>

      {/* Transfer Goal */}
      <FormField label="Transfer Goal / Objective" required error={errors.transferGoal}>
        <TextArea
          value={form.transferGoal}
          onChange={(v) => setForm({ ...form, transferGoal: v })}
          placeholder="Describe the goal and success criteria for this tech transfer"
          rows={5}
          error={!!errors.transferGoal}
        />
      </FormField>
    </div>
  )
}

// ─── Step 3 — Timeline ─────────────────────────────────────

function Step3({ form, setForm }: StepProps) {
  const updateMilestoneDate = (index: number, date: string) => {
    const milestones = [...form.milestones]
    milestones[index] = { ...milestones[index], targetDate: date }
    setForm({ ...form, milestones })
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Target Start Date">
          <TextInput
            type="date"
            value={form.targetStartDate}
            onChange={(v) => setForm({ ...form, targetStartDate: v })}
          />
        </FormField>
        <FormField label="Target Completion Date">
          <TextInput
            type="date"
            value={form.targetCompletionDate}
            onChange={(v) => setForm({ ...form, targetCompletionDate: v })}
          />
        </FormField>
      </div>

      <div className="pt-2 border-t border-[var(--border-subtle)]">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">
          Milestone Target Dates <span className="text-[12px] font-normal text-[var(--text-tertiary)]">(optional)</span>
        </h3>
        <div className="space-y-3">
          {form.milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <div className="w-6 h-6 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center text-[11px] font-bold text-[var(--accent)]">
                {i + 1}
              </div>
              <span className="flex-1 text-[13px] font-medium text-[var(--text-primary)]">{m.label}</span>
              <input
                type="date"
                value={m.targetDate}
                onChange={(e) => updateMilestoneDate(i, e.target.value)}
                className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)] transition-all"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Step 4 — Documents ────────────────────────────────────

function Step4({ form, setForm }: StepProps) {
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const newFiles = Array.from(files).map((f) => ({
      name: f.name,
      url: URL.createObjectURL(f),
      source: 'local',
    }))
    setForm({ ...form, files: [...form.files, ...newFiles] })
    e.target.value = ''
  }

  const removeFile = (i: number) => {
    setForm({ ...form, files: form.files.filter((_, idx) => idx !== i) })
  }

  const addSharePointLink = () => {
    if (!linkName.trim() || !linkUrl.trim()) return
    setForm({
      ...form,
      sharepointLinks: [...form.sharepointLinks, { displayName: linkName.trim(), url: linkUrl.trim() }],
    })
    setLinkName('')
    setLinkUrl('')
    setShowLinkForm(false)
  }

  const removeLink = (i: number) => {
    setForm({ ...form, sharepointLinks: form.sharepointLinks.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">File Uploads</h3>

        {form.files.length > 0 && (
          <div className="space-y-2 mb-3">
            {form.files.map((doc, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]">
                <FileText size={16} className="text-[var(--accent)] flex-shrink-0" />
                <span className="text-[13px] text-[var(--text-primary)] flex-1 truncate">{doc.name}</span>
                <button onClick={() => removeFile(i)} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)]">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <label className="flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] cursor-pointer hover:border-[var(--accent)] transition-colors">
          <Upload size={24} className="text-[var(--text-tertiary)]" />
          <span className="text-[13px] text-[var(--text-secondary)]">
            Drop files here or <span className="text-[var(--accent)] font-medium">browse</span>
          </span>
          <span className="text-[11px] text-[var(--text-tertiary)]">PDF, DOCX, XLSX, PNG, JPG</span>
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
            className="hidden"
            onChange={handleFileUpload}
          />
        </label>
      </div>

      {/* SharePoint Links */}
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">SharePoint Links</h3>

        {form.sharepointLinks.length > 0 && (
          <div className="space-y-2 mb-3">
            {form.sharepointLinks.map((link, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <ExternalLink size={16} style={{ color: '#0078D4', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{link.displayName}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)] truncate">{link.url}</p>
                </div>
                <button onClick={() => removeLink(i)} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)]">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {showLinkForm && (
          <div className="p-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-subtle)] space-y-2 mb-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Display Name"
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
              />
              <input
                type="url"
                placeholder="https://..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => { setShowLinkForm(false); setLinkName(''); setLinkUrl('') }}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addSharePointLink}
                disabled={!linkName.trim() || !linkUrl.trim()}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {!showLinkForm && (
          <button
            onClick={() => setShowLinkForm(true)}
            className="flex items-center gap-1.5 text-[13px] text-[var(--accent)] font-medium hover:underline"
          >
            <Plus size={14} /> Add Link
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Step 5 — Team ─────────────────────────────────────────

function Step5({ form, setForm }: StepProps) {
  const addMember = () => {
    setForm({ ...form, teamMembers: [...form.teamMembers, { name: '', role: '' }] })
  }
  const removeMember = (i: number) => {
    if (form.teamMembers.length > 1) {
      setForm({ ...form, teamMembers: form.teamMembers.filter((_, idx) => idx !== i) })
    }
  }
  const updateMember = (i: number, field: string, value: string) => {
    const members = [...form.teamMembers]
    members[i] = { ...members[i], [field]: value }
    setForm({ ...form, teamMembers: members })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Team Members</h3>
      <div className="space-y-3">
        {form.teamMembers.map((m, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="flex-1">
              <FormField label="Name">
                <TextInput value={m.name} onChange={(v) => updateMember(i, 'name', v)} placeholder="Full name" />
              </FormField>
            </div>
            <div className="flex-1">
              <FormField label="Title / Role">
                <TextInput value={m.role} onChange={(v) => updateMember(i, 'role', v)} placeholder="e.g. Formulation Chemist" />
              </FormField>
            </div>
            {form.teamMembers.length > 1 && (
              <button onClick={() => removeMember(i)} className="p-2 mb-0.5 text-[var(--text-tertiary)] hover:text-[var(--danger)]">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        <button onClick={addMember} className="flex items-center gap-1.5 text-[13px] text-[var(--accent)] font-medium hover:underline">
          <Plus size={14} /> Add Team Member
        </button>
      </div>
    </div>
  )
}

// ─── Main Modal ────────────────────────────────────────────

export function NewTransferModal({
  open,
  onClose,
  onSubmit,
  initialData,
  isSubmitting,
  briefItems,
  cmItems,
}: NewTransferModalProps) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<TransferFormData>(initialData || EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setForm(initialData || EMPTY_FORM)
      setStep(0)
      setErrors({})
    }
  }, [open, initialData])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const goNext = () => {
    const stepErrors = validateStep(step, form)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }
    setErrors({})
    if (step < STEPS.length - 1) setStep(step + 1)
  }

  const goBack = () => {
    if (step > 0) setStep(step - 1)
  }

  const handleSubmit = () => {
    const stepErrors = validateStep(step, form)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }
    const now = new Date().toLocaleString()
    const submissionData: TransferFormData = {
      ...form,
      status: form.status === 'Draft' ? 'Brief Submitted' : form.status,
      activityLog: [
        ...form.activityLog,
        {
          author: form.requesterName || 'System',
          authorInitial: form.requesterName?.charAt(0)?.toUpperCase() || 'S',
          action: initialData ? 'updated the tech transfer' : 'created the tech transfer',
          timestamp: now,
          type: initialData ? 'edit' : 'create',
        },
      ],
    }
    onSubmit(submissionData)
  }

  const handleSaveDraft = () => {
    const now = new Date().toLocaleString()
    const draftData: TransferFormData = {
      ...form,
      status: 'Draft',
      activityLog: [
        ...form.activityLog,
        {
          author: form.requesterName || 'System',
          authorInitial: form.requesterName?.charAt(0)?.toUpperCase() || 'S',
          action: 'saved as draft',
          timestamp: now,
          type: 'edit',
        },
      ],
    }
    onSubmit(draftData)
  }

  if (!open) return null

  const isLastStep = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Slide-over panel */}
      <div
        className="relative z-10 flex flex-col bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl w-full max-w-[880px] animate-slide-in-right"
        style={{ height: '100vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {initialData ? 'Edit Tech Transfer' : 'New Tech Transfer'}
            </h2>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">
              Step {step + 1} of {STEPS.length} — {STEPS[step]}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1.5 px-6 pt-4 pb-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors cursor-pointer"
              style={{ background: i <= step ? 'var(--accent)' : 'var(--border-default)' }}
              onClick={() => {
                if (i < step) setStep(i)
              }}
            />
          ))}
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && <Step1 form={form} setForm={setForm} errors={errors} briefItems={briefItems} cmItems={cmItems} />}
          {step === 1 && <Step2 form={form} setForm={setForm} errors={errors} cmItems={cmItems} />}
          {step === 2 && <Step3 form={form} setForm={setForm} errors={errors} />}
          {step === 3 && <Step4 form={form} setForm={setForm} errors={errors} />}
          {step === 4 && <Step5 form={form} setForm={setForm} errors={errors} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-subtle)]">
          <button
            onClick={goBack}
            disabled={step === 0}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[14px] font-medium transition-all ${
              step === 0
                ? 'text-[var(--text-tertiary)] cursor-not-allowed'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)]'
            }`}
          >
            <ChevronLeft size={16} /> Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[14px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all"
            >
              <Save size={15} /> Save Draft
            </button>

            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 btn-primary px-5 py-2.5 rounded-lg text-[14px]"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Transfer'}
              </button>
            ) : (
              <button onClick={goNext} className="flex items-center gap-1.5 btn-primary px-5 py-2.5 rounded-lg text-[14px]">
                Next <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export { EMPTY_FORM }
