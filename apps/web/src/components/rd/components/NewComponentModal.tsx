import { useState, useEffect } from 'react'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  COMPONENT_TYPES,
  SUB_TYPES,
  ALL_FEASIBILITY_STATUSES,
  VENDOR_CERTIFICATIONS,
  generatePartNumber,
  calculateLandedCost,
  type ComponentType,
  type FeasibilityStatus,
  type ComponentVendor,
  type MOQTier,
} from './componentData'

// ─── Constants ─────────────────────────────────────────────

const BRANDS = ["Carol's Daughter", 'Dermablend', 'Baxter of California', 'Ambi', 'AcneFree']
const PRIORITIES = ['Critical', 'High', 'Standard']
const CERT_OPTIONS = ['FSC', 'SCS Recycled', 'Ocean Plastic', 'BPA-Free', 'Other']
const INCOTERMS = ['EXW', 'FOB', 'CIF', 'DDP', 'Other']
const VENDOR_TYPE_OPTIONS = ['Manufacturer', 'Distributor', 'Broker', 'Trading Company', 'Other']
const VENDOR_STATUS_OPTIONS = ['Primary', 'Secondary', 'Evaluating', 'Disqualified']
const ORIENTATION_OPTIONS = ['Upright', 'Inverted', 'Horizontal']
const CLOSURE_SUBTYPE_OPTIONS = ['Screw Cap', 'Flip Top', 'Disc Top', 'Press Cap', 'Snap Cap', 'Overcap', 'Dropper Cap', 'Pump Cap', 'Mist Sprayer', 'Tamper Evident']
const SUPPLIED_AS_OPTIONS = ['Liquid', 'Powder', 'Paste', 'Flake', 'Pellet', 'Solution', 'Emulsion', 'Other']

const STEPS = [
  'Component Identity',
  'Physical Specifications',
  'Vendor & Sourcing',
  'MOQ & Cost Tiers',
  'Feasibility & Testing',
]

// ─── Form Types ────────────────────────────────────────────

interface VendorForm {
  vendorName: string
  vendorType: string
  vendorStatus: string
  contactName: string
  contactEmail: string
  contactPhone: string
  location: string
  leadTimeStandard: string
  leadTimeRush: string
  vendorPartNumber: string
  vendorCertifications: string[]
  paymentTerms: string
  incoterms: string
  portOfLoading: string
  overallRating: number
  notes: string
}

interface MOQTierForm {
  moqQuantity: string
  unitCost: string
  toolingCost: string
  sampleCost: string
  shippingCostPerUnit: string
  dutyRatePct: string
  effectiveDate: string
  expiryDate: string
  quoteReference: string
  totalLandedCost: number
}

export interface ComponentFormData {
  // Step 1 — Identity
  name: string
  partNumber: string
  type: ComponentType
  subType: string
  brands: string[]
  description: string
  status: FeasibilityStatus
  priority: string
  isReplacement: boolean
  tags: string

  // Step 2 — Physical Specs
  material: string
  color: string
  finish: string
  weightEmpty: string
  countryOfManufacture: string
  pcrContentPct: string
  isRecyclable: boolean
  certifications: string[]
  typeSpecs: Record<string, any>

  // Step 3 — Vendors
  vendors: VendorForm[]

  // Step 4 — MOQ Tiers (per vendor index)
  moqTiers: Record<number, MOQTierForm[]>
  targetCostPerUnit: string
  maxAcceptableCost: string
  projectedAnnualUnits: string

  // Step 5 — Feasibility
  feasibilityStartDate: string
  targetApprovalDate: string
  targetProductionDate: string
  sampleRequestDate: string
  sampleETA: string
  sampleReceivedDate: string
  samplesReceivedQty: string
  feasibilityNotes: string
  linkedBriefIds: string
  linkedNPDIds: string
}

const EMPTY_VENDOR: VendorForm = {
  vendorName: '',
  vendorType: '',
  vendorStatus: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  location: '',
  leadTimeStandard: '',
  leadTimeRush: '',
  vendorPartNumber: '',
  vendorCertifications: [],
  paymentTerms: '',
  incoterms: '',
  portOfLoading: '',
  overallRating: 0,
  notes: '',
}

const EMPTY_TIER: MOQTierForm = {
  moqQuantity: '',
  unitCost: '',
  toolingCost: '',
  sampleCost: '',
  shippingCostPerUnit: '',
  dutyRatePct: '',
  effectiveDate: '',
  expiryDate: '',
  quoteReference: '',
  totalLandedCost: 0,
}

const EMPTY_FORM: ComponentFormData = {
  name: '',
  partNumber: generatePartNumber(),
  type: 'Primary Packaging',
  subType: '',
  brands: [],
  description: '',
  status: 'Concept',
  priority: 'Standard',
  isReplacement: false,
  tags: '',

  material: '',
  color: '',
  finish: '',
  weightEmpty: '',
  countryOfManufacture: '',
  pcrContentPct: '',
  isRecyclable: false,
  certifications: [],
  typeSpecs: {},

  vendors: [{ ...EMPTY_VENDOR }],
  moqTiers: { 0: [] },
  targetCostPerUnit: '',
  maxAcceptableCost: '',
  projectedAnnualUnits: '',

  feasibilityStartDate: '',
  targetApprovalDate: '',
  targetProductionDate: '',
  sampleRequestDate: '',
  sampleETA: '',
  sampleReceivedDate: '',
  samplesReceivedQty: '',
  feasibilityNotes: '',
  linkedBriefIds: '',
  linkedNPDIds: '',
}

// ─── Validation ────────────────────────────────────────────

function validateStep(step: number, form: ComponentFormData): Record<string, string> {
  const errors: Record<string, string> = {}
  if (step === 0) {
    if (!form.name.trim()) errors.name = 'Component name is required'
    if (!form.type) errors.type = 'Type is required'
  }
  if (step === 2) {
    form.vendors.forEach((v, i) => {
      if (!v.vendorName.trim()) errors[`vendor_${i}_name`] = 'Vendor name is required'
    })
  }
  return errors
}

// ─── Shared Input Components ──────────────────────────────

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
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: boolean
  type?: string
  disabled?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full bg-[var(--bg-input)] border rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      } ${
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

function MultiCheckbox({
  options,
  selected,
  onChange,
}: {
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium border transition-all ${
            selected.includes(opt)
              ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
              : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--accent)]'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-center gap-2.5"
    >
      <div
        className={`relative w-10 h-[22px] rounded-full transition-colors ${
          value ? 'bg-[var(--accent)]' : 'bg-[var(--border-default)]'
        }`}
      >
        <div
          className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-[20px]' : 'translate-x-[2px]'
          }`}
        />
      </div>
      {label && <span className="text-[13px] text-[var(--text-secondary)]">{label}</span>}
    </button>
  )
}

// ─── Step Props ────────────────────────────────────────────

interface StepProps {
  form: ComponentFormData
  setForm: (f: ComponentFormData) => void
  errors: Record<string, string>
}

// ─── Step 1 — Component Identity ──────────────────────────

function Step1({ form, setForm, errors }: StepProps) {
  return (
    <div className="space-y-5">
      <FormField label="Component Name" required error={errors.name}>
        <TextInput
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="e.g. 2oz White Laminate Tube"
          error={!!errors.name}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Part Number (auto-generated)">
          <TextInput
            value={form.partNumber}
            onChange={(v) => setForm({ ...form, partNumber: v })}
            placeholder="COMP-2026-XXXX"
          />
        </FormField>
        <FormField label="Component Type" required error={errors.type}>
          <Select
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v as ComponentType, subType: '' })}
            options={COMPONENT_TYPES}
            placeholder="Select type"
            error={!!errors.type}
          />
        </FormField>
      </div>

      {form.type && SUB_TYPES[form.type]?.length > 0 && (
        <FormField label="Sub-Type">
          <Select
            value={form.subType}
            onChange={(v) => setForm({ ...form, subType: v })}
            options={SUB_TYPES[form.type]}
            placeholder="Select sub-type"
          />
        </FormField>
      )}

      <FormField label="Brands">
        <MultiCheckbox
          options={BRANDS}
          selected={form.brands}
          onChange={(v) => setForm({ ...form, brands: v })}
        />
      </FormField>

      <FormField label="Description">
        <TextArea
          value={form.description}
          onChange={(v) => setForm({ ...form, description: v })}
          placeholder="Brief description of this component"
          rows={3}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Status">
          <Select
            value={form.status}
            onChange={(v) => setForm({ ...form, status: v as FeasibilityStatus })}
            options={ALL_FEASIBILITY_STATUSES}
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

      <FormField label="Replacement Component">
        <Toggle
          value={form.isReplacement}
          onChange={(v) => setForm({ ...form, isReplacement: v })}
          label={form.isReplacement ? 'Yes — replaces an existing component' : 'No'}
        />
      </FormField>

      <FormField label="Tags (comma-separated)">
        <TextInput
          value={form.tags}
          onChange={(v) => setForm({ ...form, tags: v })}
          placeholder="e.g. eco-friendly, premium, relaunch"
        />
      </FormField>
    </div>
  )
}

// ─── Step 2 — Physical Specifications ─────────────────────

function Step2({ form, setForm }: StepProps) {
  const specs = form.typeSpecs
  const setSpec = (key: string, value: any) => {
    setForm({ ...form, typeSpecs: { ...specs, [key]: value } })
  }

  return (
    <div className="space-y-5">
      {/* Universal fields */}
      <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Universal Specs</h3>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Material">
          <TextInput value={form.material} onChange={(v) => setForm({ ...form, material: v })} placeholder="e.g. HDPE, PET, Glass" />
        </FormField>
        <FormField label="Color">
          <TextInput value={form.color} onChange={(v) => setForm({ ...form, color: v })} placeholder="e.g. White, Frosted Clear" />
        </FormField>
        <FormField label="Finish">
          <TextInput value={form.finish} onChange={(v) => setForm({ ...form, finish: v })} placeholder="e.g. Matte, Gloss, Soft Touch" />
        </FormField>
        <FormField label="Weight (Empty)">
          <TextInput value={form.weightEmpty} onChange={(v) => setForm({ ...form, weightEmpty: v })} placeholder="e.g. 12g" />
        </FormField>
        <FormField label="Country of Manufacture">
          <TextInput value={form.countryOfManufacture} onChange={(v) => setForm({ ...form, countryOfManufacture: v })} placeholder="e.g. China, USA" />
        </FormField>
        <FormField label="PCR Content (%)">
          <TextInput
            type="number"
            value={form.pcrContentPct}
            onChange={(v) => setForm({ ...form, pcrContentPct: v })}
            placeholder="0"
          />
        </FormField>
      </div>

      <FormField label="Recyclable">
        <Toggle
          value={form.isRecyclable}
          onChange={(v) => setForm({ ...form, isRecyclable: v })}
          label={form.isRecyclable ? 'Yes' : 'No'}
        />
      </FormField>

      <FormField label="Certifications">
        <MultiCheckbox
          options={CERT_OPTIONS}
          selected={form.certifications}
          onChange={(v) => setForm({ ...form, certifications: v })}
        />
      </FormField>

      {/* Type-specific fields */}
      {form.type === 'Primary Packaging' && (
        <>
          <div className="pt-4 border-t border-[var(--border-subtle)]">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">Primary Packaging Specs</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Net Fill Volume">
              <TextInput value={specs.netFillVolume || ''} onChange={(v) => setSpec('netFillVolume', v)} placeholder="e.g. 60ml" />
            </FormField>
            <FormField label="Closure Type">
              <TextInput value={specs.closureType || ''} onChange={(v) => setSpec('closureType', v)} placeholder="e.g. Screw Cap" />
            </FormField>
            <FormField label="Neck Finish">
              <TextInput value={specs.neckFinish || ''} onChange={(v) => setSpec('neckFinish', v)} placeholder="e.g. 24/410" />
            </FormField>
            <FormField label="Tube Diameter">
              <TextInput value={specs.tubeDiameter || ''} onChange={(v) => setSpec('tubeDiameter', v)} placeholder="e.g. 35mm" />
            </FormField>
            <FormField label="Overall Height">
              <TextInput value={specs.overallHeight || ''} onChange={(v) => setSpec('overallHeight', v)} placeholder="e.g. 145mm" />
            </FormField>
            <FormField label="Label Panel Width">
              <TextInput value={specs.labelPanelWidth || ''} onChange={(v) => setSpec('labelPanelWidth', v)} placeholder="e.g. 80mm" />
            </FormField>
            <FormField label="Label Panel Height">
              <TextInput value={specs.labelPanelHeight || ''} onChange={(v) => setSpec('labelPanelHeight', v)} placeholder="e.g. 55mm" />
            </FormField>
            <FormField label="Fill Opening Diameter">
              <TextInput value={specs.fillOpeningDiameter || ''} onChange={(v) => setSpec('fillOpeningDiameter', v)} placeholder="e.g. 22mm" />
            </FormField>
          </div>
          <FormField label="Orientation">
            <Select
              value={specs.orientation || ''}
              onChange={(v) => setSpec('orientation', v)}
              options={ORIENTATION_OPTIONS}
              placeholder="Select orientation"
            />
          </FormField>
        </>
      )}

      {form.type === 'Closures' && (
        <>
          <div className="pt-4 border-t border-[var(--border-subtle)]">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">Closure Specs</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Closure Diameter">
              <TextInput value={specs.closureDiameter || ''} onChange={(v) => setSpec('closureDiameter', v)} placeholder="e.g. 24mm" />
            </FormField>
            <FormField label="Closure Sub-Type">
              <Select
                value={specs.closureSubType || ''}
                onChange={(v) => setSpec('closureSubType', v)}
                options={CLOSURE_SUBTYPE_OPTIONS}
                placeholder="Select sub-type"
              />
            </FormField>
            <FormField label="Closure Material">
              <TextInput value={specs.closureMaterial || ''} onChange={(v) => setSpec('closureMaterial', v)} placeholder="e.g. PP" />
            </FormField>
            <FormField label="Dispensing Rate">
              <TextInput value={specs.dispensingRate || ''} onChange={(v) => setSpec('dispensingRate', v)} placeholder="e.g. 1.2ml/stroke" />
            </FormField>
            <FormField label="Torque Spec">
              <TextInput value={specs.torqueSpec || ''} onChange={(v) => setSpec('torqueSpec', v)} placeholder="e.g. 12-15 in-lbs" />
            </FormField>
          </div>
          <FormField label="Includes Gasket">
            <Toggle
              value={specs.includesGasket || false}
              onChange={(v) => setSpec('includesGasket', v)}
              label={specs.includesGasket ? 'Yes' : 'No'}
            />
          </FormField>
        </>
      )}

      {form.type === 'Secondary Packaging' && (
        <>
          <div className="pt-4 border-t border-[var(--border-subtle)]">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">Secondary Packaging Specs</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Dimensions (L x W x H)">
              <TextInput value={specs.dimensions || ''} onChange={(v) => setSpec('dimensions', v)} placeholder="e.g. 120 x 40 x 160 mm" />
            </FormField>
            <FormField label="Board Grade">
              <TextInput value={specs.boardGrade || ''} onChange={(v) => setSpec('boardGrade', v)} placeholder="e.g. 18pt SBS C1S" />
            </FormField>
            <FormField label="Coating">
              <TextInput value={specs.coating || ''} onChange={(v) => setSpec('coating', v)} placeholder="e.g. Soft Touch Matte" />
            </FormField>
            <FormField label="Units Per Carton">
              <TextInput type="number" value={specs.unitsPerCarton || ''} onChange={(v) => setSpec('unitsPerCarton', v)} placeholder="e.g. 24" />
            </FormField>
            <FormField label="Cartons Per Shipper">
              <TextInput type="number" value={specs.cartonsPerShipper || ''} onChange={(v) => setSpec('cartonsPerShipper', v)} placeholder="e.g. 12" />
            </FormField>
            <FormField label="Pallet Config">
              <TextInput value={specs.palletConfig || ''} onChange={(v) => setSpec('palletConfig', v)} placeholder="e.g. Ti x Hi: 8 x 6" />
            </FormField>
          </div>
        </>
      )}

      {form.type === 'Raw Materials' && (
        <>
          <div className="pt-4 border-t border-[var(--border-subtle)]">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">Raw Material Specs</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="INCI Name">
              <TextInput value={specs.inciName || ''} onChange={(v) => setSpec('inciName', v)} placeholder="e.g. Aqua" />
            </FormField>
            <FormField label="CAS Number">
              <TextInput value={specs.casNumber || ''} onChange={(v) => setSpec('casNumber', v)} placeholder="e.g. 7732-18-5" />
            </FormField>
            <FormField label="Function in Formula">
              <TextInput value={specs.functionInFormula || ''} onChange={(v) => setSpec('functionInFormula', v)} placeholder="e.g. Solvent, Emollient" />
            </FormField>
            <FormField label="Typical Use Level">
              <TextInput value={specs.typicalUseLevel || ''} onChange={(v) => setSpec('typicalUseLevel', v)} placeholder="e.g. 1-5%" />
            </FormField>
            <FormField label="Supplied As">
              <Select
                value={specs.suppliedAs || ''}
                onChange={(v) => setSpec('suppliedAs', v)}
                options={SUPPLIED_AS_OPTIONS}
                placeholder="Select form"
              />
            </FormField>
            <FormField label="Purity">
              <TextInput value={specs.purity || ''} onChange={(v) => setSpec('purity', v)} placeholder="e.g. 99.5%" />
            </FormField>
            <FormField label="Storage Conditions">
              <TextInput value={specs.storageConditions || ''} onChange={(v) => setSpec('storageConditions', v)} placeholder="e.g. Cool, dry, below 25C" />
            </FormField>
            <FormField label="Shelf Life (Months)">
              <TextInput type="number" value={specs.shelfLifeMonths || ''} onChange={(v) => setSpec('shelfLifeMonths', v)} placeholder="e.g. 24" />
            </FormField>
            <FormField label="Hazard Class">
              <TextInput value={specs.hazardClass || ''} onChange={(v) => setSpec('hazardClass', v)} placeholder="e.g. Non-hazardous" />
            </FormField>
          </div>
          <FormField label="SDS Required">
            <Toggle
              value={specs.sdsRequired || false}
              onChange={(v) => setSpec('sdsRequired', v)}
              label={specs.sdsRequired ? 'Yes' : 'No'}
            />
          </FormField>
        </>
      )}
    </div>
  )
}

// ─── Step 3 — Vendor & Sourcing ───────────────────────────

function Step3({ form, setForm, errors }: StepProps) {
  const addVendor = () => {
    if (form.vendors.length < 5) {
      const newVendors = [...form.vendors, { ...EMPTY_VENDOR }]
      const newTiers = { ...form.moqTiers, [newVendors.length - 1]: [] }
      setForm({ ...form, vendors: newVendors, moqTiers: newTiers })
    }
  }

  const removeVendor = (i: number) => {
    if (form.vendors.length > 1) {
      const newVendors = form.vendors.filter((_, idx) => idx !== i)
      // Rebuild moqTiers with shifted indices
      const newTiers: Record<number, MOQTierForm[]> = {}
      newVendors.forEach((_, idx) => {
        const oldIdx = idx >= i ? idx + 1 : idx
        newTiers[idx] = form.moqTiers[oldIdx] || []
      })
      setForm({ ...form, vendors: newVendors, moqTiers: newTiers })
    }
  }

  const updateVendor = (i: number, field: string, value: any) => {
    const vendors = [...form.vendors]
    vendors[i] = { ...vendors[i], [field]: value }
    setForm({ ...form, vendors })
  }

  return (
    <div className="space-y-4">
      {form.vendors.map((v, i) => (
        <div
          key={i}
          className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-semibold text-[var(--text-primary)]">
              Vendor {i + 1}
            </span>
            {form.vendors.length > 1 && (
              <button
                onClick={() => removeVendor(i)}
                className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)]"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Vendor Name" required error={errors[`vendor_${i}_name`]}>
              <TextInput
                value={v.vendorName}
                onChange={(val) => updateVendor(i, 'vendorName', val)}
                placeholder="Company name"
                error={!!errors[`vendor_${i}_name`]}
              />
            </FormField>
            <FormField label="Vendor Type">
              <Select
                value={v.vendorType}
                onChange={(val) => updateVendor(i, 'vendorType', val)}
                options={VENDOR_TYPE_OPTIONS}
                placeholder="Select type"
              />
            </FormField>
            <FormField label="Vendor Status">
              <Select
                value={v.vendorStatus}
                onChange={(val) => updateVendor(i, 'vendorStatus', val)}
                options={VENDOR_STATUS_OPTIONS}
                placeholder="Select status"
              />
            </FormField>
            <FormField label="Contact Name">
              <TextInput
                value={v.contactName}
                onChange={(val) => updateVendor(i, 'contactName', val)}
                placeholder="Full name"
              />
            </FormField>
            <FormField label="Contact Email">
              <TextInput
                type="email"
                value={v.contactEmail}
                onChange={(val) => updateVendor(i, 'contactEmail', val)}
                placeholder="email@vendor.com"
              />
            </FormField>
            <FormField label="Contact Phone">
              <TextInput
                value={v.contactPhone}
                onChange={(val) => updateVendor(i, 'contactPhone', val)}
                placeholder="+1 555-000-0000"
              />
            </FormField>
            <FormField label="Location">
              <TextInput
                value={v.location}
                onChange={(val) => updateVendor(i, 'location', val)}
                placeholder="City, Country"
              />
            </FormField>
            <FormField label="Lead Time (Standard)">
              <TextInput
                value={v.leadTimeStandard}
                onChange={(val) => updateVendor(i, 'leadTimeStandard', val)}
                placeholder="e.g. 6-8 weeks"
              />
            </FormField>
            <FormField label="Lead Time (Rush)">
              <TextInput
                value={v.leadTimeRush}
                onChange={(val) => updateVendor(i, 'leadTimeRush', val)}
                placeholder="e.g. 3-4 weeks"
              />
            </FormField>
            <FormField label="Vendor Part Number">
              <TextInput
                value={v.vendorPartNumber}
                onChange={(val) => updateVendor(i, 'vendorPartNumber', val)}
                placeholder="Vendor's internal SKU"
              />
            </FormField>
          </div>

          <FormField label="Vendor Certifications">
            <MultiCheckbox
              options={VENDOR_CERTIFICATIONS}
              selected={v.vendorCertifications}
              onChange={(val) => updateVendor(i, 'vendorCertifications', val)}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Payment Terms">
              <TextInput
                value={v.paymentTerms}
                onChange={(val) => updateVendor(i, 'paymentTerms', val)}
                placeholder="e.g. Net 30, 50% deposit"
              />
            </FormField>
            <FormField label="Incoterms">
              <Select
                value={v.incoterms}
                onChange={(val) => updateVendor(i, 'incoterms', val)}
                options={INCOTERMS}
                placeholder="Select incoterm"
              />
            </FormField>
            <FormField label="Port of Loading">
              <TextInput
                value={v.portOfLoading}
                onChange={(val) => updateVendor(i, 'portOfLoading', val)}
                placeholder="e.g. Shanghai, Shenzhen"
              />
            </FormField>
            <FormField label="Overall Rating (1-5)">
              <TextInput
                type="number"
                value={v.overallRating ? String(v.overallRating) : ''}
                onChange={(val) => {
                  const n = Math.min(5, Math.max(0, Number(val)))
                  updateVendor(i, 'overallRating', n)
                }}
                placeholder="1-5"
              />
            </FormField>
          </div>

          <FormField label="Notes">
            <TextArea
              value={v.notes}
              onChange={(val) => updateVendor(i, 'notes', val)}
              placeholder="Additional vendor notes..."
              rows={2}
            />
          </FormField>
        </div>
      ))}

      {form.vendors.length < 5 && (
        <button
          onClick={addVendor}
          className="flex items-center gap-1.5 text-[13px] text-[var(--accent)] font-medium hover:underline"
        >
          <Plus size={14} /> Add Alternative Vendor
        </button>
      )}
    </div>
  )
}

// ─── Step 4 — MOQ & Cost Tiers ────────────────────────────

function Step4({ form, setForm }: StepProps) {
  const [activeVendorIdx, setActiveVendorIdx] = useState(0)

  const tiers = form.moqTiers[activeVendorIdx] || []

  const setTiers = (newTiers: MOQTierForm[]) => {
    setForm({
      ...form,
      moqTiers: { ...form.moqTiers, [activeVendorIdx]: newTiers },
    })
  }

  const addTier = () => {
    setTiers([...tiers, { ...EMPTY_TIER }])
  }

  const removeTier = (i: number) => {
    setTiers(tiers.filter((_, idx) => idx !== i))
  }

  const updateTier = (i: number, field: string, value: string) => {
    const updated = [...tiers]
    updated[i] = { ...updated[i], [field]: value }
    // Auto-calculate totalLandedCost
    const uc = parseFloat(updated[i].unitCost) || 0
    const sc = parseFloat(updated[i].shippingCostPerUnit) || 0
    const dr = parseFloat(updated[i].dutyRatePct) || 0
    updated[i].totalLandedCost = uc + sc + (uc * dr) / 100
    setTiers(updated)
  }

  return (
    <div className="space-y-5">
      {/* Vendor tabs */}
      {form.vendors.length > 1 && (
        <div className="flex gap-1 border-b border-[var(--border-subtle)] mb-2">
          {form.vendors.map((v, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveVendorIdx(i)}
              className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
                activeVendorIdx === i
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {v.vendorName || `Vendor ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* Tiers table */}
      {tiers.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[var(--text-tertiary)] border-b border-[var(--border-subtle)]">
                <th className="text-left py-2 px-2 font-medium">MOQ Qty</th>
                <th className="text-left py-2 px-2 font-medium">Unit Cost</th>
                <th className="text-left py-2 px-2 font-medium">Tooling</th>
                <th className="text-left py-2 px-2 font-medium">Sample</th>
                <th className="text-left py-2 px-2 font-medium">Shipping/Unit</th>
                <th className="text-left py-2 px-2 font-medium">Duty %</th>
                <th className="text-left py-2 px-2 font-medium">Eff. Date</th>
                <th className="text-left py-2 px-2 font-medium">Exp. Date</th>
                <th className="text-left py-2 px-2 font-medium">Quote Ref</th>
                <th className="text-left py-2 px-2 font-medium">Landed Cost</th>
                <th className="py-2 px-1"></th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, i) => (
                <tr key={i} className="border-b border-[var(--border-subtle)]">
                  <td className="py-1.5 px-1">
                    <input
                      type="number"
                      value={tier.moqQuantity}
                      onChange={(e) => updateTier(i, 'moqQuantity', e.target.value)}
                      placeholder="Qty"
                      className="w-20 bg-[var(--bg-input)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="number"
                      step="0.01"
                      value={tier.unitCost}
                      onChange={(e) => updateTier(i, 'unitCost', e.target.value)}
                      placeholder="$0.00"
                      className="w-20 bg-[var(--bg-input)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="number"
                      step="0.01"
                      value={tier.toolingCost}
                      onChange={(e) => updateTier(i, 'toolingCost', e.target.value)}
                      placeholder="$0.00"
                      className="w-20 bg-[var(--bg-input)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="number"
                      step="0.01"
                      value={tier.sampleCost}
                      onChange={(e) => updateTier(i, 'sampleCost', e.target.value)}
                      placeholder="$0.00"
                      className="w-20 bg-[var(--bg-input)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="number"
                      step="0.01"
                      value={tier.shippingCostPerUnit}
                      onChange={(e) => updateTier(i, 'shippingCostPerUnit', e.target.value)}
                      placeholder="$0.00"
                      className="w-20 bg-[var(--bg-input)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="number"
                      step="0.1"
                      value={tier.dutyRatePct}
                      onChange={(e) => updateTier(i, 'dutyRatePct', e.target.value)}
                      placeholder="%"
                      className="w-16 bg-[var(--bg-input)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="date"
                      value={tier.effectiveDate}
                      onChange={(e) => updateTier(i, 'effectiveDate', e.target.value)}
                      className="w-32 bg-[var(--bg-input)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="date"
                      value={tier.expiryDate}
                      onChange={(e) => updateTier(i, 'expiryDate', e.target.value)}
                      className="w-32 bg-[var(--bg-input)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      value={tier.quoteReference}
                      onChange={(e) => updateTier(i, 'quoteReference', e.target.value)}
                      placeholder="Ref #"
                      className="w-24 bg-[var(--bg-input)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                      ${tier.totalLandedCost.toFixed(2)}
                    </span>
                  </td>
                  <td className="py-1.5 px-1">
                    <button
                      onClick={() => removeTier(i)}
                      className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)]"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={addTier}
        className="flex items-center gap-1.5 text-[13px] text-[var(--accent)] font-medium hover:underline"
      >
        <Plus size={14} /> Add Tier
      </button>

      {/* Cost targets */}
      <div className="pt-4 border-t border-[var(--border-subtle)]">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">Cost Targets</h3>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Target Cost Per Unit">
            <TextInput
              type="number"
              value={form.targetCostPerUnit}
              onChange={(v) => setForm({ ...form, targetCostPerUnit: v })}
              placeholder="$0.00"
            />
          </FormField>
          <FormField label="Max Acceptable Cost">
            <TextInput
              type="number"
              value={form.maxAcceptableCost}
              onChange={(v) => setForm({ ...form, maxAcceptableCost: v })}
              placeholder="$0.00"
            />
          </FormField>
          <FormField label="Projected Annual Units">
            <TextInput
              type="number"
              value={form.projectedAnnualUnits}
              onChange={(v) => setForm({ ...form, projectedAnnualUnits: v })}
              placeholder="e.g. 500000"
            />
          </FormField>
        </div>
      </div>
    </div>
  )
}

// ─── Step 5 — Feasibility & Testing ──────────────────────

function Step5({ form, setForm }: StepProps) {
  return (
    <div className="space-y-5">
      <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Key Dates</h3>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Feasibility Start Date">
          <TextInput type="date" value={form.feasibilityStartDate} onChange={(v) => setForm({ ...form, feasibilityStartDate: v })} />
        </FormField>
        <FormField label="Target Approval Date">
          <TextInput type="date" value={form.targetApprovalDate} onChange={(v) => setForm({ ...form, targetApprovalDate: v })} />
        </FormField>
        <FormField label="Target Production Date">
          <TextInput type="date" value={form.targetProductionDate} onChange={(v) => setForm({ ...form, targetProductionDate: v })} />
        </FormField>
        <FormField label="Sample Request Date">
          <TextInput type="date" value={form.sampleRequestDate} onChange={(v) => setForm({ ...form, sampleRequestDate: v })} />
        </FormField>
        <FormField label="Sample ETA">
          <TextInput type="date" value={form.sampleETA} onChange={(v) => setForm({ ...form, sampleETA: v })} />
        </FormField>
        <FormField label="Sample Received Date">
          <TextInput type="date" value={form.sampleReceivedDate} onChange={(v) => setForm({ ...form, sampleReceivedDate: v })} />
        </FormField>
      </div>

      <FormField label="Samples Received Qty">
        <TextInput
          type="number"
          value={form.samplesReceivedQty}
          onChange={(v) => setForm({ ...form, samplesReceivedQty: v })}
          placeholder="0"
        />
      </FormField>

      <FormField label="Feasibility Notes">
        <TextArea
          value={form.feasibilityNotes}
          onChange={(v) => setForm({ ...form, feasibilityNotes: v })}
          placeholder="Notes on feasibility assessment, risks, special requirements..."
          rows={4}
        />
      </FormField>

      <div className="pt-4 border-t border-[var(--border-subtle)]">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">Linked Records</h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Linked Brief IDs">
            <TextInput
              value={form.linkedBriefIds}
              onChange={(v) => setForm({ ...form, linkedBriefIds: v })}
              placeholder="e.g. BRIEF-2026-001, BRIEF-2026-002"
            />
          </FormField>
          <FormField label="Linked NPD IDs">
            <TextInput
              value={form.linkedNPDIds}
              onChange={(v) => setForm({ ...form, linkedNPDIds: v })}
              placeholder="e.g. NPD-2026-001"
            />
          </FormField>
        </div>
      </div>
    </div>
  )
}

// ─── Main Modal ────────────────────────────────────────────

interface NewComponentModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: ComponentFormData) => void
  isSubmitting?: boolean
}

export function NewComponentModal({ open, onClose, onSubmit, isSubmitting }: NewComponentModalProps) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<ComponentFormData>({ ...EMPTY_FORM, partNumber: generatePartNumber() })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, partNumber: generatePartNumber() })
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

  if (!open) return null

  const isLastStep = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Slide-over panel — 960px */}
      <div
        className="relative z-10 flex flex-col min-h-0 bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl w-full max-w-[960px] h-screen animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">New Component</h2>
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
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {step === 0 && <Step1 form={form} setForm={setForm} errors={errors} />}
          {step === 1 && <Step2 form={form} setForm={setForm} errors={errors} />}
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
            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 btn-primary px-5 py-2.5 rounded-lg text-[14px]"
              >
                {isSubmitting ? 'Creating...' : 'Create Component'}
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

export default NewComponentModal
