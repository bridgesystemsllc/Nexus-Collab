import { useEffect, useRef, useState } from 'react'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  Trash2,
  GripVertical,
  Loader2,
} from 'lucide-react'
import {
  PRODUCT_FORMATS,
  CHANNELS,
  LABEL_TYPES,
  SPECIAL_FINISHES,
  DIELINE_SOURCES,
  ARTWORK_FILE_FORMATS,
  COLOR_PROFILES,
  CERTIFICATION_OPTIONS,
  FRAGRANCE_OPTIONS,
  TARGET_RETAILERS,
  DEFAULT_APPROVAL_CHAIN,
  EMPTY_ARTWORK_FORM,
  type ArtworkFormData,
  type PantoneColor,
  type ActiveIngredient,
  type ApprovalChainRow,
} from './artworkData'

// ─── Props ───────────────────────────────────────────────────
interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (data: any) => void
  isSubmitting: boolean
}

// ─── Step definitions ────────────────────────────────────────
const STEPS = [
  { label: 'Product & SKU', description: 'Basic product info' },
  { label: 'Artwork Specs', description: 'Print specifications' },
  { label: 'Label & Compliance', description: 'Content and regulatory' },
  { label: 'Team & Workflow', description: 'Approvals and scheduling' },
] as const

const BRANDS = [
  "Carol's Daughter",
  'Dermablend',
  'Baxter of California',
  'Ambi',
  'AcneFree',
]

// ─── Component ───────────────────────────────────────────────
export function NewArtworkModal({ open, onClose, onSubmit, isSubmitting }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<ArtworkFormData>(() =>
    JSON.parse(JSON.stringify(EMPTY_ARTWORK_FORM)),
  )

  // Reset form on open
  useEffect(() => {
    if (open) {
      setForm(JSON.parse(JSON.stringify(EMPTY_ARTWORK_FORM)))
      setStep(0)
    }
  }, [open])

  // Escape to close
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

  if (!open) return null

  // ─── Field helpers ───────────────────────────────────────
  const set = <K extends keyof ArtworkFormData>(key: K, value: ArtworkFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const toggleArrayItem = (key: keyof ArtworkFormData, item: string) => {
    setForm((prev) => {
      const arr = (prev[key] as string[]) ?? []
      return {
        ...prev,
        [key]: arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item],
      }
    })
  }

  // ─── Pantone rows ────────────────────────────────────────
  const addPantoneRow = () =>
    set('pantoneColors', [...form.pantoneColors, { pms: '', name: '', purpose: '' }])

  const updatePantoneRow = (idx: number, field: keyof PantoneColor, value: string) =>
    set(
      'pantoneColors',
      form.pantoneColors.map((row, i) => (i === idx ? { ...row, [field]: value } : row)),
    )

  const removePantoneRow = (idx: number) =>
    set(
      'pantoneColors',
      form.pantoneColors.filter((_, i) => i !== idx),
    )

  // ─── Active ingredients rows (OTC) ───────────────────────
  const addActiveIngredient = () =>
    set('activeIngredients', [...form.activeIngredients, { name: '', percentage: '' }])

  const updateActiveIngredient = (idx: number, field: keyof ActiveIngredient, value: string) =>
    set(
      'activeIngredients',
      form.activeIngredients.map((row, i) => (i === idx ? { ...row, [field]: value } : row)),
    )

  const removeActiveIngredient = (idx: number) =>
    set(
      'activeIngredients',
      form.activeIngredients.filter((_, i) => i !== idx),
    )

  // ─── Approval chain ──────────────────────────────────────
  const updateApprovalRow = (idx: number, field: keyof ApprovalChainRow, value: any) =>
    set(
      'approvalChain',
      form.approvalChain.map((row, i) => (i === idx ? { ...row, [field]: value } : row)),
    )

  const moveApprovalRow = (idx: number, direction: -1 | 1) => {
    const target = idx + direction
    if (target < 0 || target >= form.approvalChain.length) return
    const next = [...form.approvalChain]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    // Re-sequence
    next.forEach((row, i) => (row.sequence = i + 1))
    set('approvalChain', next)
  }

  // ─── Navigation ──────────────────────────────────────────
  const canGoNext = () => {
    if (step === 0) return !!form.artworkName && !!form.brand && !!form.productName && form.channels.length > 0
    if (step === 1) return !!form.labelType
    if (step === 2) return !!form.productNameOnLabel && !!form.brandNameOnLabel
    return true
  }

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1)
  }
  const handleBack = () => {
    if (step > 0) setStep(step - 1)
  }
  const handleSubmit = () => {
    if (!isSubmitting) onSubmit(form)
  }

  // ─── Render ──────────────────────────────────────────────
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex justify-end"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />

      {/* Slide-over panel */}
      <div
        className="relative z-10 flex flex-col bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl w-full max-w-[960px] h-screen animate-slide-in-right"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              New Artwork Project
            </h2>
            <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
              Step {step + 1} of {STEPS.length} &mdash; {STEPS[step].label}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Step progress bar ── */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]">
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 text-xs font-medium transition-colors ${
                i === step
                  ? 'text-[var(--accent)]'
                  : i < step
                    ? 'text-[var(--text-secondary)] cursor-pointer hover:text-[var(--accent)]'
                    : 'text-[var(--text-tertiary)] cursor-default'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold border-2 transition-colors ${
                  i === step
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : i < step
                      ? 'border-[var(--accent)] bg-transparent text-[var(--accent)]'
                      : 'border-[var(--border-default)] bg-transparent text-[var(--text-tertiary)]'
                }`}
              >
                {i < step ? <Check size={12} /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
              {i < STEPS.length - 1 && (
                <div
                  className="w-8 h-0.5 rounded-full mx-1"
                  style={{
                    background: i < step ? 'var(--accent)' : 'var(--border-default)',
                  }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === 0 && renderStep1()}
          {step === 1 && renderStep2()}
          {step === 2 && renderStep3()}
          {step === 3 && renderStep4()}
        </div>

        {/* ── Footer navigation ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]">
          <button
            onClick={handleBack}
            disabled={step === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors
              text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]
              disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={handleNext}
              disabled={!canGoNext()}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold rounded-lg transition-colors
                bg-[var(--accent)] text-white hover:opacity-90
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !canGoNext()}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-colors
                bg-[var(--accent)] text-white hover:opacity-90
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              Create Artwork Project
            </button>
          )}
        </div>
      </div>

      {/* Slide-in animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  )

  // ─────────────────────────────────────────────────────────
  // STEP 1 — Product & SKU Setup
  // ─────────────────────────────────────────────────────────
  function renderStep1() {
    return (
      <div className="space-y-6">
        <SectionHeading title="Product & SKU Setup" />

        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <FormField label="Artwork Name" required span={2}>
            <TextInput
              value={form.artworkName}
              onChange={(v) => set('artworkName', v)}
              placeholder="e.g. Ambi Fade Cream 2oz Label Redesign"
            />
          </FormField>

          <FormField label="Brand" required>
            <SelectInput
              value={form.brand}
              onChange={(v) => set('brand', v)}
              options={BRANDS}
              placeholder="Select brand"
            />
          </FormField>

          <FormField label="Sub-Brand">
            <TextInput
              value={form.subBrand}
              onChange={(v) => set('subBrand', v)}
              placeholder="e.g. Even & Clear"
            />
          </FormField>

          <FormField label="Product Name" required>
            <TextInput
              value={form.productName}
              onChange={(v) => set('productName', v)}
              placeholder="e.g. Fade Cream"
            />
          </FormField>

          <FormField label="Product Format">
            <SelectInput
              value={form.productFormat}
              onChange={(v) => set('productFormat', v)}
              options={PRODUCT_FORMATS}
              placeholder="Select format"
            />
          </FormField>

          <FormField label="Net Weight">
            <TextInput
              value={form.netWeight}
              onChange={(v) => set('netWeight', v)}
              placeholder="e.g. 2 oz (56g)"
            />
          </FormField>

          <FormField label="Channels" required span={2}>
            <CheckboxGroup
              options={CHANNELS}
              selected={form.channels}
              onToggle={(item) => toggleArrayItem('channels', item)}
            />
          </FormField>

          <FormField label="OTC Product" span={2}>
            <ToggleSwitch
              checked={form.isOTC}
              onChange={(v) => set('isOTC', v)}
              label="This product is an OTC (Over-The-Counter) drug"
            />
          </FormField>
        </div>

        {/* Linked references */}
        <SectionHeading title="Linked References" subtitle="Optional cross-references to other projects" />
        <div className="grid grid-cols-3 gap-x-6 gap-y-5">
          <FormField label="Linked Brief ID">
            <TextInput
              value={form.linkedBriefId}
              onChange={(v) => set('linkedBriefId', v)}
              placeholder="BRIEF-XXX"
            />
          </FormField>
          <FormField label="Linked NPD ID">
            <TextInput
              value={form.linkedNPDId}
              onChange={(v) => set('linkedNPDId', v)}
              placeholder="NPD-XXX"
            />
          </FormField>
          <FormField label="Linked Formulation ID">
            <TextInput
              value={form.linkedFormulationId}
              onChange={(v) => set('linkedFormulationId', v)}
              placeholder="FORM-XXX"
            />
          </FormField>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────
  // STEP 2 — Artwork Specifications
  // ─────────────────────────────────────────────────────────
  function renderStep2() {
    return (
      <div className="space-y-6">
        <SectionHeading title="Artwork Specifications" />

        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <FormField label="Label Type" required>
            <SelectInput
              value={form.labelType}
              onChange={(v) => set('labelType', v)}
              options={LABEL_TYPES}
              placeholder="Select label type"
            />
          </FormField>

          <FormField label="Number of Colors">
            <TextInput
              value={form.numberOfColors}
              onChange={(v) => set('numberOfColors', v)}
              placeholder="e.g. 6"
              type="number"
            />
          </FormField>
        </div>

        {/* Pantone colors dynamic rows */}
        <SectionHeading title="Pantone Colors" subtitle="Define each PMS color used" />
        <div className="space-y-3">
          {form.pantoneColors.map((row, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className="flex-1 grid grid-cols-3 gap-3">
                <TextInput
                  value={row.pms}
                  onChange={(v) => updatePantoneRow(idx, 'pms', v)}
                  placeholder="PMS code"
                />
                <TextInput
                  value={row.name}
                  onChange={(v) => updatePantoneRow(idx, 'name', v)}
                  placeholder="Color name"
                />
                <TextInput
                  value={row.purpose}
                  onChange={(v) => updatePantoneRow(idx, 'purpose', v)}
                  placeholder="Purpose"
                />
              </div>
              <button
                onClick={() => removePantoneRow(idx)}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--bg-base)] transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={addPantoneRow}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:opacity-80 transition-opacity"
          >
            <Plus size={14} /> Add Pantone Color
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <FormField label="Special Finishes" span={2}>
            <CheckboxGroup
              options={SPECIAL_FINISHES}
              selected={form.specialFinishes}
              onToggle={(item) => toggleArrayItem('specialFinishes', item)}
            />
          </FormField>

          <FormField label="Dieline Source">
            <SelectInput
              value={form.dielineSource}
              onChange={(v) => set('dielineSource', v)}
              options={DIELINE_SOURCES}
              placeholder="Select source"
            />
          </FormField>

          <FormField label="Artwork File Format">
            <SelectInput
              value={form.artworkFileFormat}
              onChange={(v) => set('artworkFileFormat', v)}
              options={ARTWORK_FILE_FORMATS}
              placeholder="Select format"
            />
          </FormField>

          <FormField label="Bleed">
            <TextInput
              value={form.bleed}
              onChange={(v) => set('bleed', v)}
              placeholder='0.125"'
            />
          </FormField>

          <FormField label="Safety Margin">
            <TextInput
              value={form.safetyMargin}
              onChange={(v) => set('safetyMargin', v)}
              placeholder='0.0625"'
            />
          </FormField>

          <FormField label="Resolution">
            <TextInput
              value={form.resolution}
              onChange={(v) => set('resolution', v)}
              placeholder="300 DPI minimum"
            />
          </FormField>

          <FormField label="Color Profile">
            <SelectInput
              value={form.colorProfile}
              onChange={(v) => set('colorProfile', v)}
              options={COLOR_PROFILES}
              placeholder="Select profile"
            />
          </FormField>
        </div>

        {/* Printer info */}
        <SectionHeading title="Printer Information" />
        <div className="grid grid-cols-3 gap-x-6 gap-y-5">
          <FormField label="Printer Name">
            <TextInput
              value={form.printerName}
              onChange={(v) => set('printerName', v)}
              placeholder="Printer company name"
            />
          </FormField>
          <FormField label="Printer Contact">
            <TextInput
              value={form.printerContact}
              onChange={(v) => set('printerContact', v)}
              placeholder="Contact email or phone"
            />
          </FormField>
          <FormField label="Printer Submission Format">
            <TextInput
              value={form.printerSubmissionFormat}
              onChange={(v) => set('printerSubmissionFormat', v)}
              placeholder="e.g. PDF/X-4"
            />
          </FormField>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────
  // STEP 3 — Label Content & Compliance
  // ─────────────────────────────────────────────────────────
  function renderStep3() {
    return (
      <div className="space-y-6">
        <SectionHeading title="Label Content & Compliance" />

        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <FormField label="Product Name on Label" required>
            <TextInput
              value={form.productNameOnLabel}
              onChange={(v) => set('productNameOnLabel', v)}
              placeholder="Exact product name as printed"
            />
          </FormField>

          <FormField label="Brand Name on Label" required>
            <TextInput
              value={form.brandNameOnLabel}
              onChange={(v) => set('brandNameOnLabel', v)}
              placeholder="Exact brand name as printed"
            />
          </FormField>

          <FormField label="Tagline">
            <TextInput
              value={form.tagline}
              onChange={(v) => set('tagline', v)}
              placeholder="e.g. Healthy skin is always in"
            />
          </FormField>

          <FormField label="Net Weight Statement">
            <TextInput
              value={form.netWeightStatement}
              onChange={(v) => set('netWeightStatement', v)}
              placeholder="e.g. NET WT 2 OZ (56g)"
            />
          </FormField>

          <FormField label="Country of Origin">
            <TextInput
              value={form.countryOfOrigin}
              onChange={(v) => set('countryOfOrigin', v)}
              placeholder="Made in USA"
            />
          </FormField>

          <FormField label="Website">
            <TextInput
              value={form.website}
              onChange={(v) => set('website', v)}
              placeholder="www.example.com"
            />
          </FormField>

          <FormField label="Distributed By Statement" span={2}>
            <TextInput
              value={form.distributedByStatement}
              onChange={(v) => set('distributedByStatement', v)}
              placeholder="Distributed by KarEve, LLC..."
            />
          </FormField>

          <FormField label="Lot Code Format">
            <TextInput
              value={form.lotCodeFormat}
              onChange={(v) => set('lotCodeFormat', v)}
              placeholder="e.g. YYDDD-HH"
            />
          </FormField>

          <FormField label="PAO Symbol">
            <TextInput
              value={form.paoSymbol}
              onChange={(v) => set('paoSymbol', v)}
              placeholder="e.g. 12M"
            />
          </FormField>
        </div>

        {/* Claims */}
        <SectionHeading title="Label Claims" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <FormField label="Front Panel Claims">
            <TextArea
              value={form.frontPanelClaims}
              onChange={(v) => set('frontPanelClaims', v)}
              placeholder="Claims on front of label..."
              rows={3}
            />
          </FormField>

          <FormField label="Back Panel Claims">
            <TextArea
              value={form.backPanelClaims}
              onChange={(v) => set('backPanelClaims', v)}
              placeholder="Claims on back of label..."
              rows={3}
            />
          </FormField>
        </div>

        {/* Certifications */}
        <FormField label="Certifications" span={2}>
          <CheckboxGroup
            options={CERTIFICATION_OPTIONS}
            selected={form.certifications}
            onToggle={(item) => toggleArrayItem('certifications', item)}
          />
        </FormField>

        {/* Ingredients */}
        <SectionHeading title="Ingredients & Disclosures" />
        <div className="grid grid-cols-1 gap-y-5">
          <FormField label="INCI List">
            <TextArea
              value={form.inciList}
              onChange={(v) => set('inciList', v)}
              placeholder="Full INCI ingredients list..."
              rows={5}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <FormField label="Fragrance Disclosure">
              <SelectInput
                value={form.fragranceDisclosure}
                onChange={(v) => set('fragranceDisclosure', v)}
                options={FRAGRANCE_OPTIONS}
                placeholder="Select option"
              />
            </FormField>

            <FormField label="Allergen Disclosure">
              <TextInput
                value={form.allergenDisclosure}
                onChange={(v) => set('allergenDisclosure', v)}
                placeholder="Any allergen statements"
              />
            </FormField>
          </div>
        </div>

        {/* Retailer compliance */}
        <SectionHeading title="Retailer Compliance" />
        <FormField label="Target Retailers" span={2}>
          <CheckboxGroup
            options={TARGET_RETAILERS}
            selected={form.targetRetailers}
            onToggle={(item) => toggleArrayItem('targetRetailers', item)}
          />
        </FormField>
        <FormField label="Retailer Compliance Notes">
          <TextArea
            value={form.retailerComplianceNotes}
            onChange={(v) => set('retailerComplianceNotes', v)}
            placeholder="Specific retailer requirements..."
            rows={3}
          />
        </FormField>

        {/* OTC-specific fields */}
        {form.isOTC && (
          <>
            <SectionHeading title="OTC Drug Facts" subtitle="Required for Over-The-Counter products" />

            <div className="space-y-5">
              {/* Active ingredients dynamic rows */}
              <FormField label="Active Ingredients">
                <div className="space-y-3">
                  {form.activeIngredients.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <TextInput
                          value={row.name}
                          onChange={(v) => updateActiveIngredient(idx, 'name', v)}
                          placeholder="Ingredient name"
                        />
                        <TextInput
                          value={row.percentage}
                          onChange={(v) => updateActiveIngredient(idx, 'percentage', v)}
                          placeholder="Percentage (e.g. 2%)"
                        />
                      </div>
                      <button
                        onClick={() => removeActiveIngredient(idx)}
                        className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--bg-base)] transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addActiveIngredient}
                    className="flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:opacity-80 transition-opacity"
                  >
                    <Plus size={14} /> Add Active Ingredient
                  </button>
                </div>
              </FormField>

              <FormField label="Indications">
                <TextArea
                  value={form.indications}
                  onChange={(v) => set('indications', v)}
                  placeholder="Uses / indications..."
                  rows={3}
                />
              </FormField>

              <FormField label="Warnings">
                <TextArea
                  value={form.warnings}
                  onChange={(v) => set('warnings', v)}
                  placeholder="Drug facts warnings..."
                  rows={4}
                />
              </FormField>

              <FormField label="Directions">
                <TextArea
                  value={form.directions}
                  onChange={(v) => set('directions', v)}
                  placeholder="Directions for use..."
                  rows={3}
                />
              </FormField>

              <FormField label="Inactive Ingredients">
                <TextArea
                  value={form.inactiveIngredients}
                  onChange={(v) => set('inactiveIngredients', v)}
                  placeholder="Inactive ingredients list..."
                  rows={3}
                />
              </FormField>

              <FormField label="Questions? Phone">
                <TextInput
                  value={form.questionsPhone}
                  onChange={(v) => set('questionsPhone', v)}
                  placeholder="1-800-XXX-XXXX"
                />
              </FormField>
            </div>
          </>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────
  // STEP 4 — Team & Workflow
  // ─────────────────────────────────────────────────────────
  function renderStep4() {
    return (
      <div className="space-y-6">
        <SectionHeading title="Approval Chain" subtitle="Define the review and approval sequence" />

        {/* Approval chain table */}
        <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--bg-base)] border-b border-[var(--border-subtle)]">
                <th className="w-10 px-3 py-2.5" />
                <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                  #
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                  Role
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                  Assigned Name
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                  Required
                </th>
              </tr>
            </thead>
            <tbody>
              {form.approvalChain.map((row, idx) => (
                <tr
                  key={idx}
                  className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-base)] transition-colors"
                >
                  <td className="px-2 py-2">
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        onClick={() => moveApprovalRow(idx, -1)}
                        disabled={idx === 0}
                        className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-colors"
                        title="Move up"
                      >
                        <GripVertical size={12} />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[var(--text-tertiary)] tabular-nums font-mono text-xs">
                    {row.sequence}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-primary)] font-medium">
                    {row.role}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.assignedName}
                      onChange={(e) => updateApprovalRow(idx, 'assignedName', e.target.value)}
                      placeholder="Enter name..."
                      className="w-full px-2.5 py-1.5 text-sm rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => updateApprovalRow(idx, 'required', !row.required)}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        row.required
                          ? 'bg-[var(--accent)] border-[var(--accent)]'
                          : 'bg-transparent border-[var(--border-default)]'
                      }`}
                    >
                      {row.required && <Check size={12} className="text-white" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Reorder hint */}
        <p className="text-xs text-[var(--text-tertiary)]">
          Click the grip icon to reorder approval steps. Sequence numbers update automatically.
        </p>

        {/* Notifications */}
        <SectionHeading title="Notifications" subtitle="Configure email/system notifications" />
        <div className="space-y-4">
          <ToggleSwitch
            checked={form.notifications.onVersionSubmit}
            onChange={(v) =>
              set('notifications', { ...form.notifications, onVersionSubmit: v })
            }
            label="Notify when a new version is submitted for review"
          />

          <div className="flex items-center gap-4">
            <ToggleSwitch
              checked={form.notifications.reminderDays > 0}
              onChange={(v) =>
                set('notifications', {
                  ...form.notifications,
                  reminderDays: v ? 2 : 0,
                })
              }
              label="Send reminders for pending approvals"
            />
            {form.notifications.reminderDays > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-tertiary)]">every</span>
                <input
                  type="number"
                  value={form.notifications.reminderDays}
                  onChange={(e) =>
                    set('notifications', {
                      ...form.notifications,
                      reminderDays: parseInt(e.target.value) || 0,
                    })
                  }
                  min={1}
                  max={30}
                  className="w-16 px-2 py-1 text-sm text-center rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
                <span className="text-xs text-[var(--text-tertiary)]">days</span>
              </div>
            )}
          </div>

          <ToggleSwitch
            checked={form.notifications.onFinalApproval}
            onChange={(v) =>
              set('notifications', { ...form.notifications, onFinalApproval: v })
            }
            label="Notify on final approval"
          />

          <ToggleSwitch
            checked={form.notifications.notifyPrinter}
            onChange={(v) =>
              set('notifications', { ...form.notifications, notifyPrinter: v })
            }
            label="Notify printer when artwork is approved"
          />
        </div>

        {/* Submission due date */}
        <SectionHeading title="Schedule" />
        <FormField label="Submission Due Date">
          <input
            type="date"
            value={form.submissionDueDate}
            onChange={(e) => set('submissionDueDate', e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
          />
        </FormField>
      </div>
    )
  }
}

// ─────────────────────────────────────────────────────────────
// Shared sub-components (internal)
// ─────────────────────────────────────────────────────────────

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="pb-1">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {subtitle && (
        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{subtitle}</p>
      )}
    </div>
  )
}

function FormField({
  label,
  required,
  span,
  children,
}: {
  label: string
  required?: boolean
  span?: number
  children: React.ReactNode
}) {
  return (
    <label className={`block ${span === 2 ? 'col-span-2' : ''}`}>
      <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
        {label}
        {required && <span className="text-[var(--danger)] ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
    />
  )
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
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
      className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors resize-y"
    />
  )
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  placeholder?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors appearance-none"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        paddingRight: '36px',
      }}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  )
}

function CheckboxGroup({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[]
  selected: string[]
  onToggle: (item: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const checked = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              checked
                ? 'bg-[var(--accent)] bg-opacity-10 border-[var(--accent)] text-[var(--accent)]'
                : 'bg-[var(--bg-base)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)]'
            }`}
          >
            {checked && <Check size={10} className="inline mr-1.5 -mt-0.5" />}
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 group"
    >
      <div
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-default)]'
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
      <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
        {label}
      </span>
    </button>
  )
}

export default NewArtworkModal
