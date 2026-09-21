import { useState, useCallback, useMemo } from 'react'
import {
  ArrowLeft,
  ExternalLink,
  Download,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { StatusFormCard } from '@/components/shared/StatusFormCard'
import { DocumentPanel } from '@/components/shared/DocumentPanel'
import { SendEmailButton } from '@/components/shared/SendEmailButton'
import { useUserStore } from '@/stores/userStore'
import type { ArtworkModuleItem, ArtworkTrackerData, DocFile, SharePointLink } from './types'

interface ArtworkDetailProps {
  item: ArtworkModuleItem
  departmentId: string
  moduleId: string
  onBack: () => void
  onUpdate: (patch: Partial<ArtworkTrackerData>) => Promise<void>
  onDelete: () => Promise<void>
  saving: boolean
  deleting: boolean
}

export function ArtworkDetail({
  item,
  departmentId,
  moduleId,
  onBack,
  onUpdate,
  onDelete,
  saving,
  deleting,
}: ArtworkDetailProps) {
  const data = item.data as ArtworkTrackerData
  const currentUser = useUserStore((s) => s.currentUser)

  const [localStatusForm, setLocalStatusForm] = useState(data.statusForm)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const files = useMemo(() => data.files ?? [], [data.files])
  const sharePointLinks = useMemo(() => data.sharePointLinks ?? [], [data.sharePointLinks])

  const handleStatusChange = useCallback(
    (patch: Partial<typeof localStatusForm>) => {
      setLocalStatusForm((prev) => ({ ...prev, ...patch }))
      setStatusError(null)
    },
    []
  )

  const handleStatusSave = useCallback(async () => {
    try {
      await onUpdate({
        statusForm: {
          ...localStatusForm,
          lastUpdated: new Date().toISOString(),
        },
      })
      setStatusError(null)
    } catch (err: any) {
      setStatusError(err?.message || 'Failed to save status')
    }
  }, [localStatusForm, onUpdate])

  const handleUploadFiles = useCallback(
    async (uploadedFiles: File[]) => {
      const userName = currentUser?.name ?? 'Unknown'
      const newFiles: DocFile[] = uploadedFiles.map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type || 'file',
        uploadedBy: userName,
        uploadedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        url: URL.createObjectURL(f),
        source: 'local',
      }))

      await onUpdate({
        files: [...files, ...newFiles],
      })
    },
    [files, onUpdate, currentUser]
  )

  const handleRemoveFile = useCallback(
    async (index: number) => {
      const updated = files.filter((_, i) => i !== index)
      await onUpdate({ files: updated })
    },
    [files, onUpdate]
  )

  const handleAddSharePointLink = useCallback(
    async (link: { displayName: string; url: string }) => {
      const userName = currentUser?.name ?? 'Unknown'
      const newLink: SharePointLink = {
        ...link,
        addedBy: userName,
        addedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      }
      await onUpdate({
        sharePointLinks: [...sharePointLinks, newLink],
      })
    },
    [sharePointLinks, onUpdate, currentUser]
  )

  const handleRemoveSharePointLink = useCallback(
    async (index: number) => {
      const updated = sharePointLinks.filter((_, i) => i !== index)
      await onUpdate({ sharePointLinks: updated })
    },
    [sharePointLinks, onUpdate]
  )

  const handleDelete = useCallback(async () => {
    try {
      await onDelete()
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete')
    }
  }, [onDelete])

  const defaultEmailSubject = `Artwork Update: ${data.title}`
  const defaultEmailHtml = `<p>Hello,</p><p>Here's an update on the artwork: <strong>${data.title}</strong></p><p>Status: ${data.statusForm?.needsRevisions ? 'Needs revisions' : data.statusForm?.finalApprovalVersion ? `Final ${data.statusForm.finalApprovalVersion}` : 'In progress'}</p><p>${data.statusForm?.nextAction ? `Next action: ${data.statusForm.nextAction}` : ''}</p><p>Thanks!</p>`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-xs text-[var(--text-tertiary)]">Artwork</p>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {data.title || 'Untitled'}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-white bg-[var(--danger)] hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Confirm delete
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)] transition-colors"
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
        </div>
      </div>

      {deleteError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--danger-light)] border border-[var(--danger)]">
          <AlertCircle size={14} className="text-[var(--danger)]" />
          <span className="text-[12px] text-[var(--danger)]">{deleteError}</span>
        </div>
      )}

      {/* Intake Link */}
      <div className="data-cell">
        <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-2">
          Intake
        </p>
        {data.intake?.kind === 'sharepoint' ? (
          <a
            href={data.intake.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium text-[#0078D4] bg-[#0078D4]/8 hover:bg-[#0078D4]/15 transition-colors"
          >
            <ExternalLink size={14} />
            Open in SharePoint
          </a>
        ) : data.intake?.kind === 'upload' ? (
          <a
            href={data.intake.url}
            download={data.intake.filename}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--accent)] bg-[var(--accent-subtle)] hover:bg-[var(--accent)]/15 transition-colors"
          >
            <Download size={14} />
            Download {data.intake.filename}
          </a>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">No intake file</p>
        )}
      </div>

      {/* Status Form */}
      <StatusFormCard
        lastUpdated={localStatusForm.lastUpdated}
        needsRevisions={localStatusForm.needsRevisions}
        needsRevisionsNotes={localStatusForm.needsRevisionsNotes}
        revisionsAssignees={localStatusForm.revisionsAssignees}
        approvalsAssignees={localStatusForm.approvalsAssignees}
        updatesAssignees={localStatusForm.updatesAssignees}
        nextAction={localStatusForm.nextAction}
        finalApprovalVersion={localStatusForm.finalApprovalVersion}
        onChange={handleStatusChange}
        onSave={handleStatusSave}
        saving={saving}
        error={statusError}
      />

      {/* Document Panel */}
      <div className="data-cell">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">
          Files & SharePoint Links
        </h3>
        <DocumentPanel
          files={files}
          sharepointLinks={sharePointLinks}
          onUploadFiles={handleUploadFiles}
          onRemoveFile={handleRemoveFile}
          onAddSharePointLink={handleAddSharePointLink}
          onRemoveSharePointLink={handleRemoveSharePointLink}
        />
      </div>

      {/* Send Email */}
      <div className="flex justify-end">
        <SendEmailButton
          itemId={item.id}
          defaultSubject={defaultEmailSubject}
          defaultHtml={defaultEmailHtml}
        />
      </div>
    </div>
  )
}
