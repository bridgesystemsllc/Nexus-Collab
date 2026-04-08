import { useState, useEffect, useRef } from 'react'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Rocket,
  Users,
  Calendar,
  Briefcase,
  DollarSign,
  Search,
  UserPlus,
  ChevronDown,
} from 'lucide-react'
import { useMembers, useCreateMember } from '@/hooks/useData'

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
  teamAssignments: { role: string; memberId: string; assignedName: string }[]
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

interface Member {
  id: string
  name: string
  email: string
  avatar?: string
}

const DEFAULT_TEAM: { role: string }[] = [
  { role: 'Launch Manager' },
  { role: 'Product Development Lead' },
  { role: 'R&D Director' },
  { role: 'R&D Lead' },
  { role: 'Operations Director' },
  { role: 'Operations Assistant' },
  { role: 'Brand Manager' },
  { role: 'Head of Business' },
  { role: 'Sales / Demand Planning' },
  { role: 'Finance Lead' },
  { role: 'BOM / Operations Lead' },
  { role: 'PO Manager' },
  { role: 'Amazon/Operations' },
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
    memberId: '',
    assignedName: '',
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

// ─── Member Select Dropdown ───────────────────────────────
function MemberSelect({
  value,
  onChange,
  members,
  onMemberCreated,
}: {
  value: { memberId: string; assignedName: string }
  onChange: (val: { memberId: string; assignedName: string }) => void
  members: Member[]
  onMemberCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [createError, setCreateError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const createMember = useCreateMember()

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = members.filter((m) => {
    const q = search.toLowerCase()
    return m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
  })

  const handleSelect = (m: Member) => {
    onChange({ memberId: m.id, assignedName: m.name })
    setOpen(false)
    setSearch('')
    setCreating(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange({ memberId: '', assignedName: '' })
  }

  const handleCreate = async () => {
    if (!newName.trim() || !newEmail.trim()) return
    setCreateError('')
    try {
      const created = await createMember.mutateAsync({
        name: newName.trim(),
        email: newEmail.trim(),
        role: 'MEMBER',
      })
      onMemberCreated()
      onChange({ memberId: created.id, assignedName: created.name })
      setOpen(false)
      setCreating(false)
      setNewName('')
      setNewEmail('')
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setCreateError('Email already in use')
      } else {
        setCreateError('Failed to create user')
      }
    }
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between bg-[var(--bg-input)] border rounded-lg px-3.5 py-2.5 text-[14px] text-left transition-all ${
          open
            ? 'border-[var(--accent)] shadow-[0_0_0_3px_rgba(47,128,237,0.12)]'
            : 'border-[var(--border-default)] hover:border-[var(--accent)]'
        }`}
      >
        {value.assignedName ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-[11px] font-semibold shrink-0">
              {value.assignedName[0]?.toUpperCase()}
            </div>
            <span className="text-[var(--text-primary)] truncate">{value.assignedName}</span>
            <button
              type="button"
              onClick={handleClear}
              className="ml-auto p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <span className="text-[var(--text-tertiary)]">Select member</span>
        )}
        <ChevronDown size={16} className="text-[var(--text-tertiary)] shrink-0 ml-2" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg overflow-hidden">
          {!creating ? (
            <>
              {/* Search */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)]">
                <Search size={14} className="text-[var(--text-tertiary)] shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search members..."
                  autoFocus
                  className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
                />
              </div>

              {/* Member list */}
              <div className="max-h-[200px] overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]">No members found</p>
                ) : (
                  filtered.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelect(m)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-[12px] font-semibold shrink-0">
                        {m.name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{m.name}</p>
                        <p className="text-[11px] text-[var(--text-tertiary)] truncate">{m.email}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Create new user button */}
              <button
                type="button"
                onClick={() => { setCreating(true); setSearch('') }}
                className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-[var(--border-subtle)] text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <UserPlus size={14} />
                Create New User
              </button>
            </>
          ) : (
            /* Inline create form */
            <div className="p-3 space-y-2.5">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">New User</p>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full name"
                autoFocus
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
              />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email address"
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
              />
              {createError && (
                <p className="text-[12px] text-[var(--danger)]">{createError}</p>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName(''); setNewEmail(''); setCreateError('') }}
                  className="px-3 py-1.5 rounded-lg text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newName.trim() || !newEmail.trim() || createMember.isPending}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createMember.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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
  const [form, setForm] = useState<NPDFormData>(EMPTY_NPD_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setForm(EMPTY_NPD_FORM)
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
        className="relative z-10 flex flex-col min-h-0 bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl w-full max-w-[960px] h-screen animate-slide-in-right"
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
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
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
