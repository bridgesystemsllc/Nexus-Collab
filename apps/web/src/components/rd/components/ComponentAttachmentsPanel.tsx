import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, Download, Clock, AlertCircle, Loader2, CheckCircle } from 'lucide-react'
import {
  useComponentAttachments,
  useCreateComponentAttachment,
  fetchComponentAttachmentDownloadUrl,
  type ComponentAttachmentKind,
  type ComponentAttachment,
} from '@/hooks/useComponentAttachments'

interface Props {
  componentId: string
  kind: ComponentAttachmentKind
  label: string
}

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function ComponentAttachmentsPanel({ componentId, kind, label }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: allAttachments = [], isLoading, refetch } = useComponentAttachments(componentId)
  const createAttachment = useCreateComponentAttachment()

  const attachments = allAttachments.filter((a) => a.kind === kind)
  const latestVersion = attachments.length > 0 ? Math.max(...attachments.map((a) => a.version)) : 0
  const latestAttachment = attachments.find((a) => a.version === latestVersion)
  const olderVersions = attachments.filter((a) => a.version < latestVersion)

  const handleUpload = useCallback(
    async (file: File) => {
      if (!ALLOWED_TYPES[file.type]) {
        setUploadError('Only PDF, PNG, and JPEG files are allowed.')
        return
      }

      setUploading(true)
      setUploadError(null)
      setUploadSuccess(false)

      try {
        const result = await createAttachment.mutateAsync({
          componentId,
          kind,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        })

        const putRes = await fetch(result.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })

        if (!putRes.ok) {
          throw new Error('Failed to upload file to storage')
        }

        setUploadSuccess(true)
        setTimeout(() => setUploadSuccess(false), 3000)
        refetch()
      } catch (err: any) {
        console.error('[ComponentAttachmentsPanel] Upload error:', err)
        const message =
          err?.response?.data?.error ||
          err?.message ||
          'Failed to upload file. Please try again.'
        setUploadError(message)
      } finally {
        setUploading(false)
      }
    },
    [componentId, kind, createAttachment, refetch]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleUpload(file)
    },
    [handleUpload]
  )

  const handleDownload = useCallback(
    async (attachment: ComponentAttachment) => {
      setDownloadingId(attachment.id)
      try {
        const { downloadUrl, filename } = await fetchComponentAttachmentDownloadUrl(
          componentId,
          attachment.id
        )
        const a = document.createElement('a')
        a.href = downloadUrl
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } catch (err: any) {
        console.error('[ComponentAttachmentsPanel] Download error:', err)
        const message = err?.response?.data?.error || 'Failed to download file.'
        setUploadError(message)
      } finally {
        setDownloadingId(null)
      }
    },
    [componentId]
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          {label}
        </h4>
        {latestVersion > 0 && (
          <span className="text-[11px] text-[var(--text-tertiary)]">
            v{latestVersion}
          </span>
        )}
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
            : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-[var(--text-tertiary)]">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[13px]">Uploading...</span>
          </div>
        ) : uploadSuccess ? (
          <div className="flex items-center justify-center gap-2 text-[var(--success)]">
            <CheckCircle size={16} />
            <span className="text-[13px]">Uploaded successfully</span>
          </div>
        ) : (
          <>
            <Upload size={20} className="mx-auto mb-1 text-[var(--text-tertiary)]" />
            <p className="text-[13px] text-[var(--text-secondary)]">
              Drop a file or click to upload
            </p>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
              PDF, PNG, or JPEG
            </p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) handleUpload(file)
          }}
        />
      </div>

      {/* Error message */}
      {uploadError && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-[var(--danger-light)]">
          <AlertCircle size={14} className="text-[var(--danger)] mt-0.5 shrink-0" />
          <p className="text-[12px] text-[var(--danger)]">{uploadError}</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-4 text-[var(--text-tertiary)]">
          <Loader2 size={16} className="animate-spin" />
        </div>
      )}

      {/* Current version */}
      {latestAttachment && (
        <div
          className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
          onClick={() => handleDownload(latestAttachment)}
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-light)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <FileText size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
              {latestAttachment.filename}
            </p>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              v{latestAttachment.version} &middot; {formatBytes(latestAttachment.sizeBytes)} &middot;{' '}
              {formatDate(latestAttachment.createdAt)}
            </p>
          </div>
          {downloadingId === latestAttachment.id ? (
            <Loader2 size={14} className="animate-spin text-[var(--text-tertiary)]" />
          ) : (
            <Download size={14} className="text-[var(--text-tertiary)]" />
          )}
        </div>
      )}

      {/* Previous versions */}
      {olderVersions.length > 0 && (
        <div className="pt-2">
          <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 flex items-center gap-1">
            <Clock size={11} /> Previous versions
          </p>
          <div className="space-y-1">
            {olderVersions
              .sort((a, b) => b.version - a.version)
              .map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                  onClick={() => handleDownload(att)}
                >
                  <FileText size={14} className="text-[var(--text-tertiary)]" />
                  <span className="text-[12px] text-[var(--text-secondary)] truncate flex-1">
                    {att.filename}
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    v{att.version}
                  </span>
                  {downloadingId === att.id ? (
                    <Loader2 size={12} className="animate-spin text-[var(--text-tertiary)]" />
                  ) : (
                    <Download size={12} className="text-[var(--text-tertiary)]" />
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && attachments.length === 0 && !uploadError && (
        <p className="text-[12px] text-[var(--text-tertiary)] text-center py-2">
          No {label.toLowerCase()} uploaded yet.
        </p>
      )}
    </div>
  )
}

export default ComponentAttachmentsPanel
