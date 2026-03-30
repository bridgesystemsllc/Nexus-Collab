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
  FlaskConical,
  Shield,
  Users,
  Beaker,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────

export interface FormulationFormData {
  product: string
  brand: string
  category: string
  linkedBriefId: string
  linkedBriefName: string
  formulaCode: string
  baseFormulaRef: string
  isOTC: boolean
  version: string
  status: string
  stability: string
  regulatoryStatus: string
  fdaStatus: string
  activeIngredients: string
  inciIngredients: string
  restrictedIngredients: string[]
  phRange: string
  viscosity: string
  fillWeight: string
  regulatoryCategory: string
  countryRegistrations: string[]
  stabilityRequired: boolean
  stabilityDuration: string
  stabilityTestStatus: string
  stabilityExpiryDate: string
  preservativeSystem: string
  petStatus: string
  regulatoryNotes: string
  drugFactsRequired: boolean
  intendedUse: string
  warningsRequired: string
  activeDrugIngredients: string
  changes: { description: string; changeType: string; changedBy: string; date: string; fromVersion: string; toVersion: string; rationale: string; approvedBy: string }[]
  issues: { id: string; description: string; priority: string; category: string; reportedDate: string; status: string; assignedTo: string; resolutionNotes: string }[]
  notes: { id: string; content: string; author: string; authorInitial: string; timestamp: string }[]
  files: { name: string; url: string; source: string; uploadedBy: string; uploadedAt: string; size: number; type: string }[]
  sharepointLinks: { displayName: string; url: string; addedBy: string; addedAt: string }[]
  sdsSheets: { ingredientName: string; fileName: string; fileUrl: string; supplier: string; version: string; expiryDate: string; status: string }[]
  teamMembers: { name: string; role: string }[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

const EMPTY_FORM: FormulationFormData = {
  product: '',
  brand: '',
  category: '',
  linkedBriefId: '',
  linkedBriefName: '',
  formulaCode: '',
  baseFormulaRef: '',
  isOTC: false,
  version: 'v1.0',
  status: 'Draft',
  stability: 'Pending',
  regulatoryStatus: '',
  fdaStatus: '',
  activeIngredients: '',
  inciIngredients: '',
  restrictedIngredients: [],
  phRange: '',
  viscosity: '',
  fillWeight: '',
  regulatoryCategory: '',
  countryRegistrations: [],
  stabilityRequired: false,
  stabilityDuration: '',
  stabilityTestStatus: '',
  stabilityExpiryDate: '',
  preservativeSystem: '',
  petStatus: '',
  regulatoryNotes: '',
  drugFactsRequired: false,
  intendedUse: '',
  warningsRequired: '',
  activeDrugIngredients: '',
  changes: [],
  issues: [],
  notes: [],
  files: [],
  sharepointLinks: [],
  sdsSheets: [],
  teamMembers: [{ name: '', role: '' }],
  createdBy: '',
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
}

const BRANDS = ["Carol's Daughter", 'Dermablend', 'Baxter of California', 'Ambi', 'AcneFree']
const CATEGORIES = ['Skincare', 'Haircare', 'Bodycare', 'OTC', 'Color Cosmetics']
const STATUSES = ['Draft', 'In Review', 'Approved', 'Rejected', 'Archived']
const REGULATORY_CATEGORIES = ['Cosmetic 21 CFR 700s', 'OTC Drug 21 CFR 300s', 'Cosmeceutical', 'N/A']
const COUNTRY_OPTIONS = ['USA', 'Canada', 'EU', 'UK', 'Asia', 'Other']

const RESTRICTED_OPTIONS = [
  'No Parabens',
  'No Sulfates',
  'No BHT/BHA',
  'No TEA',
  'No Formaldehyde Donors',
  'Clean Beauty Compliant',
]

const STEPS = [
  'Basic Info',
  'Formula Content',
  'Regulatory',
  'Documents',
  'Team & Notes',
]

// ─── Props ─────────────────────────────────────────────────

interface NewFormulationModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: FormulationFormData) => void
  initialData?: FormulationFormData | null
  isSubmitting?: boolean
  briefItems?: any[]
}

// ─── Validation ────────────────────────────────────────────

function validateStep(step: number, form: FormulationFormData): Record<string, string> {
  const errors: Record<string, string> = {}
  if (step === 0) {
    if (!form.product.trim()) errors.product = 'Product name is required'
  }
  return errors
}

// ─── Shared Form Components ───────────────────────────────

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
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  error?: boolean
}) {
  return (
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
  )
}

// ─── Step Props ────────────────────────────────────────────

interface StepProps {
  form: FormulationFormData
  setForm: (f: FormulationFormData) => void
  errors: Record<string, string>
  briefItems?: any[]
}

// ─── Step 1: Basic Info ───────────────────────────────────

function Step1({ form, setForm, errors, briefItems }: StepProps) {
  const [briefSearch, setBriefSearch] = useState('')

  const filteredBriefs = briefItems?.filter(
    (b: any) =>
      b.projectName?.toLowerCase().includes(briefSearch.toLowerCase()) ||
      b.brand?.toLowerCase().includes(briefSearch.toLowerCase())
  ) || []

  const handleSelectBrief = (brief: any) => {
    setForm({
      ...form,
      linkedBriefId: brief.id,
      linkedBriefName: brief.projectName,
      product: brief.projectName || form.product,
      brand: brief.brand || form.brand,
      inciIngredients: brief.ingredients || form.inciIngredients,
      restrictedIngredients: brief.restrictedIngredients
        ? (typeof brief.restrictedIngredients === 'string'
          ? brief.restrictedIngredients.split(',').map((s: string) => s.trim()).filter(Boolean)
          : brief.restrictedIngredients)
        : form.restrictedIngredients,
    })
    setBriefSearch('')
  }

  return (
    <div className="space-y-5">
      {/* Linked Brief */}
      <FormField label="Linked Brief">
        <div className="relative">
          {form.linkedBriefId ? (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-subtle)]">
              <FileText size={14} className="text-[var(--accent)]" />
              <span className="text-[14px] text-[var(--text-primary)] flex-1">{form.linkedBriefName}</span>
              <button
                onClick={() => setForm({ ...form, linkedBriefId: '', linkedBriefName: '' })}
                className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={briefSearch}
                onChange={(e) => setBriefSearch(e.target.value)}
                placeholder="Search briefs to link..."
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]"
              />
              {briefSearch && filteredBriefs.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredBriefs.slice(0, 8).map((b: any) => (
                    <button
                      key={b.id}
                      onClick={() => handleSelectBrief(b)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <FileText size={13} className="text-[var(--accent)] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[var(--text-primary)] truncate">{b.projectName}</p>
                        <p className="text-[11px] text-[var(--text-tertiary)]">{b.brand}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </FormField>

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
        <FormField label="Product Category">
          <Select
            value={form.category}
            onChange={(v) => setForm({ ...form, category: v })}
            options={CATEGORIES}
            placeholder="Select category"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Formula Code / Reference">
          <TextInput
            value={form.formulaCode}
            onChange={(v) => setForm({ ...form, formulaCode: v })}
            placeholder="e.g. FRM-2025-0042"
          />
        </FormField>
        <FormField label="Base Formula Reference">
          <TextInput
            value={form.baseFormulaRef}
            onChange={(v) => setForm({ ...form, baseFormulaRef: v })}
            placeholder="e.g. FRM-2024-0018 v2.1"
          />
        </FormField>
      </div>

      <FormField label="OTC / Drug Facts Required">
        <div className="flex gap-3">
          {[true, false].map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => setForm({ ...form, isOTC: val, drugFactsRequired: val })}
              className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition-all ${
                form.isOTC === val
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--accent)]'
              }`}
            >
              {val ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Initial Version">
          <TextInput
            value={form.version}
            onChange={(v) => setForm({ ...form, version: v })}
            placeholder="v1.0"
          />
        </FormField>
        <FormField label="Initial Status">
          <Select
            value={form.status}
            onChange={(v) => setForm({ ...form, status: v })}
            options={STATUSES}
          />
        </FormField>
      </div>
    </div>
  )
}

// ─── Step 2: Formula Content ──────────────────────────────

function Step2({ form, setForm }: StepProps) {
  const [otherRestricted, setOtherRestricted] = useState('')
  const hasOther = form.restrictedIngredients.some((r) => !RESTRICTED_OPTIONS.includes(r))

  const toggleRestricted = (item: string) => {
    const updated = form.restrictedIngredients.includes(item)
      ? form.restrictedIngredients.filter((r) => r !== item)
      : [...form.restrictedIngredients, item]
    setForm({ ...form, restrictedIngredients: updated })
  }

  const addOtherRestricted = () => {
    if (otherRestricted.trim() && !form.restrictedIngredients.includes(otherRestricted.trim())) {
      setForm({ ...form, restrictedIngredients: [...form.restrictedIngredients, otherRestricted.trim()] })
      setOtherRestricted('')
    }
  }

  return (
    <div className="space-y-5">
      {/* Active Ingredients (OTC only) */}
      {form.isOTC && (
        <div className="p-4 rounded-xl border border-[var(--warning)]/20 bg-[var(--warning-light)]/30">
          <FormField label="Active Ingredients (OTC)">
            <TextArea
              value={form.activeIngredients}
              onChange={(v) => setForm({ ...form, activeIngredients: v })}
              placeholder="e.g. Hydroquinone 2%, Octinoxate 7.5%"
              rows={3}
            />
          </FormField>
        </div>
      )}

      <FormField label="Full INCI / Ingredient List">
        <TextArea
          value={form.inciIngredients}
          onChange={(v) => setForm({ ...form, inciIngredients: v })}
          placeholder="Water (Aqua), Glycerin, Cetyl Alcohol, Stearyl Alcohol..."
          rows={6}
        />
      </FormField>

      <FormField label="Restricted Ingredients">
        <div className="flex flex-wrap gap-2 mb-2">
          {RESTRICTED_OPTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => toggleRestricted(item)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium border transition-all ${
                form.restrictedIngredients.includes(item)
                  ? 'bg-[var(--danger-light)] text-[var(--danger)] border-[var(--danger)]/30'
                  : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--danger)]/50'
              }`}
            >
              {item}
            </button>
          ))}
          {/* Custom restricted items */}
          {form.restrictedIngredients
            .filter((r) => !RESTRICTED_OPTIONS.includes(r))
            .map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => toggleRestricted(r)}
                className="px-3.5 py-1.5 rounded-full text-[13px] font-medium border bg-[var(--danger-light)] text-[var(--danger)] border-[var(--danger)]/30 transition-all"
              >
                {r}
                <X size={12} className="inline ml-1 -mt-0.5" />
              </button>
            ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={otherRestricted}
            onChange={(e) => setOtherRestricted(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOtherRestricted() } }}
            placeholder="Add other restriction..."
            className="flex-1 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={addOtherRestricted}
            className="px-3 py-2 rounded-lg text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-subtle)] border border-[var(--border-default)] transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </FormField>

      <div className="grid grid-cols-3 gap-4">
        <FormField label="pH Range">
          <TextInput
            value={form.phRange}
            onChange={(v) => setForm({ ...form, phRange: v })}
            placeholder="e.g. 4.5 – 5.5"
          />
        </FormField>
        <FormField label="Viscosity">
          <TextInput
            value={form.viscosity}
            onChange={(v) => setForm({ ...form, viscosity: v })}
            placeholder="e.g. 15,000 – 25,000 cps"
          />
        </FormField>
        <FormField label="Fill Weight / Volume">
          <TextInput
            value={form.fillWeight}
            onChange={(v) => setForm({ ...form, fillWeight: v })}
            placeholder="e.g. 2 oz / 56g"
          />
        </FormField>
      </div>
    </div>
  )
}

// ─── Step 3: Regulatory ───────────────────────────────────

function Step3({ form, setForm }: StepProps) {
  const toggleCountry = (country: string) => {
    const updated = form.countryRegistrations.includes(country)
      ? form.countryRegistrations.filter((c) => c !== country)
      : [...form.countryRegistrations, country]
    setForm({ ...form, countryRegistrations: updated })
  }

  return (
    <div className="space-y-5">
      <FormField label="Regulatory Category">
        <Select
          value={form.regulatoryCategory}
          onChange={(v) => setForm({ ...form, regulatoryCategory: v })}
          options={REGULATORY_CATEGORIES}
          placeholder="Select regulatory category"
        />
      </FormField>

      <FormField label="Country Registrations">
        <div className="flex flex-wrap gap-2">
          {COUNTRY_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleCountry(c)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium border transition-all ${
                form.countryRegistrations.includes(c)
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--accent)]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Stability Testing Required">
          <div className="flex gap-3">
            {[true, false].map((val) => (
              <button
                key={String(val)}
                type="button"
                onClick={() => setForm({ ...form, stabilityRequired: val })}
                className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition-all ${
                  form.stabilityRequired === val
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--accent)]'
                }`}
              >
                {val ? 'Yes' : 'No'}
              </button>
            ))}
          </div>
        </FormField>
        {form.stabilityRequired && (
          <FormField label="Stability Duration">
            <TextInput
              value={form.stabilityDuration}
              onChange={(v) => setForm({ ...form, stabilityDuration: v })}
              placeholder="e.g. 12 months accelerated + 24 months real-time"
            />
          </FormField>
        )}
      </div>

      <FormField label="Preservative System">
        <TextInput
          value={form.preservativeSystem}
          onChange={(v) => setForm({ ...form, preservativeSystem: v })}
          placeholder="e.g. Phenoxyethanol + Ethylhexylglycerin"
        />
      </FormField>

      <FormField label="Regulatory Notes">
        <TextArea
          value={form.regulatoryNotes}
          onChange={(v) => setForm({ ...form, regulatoryNotes: v })}
          placeholder="Any regulatory notes, special requirements, or compliance considerations..."
          rows={4}
        />
      </FormField>
    </div>
  )
}

// ─── Step 4: Documents ────────────────────────────────────

function Step4({ form, setForm }: StepProps) {
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const newFiles = Array.from(files).map((f) => ({
      name: f.name,
      url: URL.createObjectURL(f),
      source: 'local',
      uploadedBy: 'Current User',
      uploadedAt: new Date().toISOString().slice(0, 10),
      size: f.size,
      type: f.type,
    }))
    setForm({ ...form, files: [...form.files, ...newFiles] })
    e.target.value = ''
  }

  const removeFile = (i: number) => {
    setForm({ ...form, files: form.files.filter((_, idx) => idx !== i) })
  }

  // SharePoint links
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  const addLink = () => {
    if (!linkName.trim() || !linkUrl.trim()) return
    setForm({
      ...form,
      sharepointLinks: [
        ...form.sharepointLinks,
        { displayName: linkName.trim(), url: linkUrl.trim(), addedBy: 'Current User', addedAt: new Date().toISOString().slice(0, 10) },
      ],
    })
    setLinkName('')
    setLinkUrl('')
  }

  const removeLink = (i: number) => {
    setForm({ ...form, sharepointLinks: form.sharepointLinks.filter((_, idx) => idx !== i) })
  }

  // SDS sheets
  const [sdsIngredient, setSdsIngredient] = useState('')
  const [sdsSupplier, setSdsSupplier] = useState('')
  const [sdsVersion, setSdsVersion] = useState('')
  const [sdsExpiry, setSdsExpiry] = useState('')

  const addSds = () => {
    if (!sdsIngredient.trim()) return
    setForm({
      ...form,
      sdsSheets: [
        ...form.sdsSheets,
        {
          ingredientName: sdsIngredient.trim(),
          fileName: '',
          fileUrl: '',
          supplier: sdsSupplier.trim(),
          version: sdsVersion.trim(),
          expiryDate: sdsExpiry,
          status: 'Current',
        },
      ],
    })
    setSdsIngredient('')
    setSdsSupplier('')
    setSdsVersion('')
    setSdsExpiry('')
  }

  const removeSds = (i: number) => {
    setForm({ ...form, sdsSheets: form.sdsSheets.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-6">
      {/* General File Upload */}
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">General Documents</h3>
        {form.files.length > 0 && (
          <div className="space-y-2 mb-3">
            {form.files.map((doc, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]">
                <FileText size={16} className="text-[var(--accent)] flex-shrink-0" />
                <span className="text-[13px] text-[var(--text-primary)] flex-1 truncate">{doc.name}</span>
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  {doc.size < 1024 * 1024 ? `${(doc.size / 1024).toFixed(1)} KB` : `${(doc.size / (1024 * 1024)).toFixed(1)} MB`}
                </span>
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
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]">
                <FileText size={14} className="text-[var(--accent)] flex-shrink-0" />
                <span className="text-[13px] text-[var(--text-primary)] flex-1 truncate">{link.displayName}</span>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--accent)] hover:underline">
                  Open
                </a>
                <button onClick={() => removeLink(i)} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)]">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            placeholder="Link name"
            className="flex-1 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
          />
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="SharePoint URL"
            className="flex-1 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={addLink}
            disabled={!linkName.trim() || !linkUrl.trim()}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-subtle)] border border-[var(--border-default)] disabled:opacity-40 transition-colors"
          >
            <Plus size={14} /> Add Link
          </button>
        </div>
      </div>

      {/* SDS Sheet Uploads */}
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">SDS Sheet Uploads</h3>
        {form.sdsSheets.length > 0 && (
          <div className="space-y-2 mb-3">
            {form.sdsSheets.map((sheet, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]">
                <Shield size={14} className="text-[var(--accent)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[var(--text-primary)] font-medium truncate">{sheet.ingredientName}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    {sheet.supplier && `${sheet.supplier} · `}{sheet.version && `${sheet.version} · `}{sheet.expiryDate && `Exp: ${sheet.expiryDate}`}
                  </p>
                </div>
                <button onClick={() => removeSds(i)} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)]">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Ingredient Name *</label>
              <input
                type="text"
                value={sdsIngredient}
                onChange={(e) => setSdsIngredient(e.target.value)}
                placeholder="e.g. Sodium Lauryl Sulfate"
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Supplier</label>
              <input
                type="text"
                value={sdsSupplier}
                onChange={(e) => setSdsSupplier(e.target.value)}
                placeholder="e.g. BASF"
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">SDS Version</label>
              <input
                type="text"
                value={sdsVersion}
                onChange={(e) => setSdsVersion(e.target.value)}
                placeholder="e.g. Rev 4.0 — 2025-01-15"
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Expiry Date</label>
              <input
                type="date"
                value={sdsExpiry}
                onChange={(e) => setSdsExpiry(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
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
          <div className="flex justify-end">
            <button
              onClick={addSds}
              disabled={!sdsIngredient.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
            >
              <Plus size={13} /> Add SDS Sheet
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Step 5: Team & Notes ─────────────────────────────────

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
    <div className="space-y-6">
      {/* Team Members */}
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">Assigned R&D Team Members</h3>
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

      {/* Initial Notes */}
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">Initial Notes</h3>
        <TextArea
          value={form.notes.length > 0 ? form.notes[0].content : ''}
          onChange={(v) => {
            if (form.notes.length > 0) {
              const notes = [...form.notes]
              notes[0] = { ...notes[0], content: v }
              setForm({ ...form, notes })
            } else if (v.trim()) {
              setForm({
                ...form,
                notes: [{
                  id: `note-${Date.now()}`,
                  content: v,
                  author: 'Current User',
                  authorInitial: 'C',
                  timestamp: new Date().toISOString(),
                }],
              })
            }
          }}
          placeholder="Any initial notes, observations, or context for this formulation..."
          rows={5}
        />
      </div>
    </div>
  )
}

// ─── Main Modal ────────────────────────────────────────────

export function NewFormulationModal({
  open,
  onClose,
  onSubmit,
  initialData,
  isSubmitting,
  briefItems,
}: NewFormulationModalProps) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormulationFormData>(initialData || EMPTY_FORM)
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
    const stepErrors = validateStep(0, form)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      setStep(0)
      return
    }
    onSubmit({
      ...form,
      updatedAt: new Date().toISOString().slice(0, 10),
    })
  }

  const handleSaveDraft = () => {
    onSubmit({
      ...form,
      status: 'Draft',
      updatedAt: new Date().toISOString().slice(0, 10),
    })
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
              {initialData ? 'Edit Formulation' : 'New Formulation'}
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

        {/* Step labels */}
        <div className="flex justify-between px-6 pb-3">
          {STEPS.map((label, i) => (
            <span
              key={i}
              className={`text-[10px] font-medium uppercase tracking-wider transition-colors ${
                i <= step ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'
              }`}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && <Step1 form={form} setForm={setForm} errors={errors} briefItems={briefItems} />}
          {step === 1 && <Step2 form={form} setForm={setForm} errors={errors} />}
          {step === 2 && <Step3 form={form} setForm={setForm} errors={errors} />}
          {step === 3 && <Step4 form={form} setForm={setForm} errors={errors} />}
          {step === 4 && <Step5 form={form} setForm={setForm} errors={errors} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <button
            onClick={handleSaveDraft}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all"
          >
            <Save size={14} /> Save Draft
          </button>
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all"
              >
                <ChevronLeft size={14} /> Back
              </button>
            )}
            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[13px] font-medium btn-primary disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Formulation'}
              </button>
            ) : (
              <button
                onClick={goNext}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[13px] font-medium btn-primary"
              >
                Next <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
