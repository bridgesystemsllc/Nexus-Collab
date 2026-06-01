import { useState, useEffect } from 'react'
import { X, Search, Loader2, Folder, FileText, ChevronRight, Plus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useMicrosoftStatus, useOneDriveChildren, useOneDriveSearch, type OneDriveItem,
} from '@/hooks/useData'
import { ConnectMicrosoft } from '@/components/shared/ConnectMicrosoft'

interface Crumb {
  id: string | null
  name: string
}

function formatBytes(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Browser (the reusable browse/search body) ─────────────
// Self-contained: handles the connect prompt, folder navigation and search.
// Calls onPick(file) when the user selects a (non-folder) file. The parent owns
// the actual attach mutation and passes `busyId` to show progress on a row.

export function OneDriveBrowser({
  onPick,
  busyId,
}: {
  onPick: (file: OneDriveItem) => void
  busyId?: string | null
}) {
  const { data: status, isLoading: statusLoading } = useMicrosoftStatus()
  const connected = status?.connected ?? false
  const qc = useQueryClient()

  const [stack, setStack] = useState<Crumb[]>([{ id: null, name: 'OneDrive' }])
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  const current = stack[stack.length - 1]
  const searching = debounced.length >= 2

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350)
    return () => clearTimeout(t)
  }, [query])

  const childrenQ = useOneDriveChildren(current.id, connected && !searching)
  const searchQ = useOneDriveSearch(debounced, connected && searching)
  const active = searching ? searchQ : childrenQ
  const items = active.data?.items ?? []
  const lapsed = (active.error as any)?.response?.status === 412

  // On a lapse the server already cleared the connection; refetch status so the
  // inline prompt renders the reconnect button instead of nothing.
  useEffect(() => {
    if (lapsed) qc.invalidateQueries({ queryKey: ['microsoft', 'status'] })
  }, [lapsed, qc])

  const openFolder = (item: OneDriveItem) => {
    setQuery('')
    setDebounced('')
    setStack((s) => [...s, { id: item.id, name: item.name }])
  }

  const goToCrumb = (index: number) => {
    setQuery('')
    setDebounced('')
    setStack((s) => s.slice(0, index + 1))
  }

  if (statusLoading) {
    return (
      <div className="py-10 flex items-center justify-center text-[var(--text-tertiary)]">
        <Loader2 size={18} className="animate-spin" />
      </div>
    )
  }

  if (!connected || lapsed) {
    return <ConnectMicrosoft variant="inline" purpose="to browse your OneDrive files" />
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          placeholder="Search your OneDrive"
          className="w-full pl-9 pr-9 py-2 rounded-lg text-[13px] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
        />
        {active.isFetching && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--text-tertiary)]" />
        )}
      </div>

      {/* Breadcrumb (hidden while searching) */}
      {!searching && (
        <div className="flex items-center gap-1 flex-wrap text-[12px]">
          {stack.map((crumb, i) => (
            <span key={`${crumb.id ?? 'root'}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-[var(--text-tertiary)]" />}
              <button
                onClick={() => goToCrumb(i)}
                disabled={i === stack.length - 1}
                className={`px-1 rounded transition-colors ${
                  i === stack.length - 1
                    ? 'text-[var(--text-primary)] font-medium cursor-default'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Results */}
      <div className="max-h-[340px] overflow-y-auto -mx-1 px-1">
        {searching && debounced.length < 2 && (
          <p className="text-[12px] text-[var(--text-tertiary)] text-center py-8">
            Type at least 2 characters to search.
          </p>
        )}
        {active.isError && !lapsed && (
          <p className="text-[12px] text-[var(--danger)] text-center py-8">
            Couldn’t load OneDrive. Please try again.
          </p>
        )}
        {!active.isFetching && !active.isError && items.length === 0 && (
          <p className="text-[12px] text-[var(--text-tertiary)] text-center py-8">
            {searching ? `No files match “${debounced}”.` : 'This folder is empty.'}
          </p>
        )}

        <div className="space-y-1">
          {items.map((item) => {
            const busy = busyId === item.id
            return (
              <button
                key={item.id}
                onClick={() => (item.is_folder ? openFolder(item) : onPick(item))}
                disabled={!!busyId}
                className="w-full text-left p-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-default)] transition-colors disabled:opacity-50 flex items-center gap-2.5"
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    item.is_folder ? 'bg-amber-500/15 text-amber-400' : 'bg-sky-500/15 text-sky-400'
                  }`}
                >
                  {item.is_folder ? <Folder size={14} /> : <FileText size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{item.name}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 truncate">
                    {item.is_folder
                      ? `${item.child_count} item${item.child_count === 1 ? '' : 's'}`
                      : [formatBytes(item.size), item.last_modified ? new Date(item.last_modified).toLocaleDateString() : '']
                          .filter(Boolean)
                          .join(' \u00B7 ')}
                  </p>
                </div>
                {busy ? (
                  <Loader2 size={14} className="animate-spin text-[var(--text-tertiary)] shrink-0" />
                ) : item.is_folder ? (
                  <ChevronRight size={14} className="text-[var(--text-tertiary)] shrink-0" />
                ) : (
                  <Plus size={14} className="text-[var(--text-tertiary)] shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Standalone modal (used outside the file modal, e.g. cowork) ──

export function OneDrivePicker({
  onClose,
  onPick,
  busyId,
}: {
  onClose: () => void
  onPick: (file: OneDriveItem) => void
  busyId?: string | null
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[500px] mx-4 rounded-2xl shadow-2xl" style={{ background: 'var(--bg-elevated)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Add from OneDrive</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        <div className="px-5 py-4">
          <OneDriveBrowser onPick={onPick} busyId={busyId} />
        </div>
      </div>
    </div>
  )
}
