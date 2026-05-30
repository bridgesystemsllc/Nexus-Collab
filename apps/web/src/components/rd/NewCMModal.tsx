import { useState, useEffect } from 'react'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Save,
  Plus,
  Trash2,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────

export interface CMFormData {
  name: string
  vendorId: string
  address: { street: string; city: string; state: string; zip: string; country: string }
  contractStatus: string
  relationshipStartDate: string
  website: string
  notes: string
  contacts: { type: string; name: string; title: string; email: string; phone: string }[]
  brands: string[]
  capacityNotes: string
  targetOnTime: number
  targetQuality: number
  targetLeadTimeDays: number
  moq: string
  // KPI data (set on existing CMs)
  onTime?: number
  quality?: number
  activePOs?: number
  openIssues?: number
  avgLeadTime?: number
  capacityUtilization?: number
  products?: any[]
  issues?: any[]
}

const EMPTY_FORM: CMFormData = {
  name: '',
  vendorId: '',
  address: { street: '', city: '', state: '', zip: '', country: '' },
  contractStatus: 'Active',
  relationshipStartDate: '',
  website: '',
  notes: '',
  contacts: [{ type: 'Primary / Project Manager', name: '', title: '', email: '', phone: '' }],
  brands: [],
  capacityNotes: '',
  targetOnTime: 95,
  targetQuality: 95,
  targetLeadTimeDays: 0,
  moq: '',
}

const CONTRACT_STATUSES = ['Active', 'On Hold', 'Terminated', 'Pending Onboarding']
const CONTACT_TYPES = [
  'Primary / Project Manager',
  'PO Submission Contact',
  'Quality Contact',
  'Billing Contact',
  'Other',
]
const BRANDS = ["Carol's Daughter", 'Dermablend', 'Baxter of California', 'Ambi', 'AcneFree']

const STEPS = ['Company Info', 'Contacts', 'Brands & Products', 'Performance Defaults']

// ─── Validation ────────────────────────────────────────────

function validateStep(step: number, form: CMFormData): Record<string, string> {
  const errors: Record<string, string> = {}
  if (step === 0) {
    if (!form.name.trim()) errors.name = 'CM company name is required'
  }
  if (step === 1) {
    if (form.contacts.length === 0) errors.contacts = 'At least one contact is required'
    form.contacts.forEach((c, i) => {
      if (!c.name.trim()) errors[`contact_${i}_name`] = 'Name required'
    })
  }
  return errors
}

// ─── Shared Input Components ───────────────────────────────

interface NewCMModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: CMFormData) => void
  initialData?: CMFormData | null
  isSubmitting?: boolean
}

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

function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  max,
}: {
  value: number
  onChange: (v: number) => void
  placeholder?: string
  min?: number
  max?: number
}) {
  return (
    <input
      type="number"
      value={value || ''}
      onChange={(e) => onChange(Number(e.target.value))}
      placeholder={placeholder}
      min={min}
      max={max}
      className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]"
    />
  )
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all resize-y focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]"
    />
  )
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

// ─── Step 1: Company Info ──────────────────────────────────

interface StepProps {
  form: CMFormData
  setForm: (f: CMFormData) => void
  errors: Record<string, string>
}

function Step1({ form, setForm, errors }: StepProps) {
  const updateAddress = (field: keyof CMFormData['address'], value: string) => {
    setForm({ ...form, address: { ...form.address, [field]: value } })
  }

  return (
    <div className="space-y-5">
      <FormField label="CM Company Name" required error={errors.name}>
        <TextInput
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="e.g. Kolmar Laboratories"
          error={!!errors.name}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Vendor ID / Code">
          <TextInput
            value={form.vendorId}
            onChange={(v) => setForm({ ...form, vendorId: v })}
            placeholder="e.g. VND-001"
          />
        </FormField>
        <FormField label="Contract Status">
          <Select
            value={form.contractStatus}
            onChange={(v) => setForm({ ...form, contractStatus: v })}
            options={CONTRACT_STATUSES}
          />
        </FormField>
      </div>

      {/* Address grid */}
      <div className="pt-2 border-t border-[var(--border-subtle)]">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">Address</h3>
        <div className="space-y-3">
          <FormField label="Street">
            <TextInput
              value={form.address.street}
              onChange={(v) => updateAddress('street', v)}
              placeholder="123 Manufacturing Dr"
            />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="City">
              <TextInput value={form.address.city} onChange={(v) => updateAddress('city', v)} placeholder="City" />
            </FormField>
            <FormField label="State">
              <TextInput value={form.address.state} onChange={(v) => updateAddress('state', v)} placeholder="State" />
            </FormField>
            <FormField label="ZIP">
              <TextInput value={form.address.zip} onChange={(v) => updateAddress('zip', v)} placeholder="ZIP" />
            </FormField>
          </div>
          <FormField label="Country">
            <TextInput value={form.address.country} onChange={(v) => updateAddress('country', v)} placeholder="Country" />
          </FormField>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Relationship Start Date">
          <TextInput
            type="date"
            value={form.relationshipStartDate}
            onChange={(v) => setForm({ ...form, relationshipStartDate: v })}
          />
        </FormField>
        <FormField label="Website">
          <TextInput
            value={form.website}
            onChange={(v) => setForm({ ...form, website: v })}
            placeholder="https://www.example.com"
          />
        </FormField>
      </div>

      <FormField label="Notes">
        <TextArea
          value={form.notes}
          onChange={(v) => setForm({ ...form, notes: v })}
          placeholder="Any additional notes about this CM..."
          rows={3}
        />
      </FormField>
    </div>
  )
}

// ─── Step 2: Contacts ──────────────────────────────────────

function Step2({ form, setForm, errors }: StepProps) {
  const addContact = () => {
    if (form.contacts.length < 10) {
      setForm({
        ...form,
        contacts: [...form.contacts, { type: 'Other', name: '', title: '', email: '', phone: '' }],
      })
    }
  }

  const removeContact = (i: number) => {
    if (form.contacts.length > 1) {
      setForm({ ...form, contacts: form.contacts.filter((_, idx) => idx !== i) })
    }
  }

  const updateContact = (i: number, field: string, value: string) => {
    const contacts = [...form.contacts]
    contacts[i] = { ...contacts[i], [field]: value }
    setForm({ ...form, contacts })
  }

  return (
    <div className="space-y-4">
      {errors.contacts && <p className="text-[12px] text-[var(--danger)]">{errors.contacts}</p>}

      {form.contacts.map((c, i) => (
        <div
          key={i}
          className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[var(--text-secondary)]">Contact {i + 1}</span>
            {form.contacts.length > 1 && (
              <button
                onClick={() => removeContact(i)}
                className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)]"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Contact Type">
              <Select
                value={c.type}
                onChange={(v) => updateContact(i, 'type', v)}
                options={CONTACT_TYPES}
              />
            </FormField>
            <FormField label="Name" required error={errors[`contact_${i}_name`]}>
              <TextInput
                value={c.name}
                onChange={(v) => updateContact(i, 'name', v)}
                placeholder="Full name"
                error={!!errors[`contact_${i}_name`]}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Title">
              <TextInput
                value={c.title}
                onChange={(v) => updateContact(i, 'title', v)}
                placeholder="e.g. Account Manager"
              />
            </FormField>
            <FormField label="Email">
              <TextInput
                type="email"
                value={c.email}
                onChange={(v) => updateContact(i, 'email', v)}
                placeholder="email@company.com"
              />
            </FormField>
            <FormField label="Phone">
              <TextInput
                value={c.phone}
                onChange={(v) => updateContact(i, 'phone', v)}
                placeholder="(555) 123-4567"
              />
            </FormField>
          </div>
        </div>
      ))}

      {form.contacts.length < 10 && (
        <button
          onClick={addContact}
          className="flex items-center gap-1.5 text-[13px] text-[var(--accent)] font-medium hover:underline"
        >
          <Plus size={14} /> Add Contact
        </button>
      )}
    </div>
  )
}

// ─── Step 3: Brands & Products ─────────────────────────────

function Step3({ form, setForm }: StepProps) {
  const toggleBrand = (brand: string) => {
    const brands = form.brands.includes(brand)
      ? form.brands.filter((b) => b !== brand)
      : [...form.brands, brand]
    setForm({ ...form, brands })
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">Brands Serviced</h3>
        <p className="text-[13px] text-[var(--text-tertiary)] mb-4">
          Select all brands this CM manufactures products for.
        </p>
        <div className="space-y-2">
          {BRANDS.map((brand) => (
            <label
              key={brand}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                form.brands.includes(brand)
                  ? 'border-[var(--accent)] bg-[var(--accent-light)]'
                  : 'border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/50'
              }`}
            >
              <input
                type="checkbox"
                checked={form.brands.includes(brand)}
                onChange={() => toggleBrand(brand)}
                className="w-4 h-4 rounded border-[var(--border-default)] accent-[var(--accent)]"
              />
              <span className="text-[14px] font-medium text-[var(--text-primary)]">{brand}</span>
            </label>
          ))}
        </div>
      </div>

      <FormField label="Capacity Notes">
        <TextArea
          value={form.capacityNotes}
          onChange={(v) => setForm({ ...form, capacityNotes: v })}
          placeholder="e.g. Max 500K units/month, dedicated line for Ambi products..."
          rows={3}
        />
      </FormField>
    </div>
  )
}

// ─── Step 4: Performance Defaults ──────────────────────────

function Step4({ form, setForm }: StepProps) {
  return (
    <div className="space-y-5">
      <p className="text-[13px] text-[var(--text-tertiary)]">
        Set performance targets for this CM. Actual KPIs will be tracked against these targets.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Target On-Time Delivery %">
          <NumberInput
            value={form.targetOnTime}
            onChange={(v) => setForm({ ...form, targetOnTime: v })}
            placeholder="95"
            min={0}
            max={100}
          />
        </FormField>
        <FormField label="Target Quality Score">
          <NumberInput
            value={form.targetQuality}
            onChange={(v) => setForm({ ...form, targetQuality: v })}
            placeholder="95"
            min={0}
            max={100}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Target Lead Time (days)">
          <NumberInput
            value={form.targetLeadTimeDays}
            onChange={(v) => setForm({ ...form, targetLeadTimeDays: v })}
            placeholder="e.g. 45"
            min={0}
          />
        </FormField>
        <FormField label="MOQ (Minimum Order Quantity)">
          <TextInput
            value={form.moq}
            onChange={(v) => setForm({ ...form, moq: v })}
            placeholder="e.g. 10,000 units"
          />
        </FormField>
      </div>

      {/* Summary preview */}
      <div className="mt-4 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <h4 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3 uppercase tracking-wider">Target Summary</h4>
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <div className="flex justify-between">
            <span className="text-[var(--text-tertiary)]">On-Time Delivery</span>
            <span className="font-medium text-[var(--text-primary)]">{form.targetOnTime}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-tertiary)]">Quality Score</span>
            <span className="font-medium text-[var(--text-primary)]">{form.targetQuality}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-tertiary)]">Lead Time</span>
            <span className="font-medium text-[var(--text-primary)]">
              {form.targetLeadTimeDays ? `${form.targetLeadTimeDays} days` : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-tertiary)]">MOQ</span>
            <span className="font-medium text-[var(--text-primary)]">{form.moq || '—'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Modal ────────────────────────────────────────────

export function NewCMModal({ open, onClose, onSubmit, initialData, isSubmitting }: NewCMModalProps) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<CMFormData>(initialData || EMPTY_FORM)
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
    onSubmit(form)
  }

  const handleSaveDraft = () => {
    onSubmit({ ...form, contractStatus: form.contractStatus || 'Pending Onboarding' })
  }

  if (!open) return null

  const isLastStep = step === STEPS.length - 1
  const isEdit = !!initialData

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
              {isEdit ? 'Edit Contract Manufacturer' : 'New Contract Manufacturer'}
            </h2>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">
              Step {step + 1} of {STEPS.length} — {STEPS[step]}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
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
                {isSubmitting ? 'Submitting...' : isEdit ? 'Update CM' : 'Add CM'}
              </button>
            ) : (
              <button
                onClick={goNext}
                className="flex items-center gap-1.5 btn-primary px-5 py-2.5 rounded-lg text-[14px]"
              >
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
