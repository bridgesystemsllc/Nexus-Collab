import { ArrowLeft, LayoutDashboard, Package } from 'lucide-react'
import type { ActiveForm } from '@/stores/appStore'
import { useAppStore } from '@/stores/appStore'
import { BriefFormPage } from '@/components/briefs/BriefFormPage'
import { TaskDetailForm } from '@/components/tasks/TaskDetailForm'
import { CMFormPage } from '@/components/rd/CMFormPage'
import { TransferFormPage } from '@/components/rd/TransferFormPage'
import { FormulationFormPage } from '@/components/rd/FormulationFormPage'
import { NPDFormPage } from '@/components/rd/npd/NPDFormPage'
import { ArtworkFormPage } from '@/components/rd/artwork/ArtworkFormPage'
import { ComponentFormPage } from '@/components/rd/components/ComponentFormPage'
import { BOMFormPage } from '@/components/ops/bom/BOMFormPage'
import {
  InventoryFormPage,
  ProductionFormPage,
  BrandTransitionFormPage,
} from '@/components/ops/forms/OpsForms'

function RemovedSkuFormPage({ form: _form }: { form: ActiveForm }) {
  const closeForm = useAppStore((s) => s.closeForm)
  const setPage = useAppStore((s) => s.setPage)

  const goToProductCatalog = () => {
    closeForm()
    setPage('product-catalog')
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center mb-6">
        <Package size={32} className="text-[var(--text-tertiary)]" />
      </div>
      <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
        SKU Pipeline has been removed
      </h2>
      <p className="text-sm text-[var(--text-secondary)] max-w-md text-center mb-8">
        This Operations tab is no longer part of Nexus. SKU records are still in the workspace.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={closeForm}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Operations
        </button>
        <button
          onClick={goToProductCatalog}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
        >
          <LayoutDashboard size={16} />
          Open Product Catalog
        </button>
      </div>
    </div>
  )
}

/**
 * Registry of full-page forms.
 *
 * To add a new full-page create/edit flow:
 *   1. Build a form component that takes `{ form: ActiveForm }`, lays itself
 *      out with the shared `<FullPageForm>` shell, and persists on save.
 *   2. Register it here under a unique `formType` key.
 *   3. From any list/row, call `openForm({ formType, mode, recordId?, context? })`.
 *      The layout renders the registered component in place of the page; the
 *      form calls `closeForm()` (e.g. via the Back button) to return.
 */
export const formRegistry: Record<string, (props: { form: ActiveForm }) => JSX.Element> = {
  brief: BriefFormPage,
  task: TaskDetailForm,
  cm: CMFormPage,
  transfer: TransferFormPage,
  formulation: FormulationFormPage,
  npd: NPDFormPage,
  artwork: ArtworkFormPage,
  component: ComponentFormPage,
  bom: BOMFormPage,
  opsSku: RemovedSkuFormPage,
  opsInventory: InventoryFormPage,
  opsProduction: ProductionFormPage,
  opsBrand: BrandTransitionFormPage,
}

export function FullPageFormHost({ form }: { form: ActiveForm }) {
  const Component = formRegistry[form.formType]
  if (!Component) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-tertiary)]">
        <p className="text-lg">Unknown form: {form.formType}</p>
      </div>
    )
  }
  return <Component form={form} />
}
