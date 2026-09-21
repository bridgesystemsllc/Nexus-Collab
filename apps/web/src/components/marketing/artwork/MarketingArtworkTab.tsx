import { useState, useMemo } from 'react'
import {
  Plus,
  Loader2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Download,
  ArrowLeft,
  Palette,
  Clock,
  Users,
} from 'lucide-react'
import {
  useDepartment,
  useModuleItems,
  useCreateModuleItem,
  useUpdateModuleItem,
  useDeleteModuleItem,
} from '@/hooks/useData'
import { NewArtworkModal } from './NewArtworkModal'
import { ArtworkDetail } from './ArtworkDetail'
import type { ArtworkModuleItem, ArtworkTrackerData } from './types'

interface MarketingArtworkTabProps {
  departmentId: string
  departmentName: string
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getStatusBadge(data: ArtworkTrackerData): { label: string; color: string } {
  if (data.statusForm?.finalApprovalVersion) {
    return { label: `final ${data.statusForm.finalApprovalVersion}`, color: 'var(--success)' }
  }
  if (data.statusForm?.needsRevisions) {
    return { label: 'needs rev', color: 'var(--warning)' }
  }
  return { label: 'in progress', color: 'var(--accent)' }
}

function getIntakeLabel(data: ArtworkTrackerData): string {
  return data.intake?.kind === 'sharepoint' ? 'SharePoint' : 'Upload'
}

export function MarketingArtworkTab({ departmentId, departmentName }: MarketingArtworkTabProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const {
    data: deptDetail,
    isLoading: deptLoading,
    isError: deptError,
    refetch: refetchDepartment,
  } = useDepartment(departmentId)

  const artworkModule = useMemo(() => {
    const modules = (deptDetail?.modules as any[]) ?? []
    return modules.find((m) => m.type === 'ARTWORK')
  }, [deptDetail])

  const moduleId = artworkModule?.id ?? ''

  const {
    data: items,
    isLoading: itemsLoading,
    error: itemsError,
    refetch: refetchItems,
  } = useModuleItems(departmentId, moduleId)

  const createItem = useCreateModuleItem()
  const updateItem = useUpdateModuleItem()
  const deleteItem = useDeleteModuleItem()

  const artworkItems = useMemo(() => {
    return (items ?? []) as unknown as ArtworkModuleItem[]
  }, [items])

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null
    return artworkItems.find((i) => i.id === selectedItemId) ?? null
  }, [artworkItems, selectedItemId])

  const isLoading = deptLoading || (!!moduleId && itemsLoading)
  const hasError = deptError || !!itemsError

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
        <Loader2 size={15} className="animate-spin" />
        Loading artwork…
      </div>
    )
  }

  if (hasError) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--danger)]/30 bg-[var(--danger-light)] py-12 text-center">
        <AlertCircle size={24} className="mx-auto text-[var(--danger)] mb-2" />
        <p className="text-sm font-medium text-[var(--text-primary)]">Could not load artwork. Try again.</p>
        <button
          onClick={() => {
            if (deptError) void refetchDepartment()
            if (itemsError) void refetchItems()
          }}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    )
  }

  if (!artworkModule) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-default)] py-12 text-center">
        <Palette size={24} className="mx-auto text-[var(--text-tertiary)] mb-2" />
        <p className="text-sm text-[var(--text-secondary)]">
          Artwork module not found for {departmentName}.
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          Contact an administrator to set up the Artwork module.
        </p>
      </div>
    )
  }

  if (selectedItem) {
    return (
      <ArtworkDetail
        item={selectedItem}
        departmentId={departmentId}
        moduleId={moduleId}
        onBack={() => setSelectedItemId(null)}
        onUpdate={async (patch) => {
          await updateItem.mutateAsync({
            departmentId,
            moduleId,
            itemId: selectedItem.id,
            data: { ...selectedItem.data, ...patch } as any,
          })
        }}
        onDelete={async () => {
          await deleteItem.mutateAsync({ departmentId, moduleId, itemId: selectedItem.id })
          setSelectedItemId(null)
        }}
        saving={updateItem.isPending}
        deleting={deleteItem.isPending}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Artwork</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors"
        >
          <Plus size={15} />
          New Artwork
        </button>
      </div>

      {/* List or Empty State */}
      {artworkItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] py-16 text-center">
          <Palette size={28} className="mx-auto text-[var(--text-tertiary)] mb-3" />
          <p className="text-sm font-medium text-[var(--text-secondary)]">No artwork entries yet.</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Upload a file or paste a SharePoint link to start.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {artworkItems.map((item) => {
            const data = item.data as ArtworkTrackerData
            const status = getStatusBadge(data)
            const intakeLabel = getIntakeLabel(data)
            const assigneeCount =
              (data.statusForm?.revisionsAssignees?.length ?? 0) +
              (data.statusForm?.approvalsAssignees?.length ?? 0) +
              (data.statusForm?.updatesAssignees?.length ?? 0)

            return (
              <button
                key={item.id}
                onClick={() => setSelectedItemId(item.id)}
                className="w-full text-left data-cell hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {data.title || 'Untitled'}
                      </p>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide"
                        style={{
                          background: `${status.color}15`,
                          color: status.color,
                        }}
                      >
                        {status.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-tertiary)]">
                      <span className="flex items-center gap-1">
                        {data.intake?.kind === 'sharepoint' ? (
                          <ExternalLink size={10} />
                        ) : (
                          <Download size={10} />
                        )}
                        {intakeLabel}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        Updated {formatDate(item.updatedAt)}
                      </span>
                      {assigneeCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Users size={10} />
                          {assigneeCount} assignee{assigneeCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Create Modal */}
      <NewArtworkModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        departmentId={departmentId}
        moduleId={moduleId}
        onCreate={async (data) => {
          await createItem.mutateAsync({
            departmentId,
            moduleId,
            data: data as any,
          })
          setShowCreateModal(false)
        }}
        creating={createItem.isPending}
      />
    </div>
  )
}
