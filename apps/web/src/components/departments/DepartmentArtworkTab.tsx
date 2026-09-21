import { AlertCircle, Loader2, Palette, RefreshCw } from 'lucide-react'
import { useDepartments } from '@/hooks/useData'
import { MarketingArtworkTab } from '@/components/marketing/artwork'

export function DepartmentArtworkTab() {
  const {
    data: departments,
    isLoading,
    isError,
    refetch,
  } = useDepartments()

  const marketingDepartment = Array.isArray(departments)
    ? departments.find(
        (department: any) =>
          typeof department.name === 'string' &&
          department.name.trim().toLowerCase() === 'marketing',
      )
    : null

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
        <Loader2 size={15} className="animate-spin" />
        Loading artwork…
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--danger)]/30 bg-[var(--danger-light)] py-12 text-center">
        <AlertCircle size={24} className="mx-auto text-[var(--danger)] mb-2" />
        <p className="text-sm font-medium text-[var(--text-primary)]">
          Could not find the Marketing artwork workspace.
        </p>
        <button
          onClick={() => refetch()}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    )
  }

  if (!marketingDepartment) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-default)] py-12 text-center">
        <Palette size={24} className="mx-auto text-[var(--text-tertiary)] mb-2" />
        <p className="text-sm text-[var(--text-secondary)]">
          Marketing department not found.
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          Contact an administrator to set up the canonical Artwork workspace.
        </p>
      </div>
    )
  }

  return (
    <MarketingArtworkTab
      departmentId={marketingDepartment.id}
      departmentName={marketingDepartment.name}
    />
  )
}