import type { ActiveForm } from '@/stores/appStore'
import { BriefFormPage } from '@/components/briefs/BriefFormPage'
import { TaskDetailForm } from '@/components/tasks/TaskDetailForm'

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
