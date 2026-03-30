import { useState, useEffect } from 'react'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Rocket,
  Users,
  Calendar,
  Briefcase,
  DollarSign,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────
export interface NPDFormData {
  projectName: string
  brand: string
  subBrand: string
  category: string
  isOTC: boolean
  linkedBriefId: string
  linkedFormulationId: string
  description: string
  targetLaunchDate: string
  priority: string
  targetRetailPrice: string
  projectedAnnualVolume: string
  amazonVolume: string
  moq: string
  targetCOGS: string
  markets: string[]
  targetRetailers: string
  contractManufacturerId: string
  pipeQuantity: string
  teamAssignments: { role: string; defaultName: string; assignedName: string }[]
  stageDates: {
    stage0Target: string
    stage1Target: string
    gate12Target: string
    stage2Target: string
    gate23Target: string
    stage3Target: string
    stage4Target: string
  }
}

const DEFAULT_TEAM: { role: string; defaultName: string }[] = [
  { role: 'Launch Manager', defaultName: '' },
  { role: 'Product Development Lead', defaultName: 'Peter - PD' },
  { role: 'R&D Director', defaultName: 'Jean Marc' },
  { role: 'R&D Lead', defaultName: '' },
  { role: 'Operations Director', defaultName: 'Steven - OD' },
  { role: 'Operations Assistant', defaultName: 'Sonji' },
  { role: 'Brand Manager', defaultName: '' },
  { role: 'Head of Business', defaultName: 'Tauro' },
  { role: 'Sales / Demand Planning', defaultName: '' },
  { role: 'Finance Lead', defaultName: '' },
  { role: 'BOM / Operations Lead', defaultName: 'Eric' },
  { role: 'PO Manager', defaultName: 'Joe' },
  { role: 'Amazon/Operations', defaultName: '' },
]

export const EMPTY_NPD_FORM: NPDFormData = {
  projectName: '',
  brand: '',
  subBrand: '',
  category: '',
  isOTC: false,
  linkedBriefId: '',
  linkedFormulationId: '',
  description: '',
  targetLaunchDate: '',
  priority: 'Standard',
  targetRetailPrice: '',
  projectedAnnualVolume: '',
  amazonVolume: '',
  moq: '',
  targetCOGS: '',
  markets: [],
  targetRetailers: '',
  contractManufacturerId: '',
  pipeQuantity: '',
  teamAssignments: DEFAULT_TEAM.map((t) => ({
    role: t.role,
    defaultName: t.defaultName,
    assignedName: t.defaultName,
  })),
  stageDates: {
    stage0Target: '',
    stage1Target: '',
    gate12Target: '',
    stage2Target: '',
    gate23Target: '',
    stage3Target: '',
    stage4Target: '',
  },
}

const BRANDS = ["Carol's Daughter", 'Dermablend', 'Baxter of California', 'Ambi', 'AcneFree']
const CATEGORIES = ['Skincare', 'Haircare', 'Bodycare', 'OTC Drug', 'Color Cosmetics']
const PRIORITIES = ['Critical', 'High', 'Standard']
const MARKET_OPTIONS = ['USA', 'Amazon', 'Canada', 'UK', 'Asia', 'Global', 'Other']

const STEPS = ['Project Setup', 'Business & Commercial', 'Team Assignment', 'Stage Target Dates']
const STEP_ICONS = [Briefcase, DollarSign, Users, Calendar]

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (data: NPDFormData) => void
  isSubmitting: boolean
}

// ─── Validation ────────────────────────────────────────────
function validateStep(step: number, form: NPDFormData): Record<string, string> {
  const errors: Record<string, string> = {}
  if (step === 0) {
    if (!form.projectName.trim()) errors.projectName = 'Project name is required'
    if (!form.brand) errors.brand = 'Brand is required'
    if (!form.category) errors.category = 'Category is required'
    if (!form.targetLaunchDate) errors.targetLaunchDate = 'Target launch date is required'
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

// ─── Toggle Switch ────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-default)]'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ─── Step Props ────────────────────────────────────────────
interface StepProps {
  form: NPDFormData
  setForm: (f: NPDFormData) => void
  errors: Record<string, string>
}

// ─── Step 1: Project Setup ─────────────────────────────────
function StepProjectSetup({ form, setForm, errors }: StepProps) {
  return (
    <div className="space-y-5">
      <FormField label="Project Name" required error={errors.projectName}>
        <TextInput
          value={form.projectName}
          onChange={(v) => setForm({ ...form, projectName: v })}
          placeholder='e.g. "Ambi Fade Cream — Moderate Reformulation"'
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
        <FormField label="Category" required error={errors.category}>
          <Select
            value={form.category}
            onChange={(v) => setForm({ ...form, category: v })}
            options={CATEGORIES}
            placeholder="Select category"
            error={!!errors.category}
          />
        </FormField>
        <FormField label="Priority">
          <Select
            value={form.priority}
            onChange={(v) => setForm({ ...form, priority: v })}
            options={PRIORITIES}
          />
        </FormField>
      </div>

      <div className="flex items-center gap-3">
        <Toggle checked={form.isOTC} onChange={(v) => setForm({ ...form, isOTC: v })} />
        <span className="text-[13px] text-[var(--text-secondary)] font-medium">
          OTC Drug Product
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Linked Brief ID">
          <TextInput
            value={form.linkedBriefId}
            onChange={(v) => setForm({ ...form, linkedBriefId: v })}
            placeholder="Search or enter brief ID"
          />
        </FormField>
        <FormField label="Linked Formulation ID">
          <TextInput
            value={form.linkedFormulationId}
            onChange={(v) => setForm({ ...form, linkedFormulationId: v })}
            placeholder="Search or enter formulation ID"
          />
        </FormField>
      </div>

      <FormField label="Description">
        <TextArea
          value={form.description}
          onChange={(v) => setForm({ ...form, description: v })}
          placeholder="Describe the project scope, objectives, and key deliverables"
          rows={4}
        />
      </FormField>

      <FormField label="Target Launch Date" required error={errors.targetLaunchDate}>
        <TextInput
          type="date"
          value={form.targetLaunchDate}
          onChange={(v) => setForm({ ...form, targetLaunchDate: v })}
          error={!!errors.targetLaunchDate}
        />
      </FormField>
    </div>
  )
}

// ─── Step 2: Business & Commercial ─────────────────────────
function StepBusinessCommercial({ form, setForm }: StepProps) {
  const toggleMarket = (market: string) => {
    const markets = form.markets.includes(market)
      ? form.markets.filter((m) => m !== market)
      : [...form.markets, market]
    setForm({ ...form, markets })
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Target Retail Price">
          <TextInput
            value={form.targetRetailPrice}
            onChange={(v) => setForm({ ...form, targetRetailPrice: v })}
            placeholder="e.g. $8.99"
          />
        </FormField>
        <FormField label="Target COGS">
          <TextInput
            value={form.targetCOGS}
            onChange={(v) => setForm({ ...form, targetCOGS: v })}
            placeholder="e.g. $2.35 - $2.45"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Projected Annual Volume">
          <TextInput
            value={form.projectedAnnualVolume}
            onChange={(v) => setForm({ ...form, projectedAnnualVolume: v })}
            placeholder="e.g. 370K (290K Retail, 80K Amazon)"
          />
        </FormField>
        <FormField label="Amazon Volume">
          <TextInput
            value={form.amazonVolume}
            onChange={(v) => setForm({ ...form, amazonVolume: v })}
            placeholder="e.g. 80,000 units"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="MOQ">
          <TextInput
            value={form.moq}
            onChange={(v) => setForm({ ...form, moq: v })}
            placeholder="e.g. 30K, 60K, 90K (tiered)"
          />
        </FormField>
        <FormField label="Pipe Quantity">
          <TextInput
            value={form.pipeQuantity}
            onChange={(v) => setForm({ ...form, pipeQuantity: v })}
            placeholder="e.g. 5,000 units"
          />
        </FormField>
      </div>

      <FormField label="Markets">
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

      <FormField label="Target Retailers">
        <TextInput
          value={form.targetRetailers}
          onChange={(v) => setForm({ ...form, targetRetailers: v })}
          placeholder="e.g. Walmart, CVS, Walgreens, Target"
        />
      </FormField>

      <FormField label="Contract Manufacturer">
        <TextInput
          value={form.contractManufacturerId}
          onChange={(v) => setForm({ ...form, contractManufacturerId: v })}
          placeholder="Search or enter CM name / ID"
        />
      </FormField>
    </div>
  )
}

// ─── Step 3: Team Assignment ───────────────────────────────
function StepTeamAssignment({ form, setForm }: StepProps) {
  const updateAssignee = (index: number, name: string) => {
    const assignments = [...form.teamAssignments]
    assignments[index] = { ...assignments[index], assignedName: name }
    setForm({ ...form, teamAssignments: assignments })
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[var(--text-tertiary)]">
        Assign team members to each role. Defaults are pre-filled where applicable.
      </p>

      <div className="rounded-xl border border-[var(--border-default)] overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-2 gap-4 px-4 py-3 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
          <span className="text-[13px] font-semibold text-[var(--text-secondary)]">Role</span>
          <span className="text-[13px] font-semibold text-[var(--text-secondary)]">Assignee</span>
        </div>

        {/* Rows */}
        {form.teamAssignments.map((assignment, i) => (
          <div
            key={assignment.role}
            className={`grid grid-cols-2 gap-4 px-4 py-3 items-center ${
              i < form.teamAssignments.length - 1 ? 'border-b border-[var(--border-subtle)]' : ''
            }`}
          >
            <div>
              <span className="text-[14px] text-[var(--text-primary)]">{assignment.role}</span>
              {assignment.defaultName && (
                <span className="block text-[11px] text-[var(--text-tertiary)] mt-0.5">
                  Default: {assignment.defaultName}
                </span>
              )}
            </div>
            <TextInput
              value={assignment.assignedName}
              onChange={(v) => updateAssignee(i, v)}
              placeholder="Enter name"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Step 4: Stage Target Dates ────────────────────────────
const STAGE_DATE_FIELDS: { key: keyof NPDFormData['stageDates']; label: string }[] = [
  { key: 'stage0Target', label: 'Stage 0 - Feasibility' },
  { key: 'stage1Target', label: 'Stage 1 - Scoping & Brief' },
  { key: 'gate12Target', label: 'Gate 1/2 Review' },
  { key: 'stage2Target', label: 'Stage 2 - Business Case' },
  { key: 'gate23Target', label: 'Gate 2/3 Review' },
  { key: 'stage3Target', label: 'Stage 3 - Development' },
  { key: 'stage4Target', label: 'Stage 4 - Testing & Validation' },
]

function StepStageDates({ form, setForm }: StepProps) {
  const updateStageDate = (key: keyof NPDFormData['stageDates'], value: string) => {
    setForm({
      ...form,
      stageDates: { ...form.stageDates, [key]: value },
    })
  }

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-[var(--text-tertiary)]">
        Set target dates for each NPD stage gate. Work backwards from the launch date to plan your timeline.
      </p>

      <div className="space-y-3">
        {STAGE_DATE_FIELDS.map(({ key, label }) => (
          <div
            key={key}
            className="flex items-center gap-4 px-4 py-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]"
          >
            <div className="flex-1">
              <span className="text-[14px] text-[var(--text-primary)] font-medium">{label}</span>
            </div>
            <div className="w-48">
              <TextInput
                type="date"
                value={form.stageDates[key]}
                onChange={(v) => updateStageDate(key, v)}
              />
            </div>
          </div>
        ))}

        {/* Launch / Market Availability — pre-filled from Step 1 */}
        <div className="flex items-center gap-4 px-4 py-3 rounded-xl border-2 border-[var(--accent)] bg-[var(--bg-surface)]">
          <div className="flex-1">
            <span className="text-[14px] text-[var(--text-primary)] font-semibold">
              Launch / Market Availability
            </span>
            <span className="block text-[11px] text-[var(--text-tertiary)] mt-0.5">
              Pre-filled from Step 1 target launch date
            </span>
          </div>
          <div className="w-48">
            <TextInput
              type="date"
              value={form.targetLaunchDate}
              onChange={(v) => setForm({ ...form, targetLaunchDate: v })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Modal ────────────────────────────────────────────
export function NewNPDProjectModal({ open, onClose, onSubmit, isSubmitting }: Props) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<NPDFormData>(() => JSON.parse(JSON.stringify(EMPTY_NPD_FORM)))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      // Deep clone to prevent mutation of the default form
      setForm(JSON.parse(JSON.stringify(EMPTY_NPD_FORM)))
      setStep(0)
      setErrors({})
    }
  }, [open])

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
    if (step > 0) {
      setErrors({})
      setStep(step - 1)
    }
  }

  const handleSubmit = () => {
    const stepErrors = validateStep(step, form)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }
    onSubmit(form)
  }

  if (!open) return null

  const isLastStep = step === STEPS.length - 1
  const StepIcon = STEP_ICONS[step]

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
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent)] flex items-center justify-center">
              <StepIcon size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
                New NPD Project
              </h2>
              <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">
                Step {step + 1} of {STEPS.length} — {STEPS[step]}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Step progress bar */}
        <div className="flex gap-1.5 px-6 pt-4 pb-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors cursor-pointer"
              style={{ background: i <= step ? 'var(--accent)' : 'var(--border-default)' }}
              onClick={() => {
                if (i < step) {
                  setErrors({})
                  setStep(i)
                }
              }}
            />
          ))}
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && <StepProjectSetup form={form} setForm={setForm} errors={errors} />}
          {step === 1 && <StepBusinessCommercial form={form} setForm={setForm} errors={errors} />}
          {step === 2 && <StepTeamAssignment form={form} setForm={setForm} errors={errors} />}
          {step === 3 && <StepStageDates form={form} setForm={setForm} errors={errors} />}
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
            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[14px] font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Rocket size={16} />
                {isSubmitting ? 'Launching...' : 'Launch Project'}
              </button>
            ) : (
              <button
                onClick={goNext}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[14px] font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-all"
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

export default NewNPDProjectModal
