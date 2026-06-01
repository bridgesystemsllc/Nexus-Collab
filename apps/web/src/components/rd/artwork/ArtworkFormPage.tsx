import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { FullPageForm } from '@/components/shared/FullPageForm'
import { useAppStore, type ActiveForm } from '@/stores/appStore'
import { api } from '@/lib/api'
import {
  ArtworkStep1,
  ArtworkStep2,
  ArtworkStep3,
  ArtworkStep4,
  ARTWORK_STEPS,
  canGoNext,
} from './NewArtworkModal'
import {
  DEFAULT_COMPLIANCE_ITEMS,
  generateRetailerComplianceItems,
  EMPTY_ARTWORK_FORM,
  type ArtworkFormData,
} from './artworkData'

interface ArtworkFormContext {
  /** Module id required to create / edit an artwork project item. */
  moduleId?: string | null
  /** Department id, used to invalidate the cached department detail. */
  departmentId?: string | null
  /** Initial values for edit flows. */
  initialData?: any
  /** Optional cross-reference briefs (unused for now, accepted for parity). */
  briefs?: any[]
}

/**
 * Full-page New / Edit Artwork Project form. Registered in the form registry
 * under the `artwork` form type. Reads its context (module id, department id,
 * initial data) from the page-routing store and persists directly, invalidating
 * the cached department detail so the originating list refreshes on return.
 */
export function ArtworkFormPage({ form: activeForm }: { form: ActiveForm }) {
  const closeForm = useAppStore((s) => s.closeForm)
  const qc = useQueryClient()

  const ctx = (activeForm.context ?? {}) as ArtworkFormContext
  const isEdit = activeForm.mode === 'edit'

  const [step, setStep] = useState(0)
  const [form, setForm] = useState<ArtworkFormData>({
    ...(JSON.parse(JSON.stringify(EMPTY_ARTWORK_FORM)) as ArtworkFormData),
    ...(ctx.initialData || {}),
  })
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState('')

  const isLastStep = step === ARTWORK_STEPS.length - 1

  const goNext = () => {
    if (!canGoNext(step, form)) return
    if (step < ARTWORK_STEPS.length - 1) setStep(step + 1)
  }

  const goBackStep = () => {
    if (step > 0) setStep(step - 1)
  }

  const persist = async () => {
    if (!canGoNext(step, form)) return
    if (!ctx.moduleId) {
      setSaveError('Missing module — cannot save artwork project')
      return
    }
    setSubmitting(true)
    setSaveError('')
    try {
      if (isEdit && activeForm.recordId) {
        const projectData = { ...form }
        await api.patch(
          `/departments/_/modules/${ctx.moduleId}/items/${activeForm.recordId}`,
          { data: projectData, status: (form as any).status || 'Draft' },
        )
      } else {
        const data: any = form
        const staticItems = DEFAULT_COMPLIANCE_ITEMS.map((item, i) => ({
          ...item,
          id: `comp-${Date.now()}-${i}`,
        }))
        const retailerItems = generateRetailerComplianceItems(data.targetRetailers || []).map(
          (item, i) => ({
            ...item,
            id: `comp-ret-${Date.now()}-${i}`,
          }),
        )

        const projectData: any = {
          ...data,
          currentVersion: 'v1.0',
          status: 'Draft',
          versions: [],
          submissions: [],
          complianceChecklist: [...staticItems, ...retailerItems],
          activityLog: [
            {
              user: 'System',
              action: 'Artwork project created',
              timestamp: new Date().toISOString(),
            },
          ],
          createdBy: 'You',
          createdAt: new Date().toISOString(),
        }

        await api.post(`/departments/_/modules/${ctx.moduleId}/items`, {
          data: projectData,
          status: 'Draft',
        })
      }

      if (ctx.departmentId) {
        await qc.invalidateQueries({ queryKey: ['department', ctx.departmentId] })
      }
      closeForm()
    } catch (err: any) {
      setSaveError(
        err?.response?.data?.error || err?.message || 'Failed to save artwork project',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const stepDots = (
    <div className="flex gap-1.5 w-[180px]">
      {ARTWORK_STEPS.map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            if (i < step) setStep(i)
          }}
          className="h-1.5 flex-1 rounded-full transition-colors"
          style={{ background: i <= step ? 'var(--accent)' : 'var(--border-default)' }}
        />
      ))}
    </div>
  )

  const footer = (
    <>
      <button
        onClick={goBackStep}
        disabled={step === 0}
        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[14px] font-medium transition-all ${
          step === 0
            ? 'text-[var(--text-tertiary)] cursor-not-allowed'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)]'
        }`}
      >
        <ChevronLeft size={16} /> Previous
      </button>

      <div className="flex items-center gap-3">
        {saveError && <span className="text-[12px] text-[var(--danger)]">{saveError}</span>}
        {isLastStep ? (
          <button
            onClick={persist}
            disabled={submitting || !canGoNext(step, form)}
            className="flex items-center gap-1.5 btn-primary px-5 py-2.5 rounded-lg text-[14px] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Saving...
              </>
            ) : isEdit ? (
              'Save Changes'
            ) : (
              'Create Artwork Project'
            )}
          </button>
        ) : (
          <button
            onClick={goNext}
            disabled={!canGoNext(step, form)}
            className="flex items-center gap-1.5 btn-primary px-5 py-2.5 rounded-lg text-[14px] disabled:opacity-50"
          >
            Next <ChevronRight size={16} />
          </button>
        )}
      </div>
    </>
  )

  return (
    <FullPageForm
      title={isEdit ? 'Edit Artwork Project' : 'New Artwork Project'}
      subtitle={`Step ${step + 1} of ${ARTWORK_STEPS.length} — ${ARTWORK_STEPS[step].label}`}
      onBack={closeForm}
      backLabel="Back to Artwork"
      headerExtra={stepDots}
      footer={footer}
      maxWidth={960}
    >
      {step === 0 && <ArtworkStep1 form={form} setForm={setForm} />}
      {step === 1 && <ArtworkStep2 form={form} setForm={setForm} />}
      {step === 2 && <ArtworkStep3 form={form} setForm={setForm} />}
      {step === 3 && <ArtworkStep4 form={form} setForm={setForm} />}
    </FullPageForm>
  )
}
