import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Save, Loader2 } from 'lucide-react'
import { FullPageForm } from '@/components/shared/FullPageForm'
import { useAppStore, type ActiveForm } from '@/stores/appStore'
import { api } from '@/lib/api'
import {
  Step1,
  Step2,
  Step3,
  Step4,
  Step5,
  Step6,
  STEPS,
  validateStep,
  EMPTY_FORM,
  type BriefFormData,
} from './NewBriefModal'

interface BriefFormContext {
  /** Module id required to create a new brief item. */
  moduleId?: string | null
  /** Department id, used to invalidate the cached department detail. */
  departmentId?: string | null
  /** Initial values for edit / import flows. */
  initialData?: BriefFormData | null
}

/**
 * Full-page New / Edit Brief form. Registered in the form registry under the
 * `brief` form type. Reads its context (module id, department id, initial data)
 * from the page-routing store and persists directly, invalidating the cached
 * department detail so the originating list refreshes on return.
 */
export function BriefFormPage({ form: activeForm }: { form: ActiveForm }) {
  const closeForm = useAppStore((s) => s.closeForm)
  const qc = useQueryClient()

  const ctx = (activeForm.context ?? {}) as BriefFormContext
  const isEdit = activeForm.mode === 'edit'

  const [step, setStep] = useState(0)
  const [form, setForm] = useState<BriefFormData>({ ...EMPTY_FORM, ...(ctx.initialData || {}) })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState('')
  const oneDriveConnected = false

  const isLastStep = step === STEPS.length - 1

  const goNext = () => {
    const stepErrors = validateStep(step, form)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }
    setErrors({})
    if (step < STEPS.length - 1) setStep(step + 1)
  }

  const goBackStep = () => {
    if (step > 0) setStep(step - 1)
  }

  const persist = async (isDraft: boolean) => {
    const stepErrors = validateStep(step, form)
    if (!isDraft && Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }
    setSubmitting(true)
    setSaveError('')
    try {
      const briefData = {
        ...form,
        briefStatus: isDraft ? 'Draft' : form.briefStatus || 'Brief Submitted',
        phase: form.phase || 1,
      }
      if (isEdit && activeForm.recordId && ctx.moduleId) {
        await api.patch(`/departments/_/modules/${ctx.moduleId}/items/${activeForm.recordId}`, {
          data: briefData,
          status: briefData.briefStatus,
        })
      } else if (ctx.moduleId) {
        await api.post(`/departments/_/modules/${ctx.moduleId}/items`, {
          data: briefData,
          status: briefData.briefStatus,
        })
      } else {
        throw new Error('Missing module — cannot save brief')
      }
      if (ctx.departmentId) {
        await qc.invalidateQueries({ queryKey: ['department', ctx.departmentId] })
      }
      closeForm()
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || err?.message || 'Failed to save brief')
    } finally {
      setSubmitting(false)
    }
  }

  const stepDots = (
    <div className="flex gap-1.5 w-[180px]">
      {STEPS.map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => { if (i < step) setStep(i) }}
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
        <button
          onClick={() => persist(true)}
          disabled={submitting}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[14px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all disabled:opacity-50"
        >
          <Save size={15} /> Save Draft
        </button>
        {isLastStep ? (
          <button
            onClick={() => persist(false)}
            disabled={submitting}
            className="flex items-center gap-1.5 btn-primary px-5 py-2.5 rounded-lg text-[14px] disabled:opacity-50"
          >
            {submitting ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : isEdit ? 'Save Changes' : 'Submit Brief'}
          </button>
        ) : (
          <button onClick={goNext} className="flex items-center gap-1.5 btn-primary px-5 py-2.5 rounded-lg text-[14px]">
            Next <ChevronRight size={16} />
          </button>
        )}
      </div>
    </>
  )

  return (
    <FullPageForm
      title={isEdit ? 'Edit Project Initiation Brief' : 'New Project Initiation Brief'}
      subtitle={`Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`}
      onBack={closeForm}
      backLabel="Back to Briefs"
      headerExtra={stepDots}
      footer={footer}
    >
      {step === 0 && <Step1 form={form} setForm={setForm} errors={errors} />}
      {step === 1 && <Step2 form={form} setForm={setForm} errors={errors} />}
      {step === 2 && <Step3 form={form} setForm={setForm} errors={errors} />}
      {step === 3 && <Step4 form={form} setForm={setForm} errors={errors} />}
      {step === 4 && <Step5 form={form} setForm={setForm} errors={errors} />}
      {step === 5 && <Step6 form={form} setForm={setForm} errors={errors} oneDriveConnected={oneDriveConnected} />}
    </FullPageForm>
  )
}
