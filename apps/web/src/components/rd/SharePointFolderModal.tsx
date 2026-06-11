import { useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  X, ExternalLink, Folder, FileText, FolderOpen, Settings2, AlertTriangle,
} from 'lucide-react'
import { api } from '@/lib/api'

// ─── Types ─────────────────────────────────────────────────

interface SharePointFolderModalProps {
  open: boolean
  url: string
  onClose: () => void
}

interface SpFile {
  name: string
  type: string // 'folder' | file extension
  lastModified: string | null
  webUrl: string | null
  size: number | null
}

interface SpListResponse {
  configured: boolean
  required?: string[]
  files?: SpFile[]
}

// ─── Helpers ───────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Component ─────────────────────────────────────────────

export function SharePointFolderModal({ open, url, onClose }: SharePointFolderModalProps) {
  const { data, isLoading, isError, error } = useQuery<SpListResponse>({
    queryKey: ['sharepoint-list', url],
    queryFn: () => api.get(`/sharepoint/list?url=${encodeURIComponent(url)}`).then((r) => r.data),
    enabled: open && !!url,
    staleTime: 60_000,
    retry: false,
  })

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  const files = data?.configured ? data.files ?? [] : []
  const requiredVars = data?.required ?? ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']
  const errMessage =
    (error as any)?.response?.data?.error === 'formulations_locked'
      ? 'Formulations are locked for this session. Unlock the module and try again.'
      : (error as any)?.response?.data?.message || 'Could not load the folder contents.'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative w-full max-w-[640px] mx-4 rounded-2xl shadow-2xl border border-[var(--border-default)] flex flex-col max-h-[80vh]"
        style={{ background: 'var(--bg-elevated)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,120,212,0.12)' }}>
              <FolderOpen size={16} style={{ color: '#0078D4' }} />
            </span>
            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">SharePoint Folder</h3>
              <p className="text-[11px] text-[var(--text-tertiary)] truncate">{url}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Open in SharePoint */}
        <div className="px-5 pt-4">
          <button
            onClick={() => window.open(url, '_blank')}
            className="w-full inline-flex items-center justify-center gap-2 btn-primary px-4 py-2.5 rounded-xl text-[13px] font-medium"
          >
            <ExternalLink size={15} />
            Open in SharePoint
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            // Loading skeleton
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-subtle)]">
                  <div className="w-4 h-4 rounded bg-[var(--bg-hover)] animate-pulse" />
                  <div className="h-3 rounded bg-[var(--bg-hover)] animate-pulse" style={{ width: `${50 - i * 6}%` }} />
                  <div className="ml-auto h-3 w-16 rounded bg-[var(--bg-hover)] animate-pulse" />
                </div>
              ))}
            </div>
          ) : isError ? (
            // Error state
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-xl bg-[var(--danger-light)] flex items-center justify-center mb-4">
                <AlertTriangle size={22} className="text-[var(--danger)]" />
              </div>
              <p className="text-[14px] text-[var(--text-secondary)] font-medium">Couldn&apos;t list folder contents</p>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-1 max-w-sm">{errMessage}</p>
            </div>
          ) : data && !data.configured ? (
            // Not configured state
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center mb-4">
                <Settings2 size={22} className="text-[var(--text-tertiary)]" />
              </div>
              <p className="text-[14px] text-[var(--text-secondary)] font-medium">SharePoint connection not configured</p>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-1 max-w-sm">
                File listing requires Microsoft Graph app credentials with the Files.Read.All application permission. Set these environment variables on the API:
              </p>
              <div className="mt-3 space-y-1.5">
                {requiredVars.map((v) => (
                  <code
                    key={v}
                    className="block px-3 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[12px] font-mono text-[var(--text-secondary)]"
                  >
                    {v}
                  </code>
                ))}
              </div>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-3">
                You can still open the folder directly in SharePoint above.
              </p>
            </div>
          ) : files.length === 0 ? (
            // Empty folder
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center mb-4">
                <Folder size={22} className="text-[var(--text-tertiary)]" />
              </div>
              <p className="text-[14px] text-[var(--text-secondary)] font-medium">This folder is empty.</p>
            </div>
          ) : (
            // File table
            <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
              <div className="grid grid-cols-[1fr_90px_120px] gap-2 px-3 py-2 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
                <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase">Name</span>
                <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase">Type</span>
                <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase text-right">Last Modified</span>
              </div>
              {files.map((file, idx) => {
                const isFolder = file.type === 'folder'
                const Icon = isFolder ? Folder : FileText
                const row = (
                  <>
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon size={14} className="flex-shrink-0" style={{ color: isFolder ? '#0078D4' : 'var(--text-tertiary)' }} />
                      <span className="text-[13px] text-[var(--text-primary)] truncate">{file.name}</span>
                      {file.size != null && !isFolder && (
                        <span className="text-[11px] text-[var(--text-tertiary)] flex-shrink-0">{formatSize(file.size)}</span>
                      )}
                    </span>
                    <span className="text-[12px] text-[var(--text-secondary)] uppercase font-mono self-center">{file.type}</span>
                    <span className="text-[12px] text-[var(--text-tertiary)] text-right self-center">{formatDate(file.lastModified)}</span>
                  </>
                )
                return file.webUrl ? (
                  <a
                    key={idx}
                    href={file.webUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="grid grid-cols-[1fr_90px_120px] gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    {row}
                  </a>
                ) : (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_90px_120px] gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)] last:border-b-0"
                  >
                    {row}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
