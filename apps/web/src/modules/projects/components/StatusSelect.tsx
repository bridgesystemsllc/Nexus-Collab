import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useSetProjectStatus } from '../hooks/useProjects'
import { STATUS_LABELS, type ProjectStatus } from '../types'

const STATUS_OPTIONS: ProjectStatus[] = [
  'DRAFT', 'PROPOSED', 'APPROVED', 'ACTIVE', 'ON_HOLD',
  'AT_RISK', 'BLOCKED', 'COMPLETED', 'CANCELLED', 'ARCHIVED',
]

interface Props {
  projectId: string
  currentStatus: ProjectStatus
  canEdit: boolean
}

export function StatusSelect({ projectId, currentStatus, canEdit }: Props) {
  const setStatus = useSetProjectStatus(projectId)
  const [error, setError] = useState<string | null>(null)

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as ProjectStatus
    if (next === currentStatus) return

    setError(null)
    try {
      await setStatus.mutateAsync({ status: next })
    } catch (err: any) {
      setError(err?.message ?? 'Could not update status')
    }
  }

  if (!canEdit) {
    return (
      <span className="badge badge-info">
        {STATUS_LABELS[currentStatus] ?? currentStatus}
      </span>
    )
  }

  return (
    <div className="inline-flex flex-col items-start">
      <div className="relative inline-flex items-center">
        <select
          value={currentStatus}
          onChange={handleChange}
          disabled={setStatus.isPending}
          className="appearance-none badge badge-info cursor-pointer pr-6
            focus:outline-none focus:ring-1 focus:ring-[var(--accent-secondary)] focus:ring-offset-1
            disabled:cursor-wait disabled:opacity-70
            hover:ring-1 hover:ring-[var(--accent-secondary)]/40"
          aria-label="Change project status"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-1.5 flex items-center">
          {setStatus.isPending ? (
            <Loader2 size={10} className="animate-spin text-[var(--info)]" />
          ) : (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--info)]"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-[11px] mt-1" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
