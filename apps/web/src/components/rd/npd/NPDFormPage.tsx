import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Rocket, Loader2 } from 'lucide-react'
import { FullPageForm } from '@/components/shared/FullPageForm'
import { useAppStore, type ActiveForm } from '@/stores/appStore'
import { api } from '@/lib/api'
import { createDefaultTasks } from '@/components/rd/npd/npdChecklist'
import {
  StepProjectSetup,
  StepBusinessCommercial,
  StepTeamAssignment,
  StepStageDates,
  STEPS,
  validateStep,
  EMPTY_NPD_FORM,
  type NPDFormData,
  type IdOption,
} from './NewNPDProjectModal'

interface NPDFormContext {
  /** Module id required to create a new NPD project item. */
  moduleId?: string | null
  /** Department id, used to auto-create the module and invalidate the cached department detail. */
  departmentId?: string | null
  /** Initial values for edit flows. */
  initialData?: NPDFormData | null
  /** Brief items used to build the linked-brief options. */
  briefItems?: any[]
  /** Formulation items used to build the linked-formulation options. */
  formulationItems?: any[]
  /** SKU Pipeline items used to build the linked-SKU options. */
  skuItems?: any[]
}

/**
 * Full-page New / Edit NPD Project form. Registered in the form registry under
 * the `npd` form type. Reads its context (module id, department id, initial
 * data, brief/formulation items) from the page-routing store and persists
 * directly, invalidating the cached department detail so the originating list
 * refreshes on return. On create, generates the 34 NPD checklist tasks and
 * auto-creates the NPD_PIPELINE module when missing.
 */
export function NPDFormPage({ form: activeForm }: { form: ActiveForm }) {
  const closeForm = useAppStore((s) => s.closeForm)
  const qc = useQueryClient()

  const ctx = (activeForm.context ?? {}) as NPDFormContext
  const isEdit = activeForm.mode === 'edit'

  const [step, setStep] = useState(0)
  const [form, setForm] = useState<NPDFormData>({ ...EMPTY_NPD_FORM, ...(ctx.initialData || {}) })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState('')

  const briefOptions: IdOption[] = (ctx.briefItems || []).map((item: any) => {
    const d = item.data || item
    return { id: item.id, label: d.projectName || d.name || 'Untitled Brief' }
  })
  const formulationOptions: IdOption[] = (ctx.formulationItems || []).map((item: any) => {
    const d = item.data || item
    return { id: item.id, label: [d.product, d.ver].filter(Boolean).join(' · ') || 'Untitled Formulation' }
  })
  const skuOptions: IdOption[] = (ctx.skuItems || []).map((item: any) => {
    const d = item.data || item
    return { id: item.id, label: [d.name, d.sku].filter(Boolean).join(' · ') || 'Untitled SKU' }
  })

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
    if (step > 0) {
      setErrors({})
      setStep(step - 1)
    }
  }

  const persist = async () => {
    const stepErrors = validateStep(step, form)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }
    setSubmitting(true)
    setSaveError('')
    try {
      if (isEdit && activeForm.recordId && ctx.moduleId) {
        await api.patch(`/departments/_/modules/${ctx.moduleId}/items/${activeForm.recordId}`, {
          data: form,
        })
      } else {
        // Auto-create NPD_PIPELINE module if it doesn't exist yet
        let targetModuleId = ctx.moduleId
        if (!targetModuleId && ctx.departmentId) {
          const res = await api.post(`/departments/${ctx.departmentId}/modules`, {
            name: 'NPD Pipeline',
            type: 'NPD_PIPELINE',
            sortOrder: 4,
          })
          targetModuleId = res.data.id
        }
        if (!targetModuleId) {
          throw new Error('Missing module — cannot save NPD project')
        }

        // Generate the 34 tasks from the master checklist
        const tasks = createDefaultTasks(
          form.teamAssignments.map((t) => ({ role: t.role, assignedName: t.assignedName })),
          {
            stage0Target: form.stageDates.stage0Target,
            stage1Target: form.stageDates.stage1Target,
            gate12Target: form.stageDates.gate12Target,
            stage2Target: form.stageDates.stage2Target,
            gate23Target: form.stageDates.gate23Target,
            stage3Target: form.stageDates.stage3Target,
            stage4Target: form.stageDates.stage4Target,
          },
        )

        // Add IDs to tasks
        const tasksWithIds = tasks.map((t, i) => ({
          ...t,
          id: `task-${Date.now()}-${i}`,
        }))

        const projectData = {
          ...form,
          tasks: tasksWithIds,
          gateApprovals: [],
          status: 'Active',
          activityLog: [{
            user: 'System',
            action: 'Project created with 34 tasks generated',
            timestamp: new Date().toISOString(),
          }],
        }

        await api.post(`/departments/_/modules/${targetModuleId}/items`, {
          data: projectData,
          status: 'Active',
        })
      }

      if (ctx.departmentId) {
        await qc.invalidateQueries({ queryKey: ['department', ctx.departmentId] })
      }
      closeForm()
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || err?.message || 'Failed to save NPD project')
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
          onClick={() => { if (i < step) { setErrors({}); setStep(i) } }}
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
        <ChevronLeft size={16} /> Back
      </button>

      <div className="flex items-center gap-3">
        {saveError && <span className="text-[12px] text-[var(--danger)]">{saveError}</span>}
        {isLastStep ? (
          <button
            onClick={persist}
            disabled={submitting}
            className="flex items-center gap-2 btn-primary px-5 py-2.5 rounded-lg text-[14px] disabled:opacity-50"
          >
            {submitting ? (
              <><Loader2 size={14} className="animate-spin" /> {isEdit ? 'Saving...' : 'Launching...'}</>
            ) : (
              <><Rocket size={16} /> {isEdit ? 'Save Changes' : 'Launch Project'}</>
            )}
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
      title={isEdit ? 'Edit NPD Project' : 'New NPD Project'}
      subtitle={`Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`}
      onBack={closeForm}
      backLabel="Back to NPD Pipeline"
      headerExtra={stepDots}
      footer={footer}
    >
      {step === 0 && (
        <StepProjectSetup
          form={form}
          setForm={setForm}
          errors={errors}
          briefOptions={briefOptions}
          formulationOptions={formulationOptions}
          skuOptions={skuOptions}
        />
      )}
      {step === 1 && <StepBusinessCommercial form={form} setForm={setForm} errors={errors} />}
      {step === 2 && <StepTeamAssignment form={form} setForm={setForm} errors={errors} />}
      {step === 3 && <StepStageDates form={form} setForm={setForm} errors={errors} />}
    </FullPageForm>
  )
}
