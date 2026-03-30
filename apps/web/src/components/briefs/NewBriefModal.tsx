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
  CheckCircle2,
  CloudOff,
  Image,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────
export interface BriefFormData {
  // Step 1 — Project Overview
  companyName: string
  dateOfRequest: string
  projectName: string
  brand: string
  subBrand: string
  contractManufacturer: string
  briefStatus: string
  phase: number
  // Step 2 — Project Contacts
  projectContacts: { name: string; role: string; email: string }[]
  // Step 3 — Objective & Business
  projectObjective: string
  ingredients: string
  targetAvailabilityDate: string
  targetFormulaDate: string
  targetStabilityDate: string
  targetScaleUpDate: string
  markets: string[]
  targetRetailPrice: string
  projectedAnnualVolume: string
  moq: string
  targetCostPerUnit: string
  // Step 4 — Design Criteria
  productDescription: string
  isCurrentLine: boolean
  consumerExperience: string
  feel: string
  fragrance: string
  appearance: string
  restrictedIngredients: string
  requestedIngredients: string
  keyBenefits: string
  copyClaims: string
  clinicalClaims: string
  typicalUsage: string
  retailChain: string
  // Step 5 — Packaging
  targetDemographics: string
  intendedPackage: string
  intendedClosure: string
  packagingMaterial: string
  labelType: string
  labelArtwork: string
  secondaryPackage: string
  kitCombos: string
  packagingCostPerUnit: string
  casePackout: string
  benchmarkImageUrl: string
  // Step 6 — Team & Docs
  teamMembers: { name: string; role: string }[]
  supportingDocs: { name: string; url: string; source: string }[]
}

const EMPTY_FORM: BriefFormData = {
  companyName: 'KarEve, LLC',
  dateOfRequest: new Date().toISOString().slice(0, 10),
  projectName: '',
  brand: '',
  subBrand: '',
  contractManufacturer: '',
  briefStatus: 'Brief Submitted',
  phase: 1,
  projectContacts: [{ name: '', role: '', email: '' }],
  projectObjective: '',
  ingredients: '',
  targetAvailabilityDate: '',
  targetFormulaDate: '',
  targetStabilityDate: '',
  targetScaleUpDate: '',
  markets: [],
  targetRetailPrice: '',
  projectedAnnualVolume: '',
  moq: '',
  targetCostPerUnit: '',
  productDescription: '',
  isCurrentLine: false,
  consumerExperience: '',
  feel: '',
  fragrance: '',
  appearance: '',
  restrictedIngredients: '',
  requestedIngredients: '',
  keyBenefits: '',
  copyClaims: '',
  clinicalClaims: '',
  typicalUsage: '',
  retailChain: '',
  targetDemographics: '',
  intendedPackage: '',
  intendedClosure: '',
  packagingMaterial: '',
  labelType: '',
  labelArtwork: '',
  secondaryPackage: '',
  kitCombos: '',
  packagingCostPerUnit: '',
  casePackout: '',
  benchmarkImageUrl: '',
  teamMembers: [{ name: '', role: '' }],
  supportingDocs: [],
}

const BRANDS = ["Carol's Daughter", 'Dermablend', 'Baxter of California', 'Ambi', 'AcneFree']
const STATUSES = ['Brief Submitted', 'In Formulation', 'Stability Testing', 'Formula Approved']
const MARKET_OPTIONS = ['USA', 'Asia', 'Global', 'UK', 'Other']
const LABEL_OPTIONS = ['Label', 'Screen Print', 'Wrap Label', 'Front & Back', 'Other']

const STEPS = [
  'Project Overview',
  'Project Contacts',
  'Objective & Business',
  'Design Criteria',
  'Packaging',
  'Team & Documents',
]

interface NewBriefModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: BriefFormData, isDraft: boolean) => void
  initialData?: BriefFormData | null
  isSubmitting?: boolean
}

// ─── Validation ────────────────────────────────────────────
function validateStep(step: number, form: BriefFormData): Record<string, string> {
  const errors: Record<string, string> = {}
  if (step === 0) {
    if (!form.projectName.trim()) errors.projectName = 'Project name is required'
    if (!form.brand) errors.brand = 'Brand is required'
  }
  if (step === 1) {
    if (form.projectContacts.length === 0) errors.contacts = 'At least one contact required'
    form.projectContacts.forEach((c, i) => {
      if (!c.name.trim()) errors[`contact_${i}_name`] = 'Name required'
    })
  }
  if (step === 2) {
    if (!form.projectObjective.trim()) errors.projectObjective = 'Objective is required'
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

// ─── Step Components ───────────────────────────────────────

function Step1({ form, setForm, errors }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Company Name" required>
          <TextInput value={form.companyName} onChange={(v) => setForm({ ...form, companyName: v })} />
        </FormField>
        <FormField label="Date of Request" required>
          <TextInput
            type="date"
            value={form.dateOfRequest}
            onChange={(v) => setForm({ ...form, dateOfRequest: v })}
          />
        </FormField>
      </div>
      <FormField label="Project Name" required error={errors.projectName}>
        <TextInput
          value={form.projectName}
          onChange={(v) => setForm({ ...form, projectName: v })}
          placeholder='e.g. "Ambi Fade Cream — Moderate"'
          error={!!errors.projectName}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Brand" required error={errors.brand}>
          <Select
            value={form.brand}
            onChange={(v) => setForm({ ...form, brand: v })}
            options={BRANDS}
            placeholder="Select brand"
            error={!!errors.brand}
          />
        </FormField>
        <FormField label="Sub-Brand">
          <TextInput
            value={form.subBrand}
            onChange={(v) => setForm({ ...form, subBrand: v })}
            placeholder='e.g. "Ambi Even & Clear"'
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Contract Manufacturer (CM)">
          <Select
            value={form.contractManufacturer}
            onChange={(v) => setForm({ ...form, contractManufacturer: v })}
            options={['Kolmar', 'Cosway', 'Omnibus', 'Schwan Cosmetics', 'Mana Products']}
            placeholder="Select CM"
            allowCustom
          />
        </FormField>
        <FormField label="Project Status">
          <Select
            value={form.briefStatus}
            onChange={(v) => setForm({ ...form, briefStatus: v })}
            options={STATUSES}
          />
        </FormField>
      </div>
      <FormField label="Project Phase (1–5)">
        <input
          type="range"
          min={1}
          max={5}
          value={form.phase}
          onChange={(e) => setForm({ ...form, phase: Number(e.target.value) })}
          className="w-full accent-[var(--accent)]"
        />
        <div className="flex justify-between text-[11px] text-[var(--text-tertiary)] mt-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={form.phase >= n ? 'text-[var(--accent)] font-semibold' : ''}>
              {n}
            </span>
          ))}
        </div>
      </FormField>
    </div>
  )
}

function Step2({ form, setForm, errors }: StepProps) {
  const addContact = () => {
    if (form.projectContacts.length < 10) {
      setForm({ ...form, projectContacts: [...form.projectContacts, { name: '', role: '', email: '' }] })
    }
  }
  const removeContact = (i: number) => {
    if (form.projectContacts.length > 1) {
      setForm({ ...form, projectContacts: form.projectContacts.filter((_, idx) => idx !== i) })
    }
  }
  const updateContact = (i: number, field: string, value: string) => {
    const contacts = [...form.projectContacts]
    contacts[i] = { ...contacts[i], [field]: value }
    setForm({ ...form, projectContacts: contacts })
  }

  return (
    <div className="space-y-4">
      {errors.contacts && <p className="text-[12px] text-[var(--danger)]">{errors.contacts}</p>}
      {form.projectContacts.map((c, i) => (
        <div key={i} className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[var(--text-secondary)]">Contact {i + 1}</span>
            {form.projectContacts.length > 1 && (
              <button onClick={() => removeContact(i)} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)]">
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Name" required error={errors[`contact_${i}_name`]}>
              <TextInput value={c.name} onChange={(v) => updateContact(i, 'name', v)} placeholder="Full name" error={!!errors[`contact_${i}_name`]} />
            </FormField>
            <FormField label="Title / Role">
              <TextInput value={c.role} onChange={(v) => updateContact(i, 'role', v)} placeholder="e.g. R&D Manager" />
            </FormField>
            <FormField label="Email">
              <TextInput type="email" value={c.email} onChange={(v) => updateContact(i, 'email', v)} placeholder="email@company.com" />
            </FormField>
          </div>
        </div>
      ))}
      {form.projectContacts.length < 10 && (
        <button onClick={addContact} className="flex items-center gap-1.5 text-[13px] text-[var(--accent)] font-medium hover:underline">
          <Plus size={14} /> Add Contact
        </button>
      )}
    </div>
  )
}

function Step3({ form, setForm, errors }: StepProps) {
  const toggleMarket = (market: string) => {
    const markets = form.markets.includes(market)
      ? form.markets.filter((m) => m !== market)
      : [...form.markets, market]
    setForm({ ...form, markets })
  }

  return (
    <div className="space-y-5">
      <FormField label="Project Objective" required error={errors.projectObjective}>
        <TextArea
          value={form.projectObjective}
          onChange={(v) => setForm({ ...form, projectObjective: v })}
          placeholder="Describe the goal of this tech transfer / brief"
          rows={5}
          error={!!errors.projectObjective}
        />
      </FormField>
      <FormField label="Ingredients List">
        <TextArea
          value={form.ingredients}
          onChange={(v) => setForm({ ...form, ingredients: v })}
          placeholder="INCI names, comma or newline separated"
          rows={3}
        />
      </FormField>

      <div className="pt-2 border-t border-[var(--border-subtle)]">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">Business Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Target Product Availability Date">
            <TextInput type="date" value={form.targetAvailabilityDate} onChange={(v) => setForm({ ...form, targetAvailabilityDate: v })} />
          </FormField>
          <FormField label="Target Final Formula Date">
            <TextInput type="date" value={form.targetFormulaDate} onChange={(v) => setForm({ ...form, targetFormulaDate: v })} />
          </FormField>
          <FormField label="Target Stability/Compatibility Start">
            <TextInput type="date" value={form.targetStabilityDate} onChange={(v) => setForm({ ...form, targetStabilityDate: v })} />
          </FormField>
          <FormField label="Target Scale Up / Prelaunch Date">
            <TextInput type="date" value={form.targetScaleUpDate} onChange={(v) => setForm({ ...form, targetScaleUpDate: v })} />
          </FormField>
        </div>
      </div>

      <FormField label="Where will product be marketed?">
        <div className="flex flex-wrap gap-2">
          {MARKET_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMarket(m)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium border transition-all ${
                form.markets.includes(m)
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--accent)]'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Target Retail Price">
          <TextInput value={form.targetRetailPrice} onChange={(v) => setForm({ ...form, targetRetailPrice: v })} placeholder="e.g. $8.99" />
        </FormField>
        <FormField label="Projected Annual Volume">
          <TextInput value={form.projectedAnnualVolume} onChange={(v) => setForm({ ...form, projectedAnnualVolume: v })} placeholder="e.g. 370K (290K Retail, 80K Amazon)" />
        </FormField>
        <FormField label="MOQ">
          <TextInput value={form.moq} onChange={(v) => setForm({ ...form, moq: v })} placeholder="e.g. Quote Tiered: 30K, 60K, 90K" />
        </FormField>
        <FormField label="Target Cost Per Unit">
          <TextInput value={form.targetCostPerUnit} onChange={(v) => setForm({ ...form, targetCostPerUnit: v })} placeholder="e.g. $2.35 – $2.45" />
        </FormField>
      </div>
    </div>
  )
}

function Step4({ form, setForm }: StepProps) {
  return (
    <div className="space-y-5">
      <FormField label="Product Name / Description">
        <TextInput value={form.productDescription} onChange={(v) => setForm({ ...form, productDescription: v })} />
      </FormField>

      <FormField label="Is this part of a current product line?">
        <div className="flex gap-3">
          {[true, false].map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => setForm({ ...form, isCurrentLine: val })}
              className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition-all ${
                form.isCurrentLine === val
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--accent)]'
              }`}
            >
              {val ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="What you want the consumer to experience">
        <TextArea value={form.consumerExperience} onChange={(v) => setForm({ ...form, consumerExperience: v })} rows={3} />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Describe the feel">
          <TextInput value={form.feel} onChange={(v) => setForm({ ...form, feel: v })} placeholder="e.g. Light lotion that absorbs quickly" />
        </FormField>
        <FormField label="Describe the fragrance">
          <TextInput value={form.fragrance} onChange={(v) => setForm({ ...form, fragrance: v })} placeholder="e.g. Mandarin Sage 5342304" />
        </FormField>
      </div>

      <FormField label="Appearance (format, consistency, color)">
        <TextInput value={form.appearance} onChange={(v) => setForm({ ...form, appearance: v })} placeholder="e.g. Cream" />
      </FormField>

      <FormField label="Restricted Ingredients">
        <TextArea value={form.restrictedIngredients} onChange={(v) => setForm({ ...form, restrictedIngredients: v })} placeholder="e.g. No Parabens, BHT/BHA/TEA..." rows={2} />
      </FormField>

      <FormField label="Requested Ingredients">
        <TextArea value={form.requestedIngredients} onChange={(v) => setForm({ ...form, requestedIngredients: v })} placeholder="e.g. Same as current formula 14061-1.02" rows={2} />
      </FormField>

      <FormField label="Key Benefits Expected">
        <TextArea value={form.keyBenefits} onChange={(v) => setForm({ ...form, keyBenefits: v })} rows={2} />
      </FormField>

      <FormField label="Tentative Copy Claims">
        <TextArea value={form.copyClaims} onChange={(v) => setForm({ ...form, copyClaims: v })} rows={2} />
      </FormField>

      <FormField label="Consumer Study or Clinical Claims Desired">
        <TextArea value={form.clinicalClaims} onChange={(v) => setForm({ ...form, clinicalClaims: v })} rows={2} />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Typical Usage">
          <TextInput value={form.typicalUsage} onChange={(v) => setForm({ ...form, typicalUsage: v })} placeholder="e.g. Can be used daily" />
        </FormField>
        <FormField label="Target Retail Chain">
          <TextInput value={form.retailChain} onChange={(v) => setForm({ ...form, retailChain: v })} placeholder="e.g. Amazon, Walmart, CVS, Walgreens" />
        </FormField>
      </div>
    </div>
  )
}

function Step5({ form, setForm }: StepProps) {
  return (
    <div className="space-y-5">
      <FormField label="Target Market Demographics">
        <TextInput value={form.targetDemographics} onChange={(v) => setForm({ ...form, targetDemographics: v })} placeholder="e.g. Multicultural market" />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Intended Package">
          <TextInput value={form.intendedPackage} onChange={(v) => setForm({ ...form, intendedPackage: v })} placeholder="e.g. White 1 oz Laminate tube" />
        </FormField>
        <FormField label="Intended Closure">
          <TextInput value={form.intendedClosure} onChange={(v) => setForm({ ...form, intendedClosure: v })} placeholder="e.g. Screw on cap" />
        </FormField>
      </div>

      <FormField label="Packaging / Closure Material">
        <TextInput value={form.packagingMaterial} onChange={(v) => setForm({ ...form, packagingMaterial: v })} placeholder="e.g. Bronze PP cap, PCR, Glass, PET" />
      </FormField>

      <FormField label="Label or Screen">
        <Select
          value={form.labelType}
          onChange={(v) => setForm({ ...form, labelType: v })}
          options={LABEL_OPTIONS}
          placeholder="Select label type"
        />
      </FormField>

      <FormField label="Label Artwork — Number of Colors">
        <TextInput value={form.labelArtwork} onChange={(v) => setForm({ ...form, labelArtwork: v })} placeholder="e.g. 2 pantone, 1 foil, and CMYK" />
      </FormField>

      <FormField label="Intended Secondary Outer Package">
        <TextInput value={form.secondaryPackage} onChange={(v) => setForm({ ...form, secondaryPackage: v })} placeholder="e.g. Unit Carton with divider" />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Kit or Combos (optional)">
          <TextInput value={form.kitCombos} onChange={(v) => setForm({ ...form, kitCombos: v })} placeholder="e.g. None" />
        </FormField>
        <FormField label="Target Cost Per Unit — Packaging (optional)">
          <TextInput value={form.packagingCostPerUnit} onChange={(v) => setForm({ ...form, packagingCostPerUnit: v })} />
        </FormField>
      </div>

      <FormField label="Case Packout">
        <TextArea value={form.casePackout} onChange={(v) => setForm({ ...form, casePackout: v })} placeholder="e.g. Retail SKUs: 24 case qty..." rows={3} />
      </FormField>

      <FormField label="Benchmark Image / Reference">
        <div className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)]">
          <Image size={20} className="text-[var(--text-tertiary)]" />
          <div className="flex-1">
            {form.benchmarkImageUrl ? (
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[var(--text-primary)]">Image uploaded</span>
                <button onClick={() => setForm({ ...form, benchmarkImageUrl: '' })} className="text-[12px] text-[var(--danger)] hover:underline">
                  Remove
                </button>
              </div>
            ) : (
              <label className="cursor-pointer">
                <span className="text-[13px] text-[var(--accent)] hover:underline">Upload image</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const url = URL.createObjectURL(file)
                      setForm({ ...form, benchmarkImageUrl: url })
                    }
                  }}
                />
              </label>
            )}
          </div>
        </div>
      </FormField>
    </div>
  )
}

function Step6({ form, setForm, oneDriveConnected }: StepProps & { oneDriveConnected: boolean }) {
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const newDocs = Array.from(files).map((f) => ({
      name: f.name,
      url: URL.createObjectURL(f),
      source: oneDriveConnected ? 'onedrive' : 'local',
    }))
    setForm({ ...form, supportingDocs: [...form.supportingDocs, ...newDocs] })
    e.target.value = ''
  }

  const removeDoc = (i: number) => {
    setForm({ ...form, supportingDocs: form.supportingDocs.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-6">
      {/* OneDrive Status */}
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${
        oneDriveConnected
          ? 'border-[var(--success)] bg-[var(--success-light)]'
          : 'border-[var(--border-default)] bg-[var(--bg-surface)]'
      }`}>
        {oneDriveConnected ? (
          <>
            <CheckCircle2 size={16} className="text-[var(--success)]" />
            <span className="text-[13px] text-[var(--success)] font-medium">
              OneDrive Connected — files will be saved to /Nexus Collab/R&D/Briefs/
            </span>
          </>
        ) : (
          <>
            <CloudOff size={16} className="text-[var(--text-tertiary)]" />
            <span className="text-[13px] text-[var(--text-secondary)]">
              Connect OneDrive in{' '}
              <a href="/integrations" className="text-[var(--accent)] hover:underline">
                Integrations
              </a>{' '}
              to auto-save files to your drive
            </span>
          </>
        )}
      </div>

      {/* Team Members */}
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">Team Members</h3>
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

      {/* Supporting Documents */}
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">Supporting Documents</h3>

        {/* File list */}
        {form.supportingDocs.length > 0 && (
          <div className="space-y-2 mb-3">
            {form.supportingDocs.map((doc, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]">
                <FileText size={16} className="text-[var(--accent)] flex-shrink-0" />
                <span className="text-[13px] text-[var(--text-primary)] flex-1 truncate">{doc.name}</span>
                {doc.source === 'onedrive' && (
                  <span className="text-[11px] text-[var(--success)] font-medium">Saved to OneDrive</span>
                )}
                <button onClick={() => removeDoc(i)} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)]">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload zone */}
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
    </div>
  )
}

interface StepProps {
  form: BriefFormData
  setForm: (f: BriefFormData) => void
  errors: Record<string, string>
}

// ─── Main Modal ────────────────────────────────────────────
export function NewBriefModal({ open, onClose, onSubmit, initialData, isSubmitting }: NewBriefModalProps) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<BriefFormData>(initialData || EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [oneDriveConnected] = useState(false) // Will be checked via integration API

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
    onSubmit(form, false)
  }

  const handleSaveDraft = () => {
    onSubmit(form, true)
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
              {initialData ? 'Edit Project Initiation Brief' : 'New Project Initiation Brief'}
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
          {step === 0 && <Step1 form={form} setForm={setForm} errors={errors} />}
          {step === 1 && <Step2 form={form} setForm={setForm} errors={errors} />}
          {step === 2 && <Step3 form={form} setForm={setForm} errors={errors} />}
          {step === 3 && <Step4 form={form} setForm={setForm} errors={errors} />}
          {step === 4 && <Step5 form={form} setForm={setForm} errors={errors} />}
          {step === 5 && <Step6 form={form} setForm={setForm} errors={errors} oneDriveConnected={oneDriveConnected} />}
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
                {isSubmitting ? 'Submitting...' : 'Submit Brief'}
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
