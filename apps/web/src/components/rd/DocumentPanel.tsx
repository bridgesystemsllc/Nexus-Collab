import { useState, useRef } from 'react'
import {
  Cloud,
  CloudOff,
  Download,
  FileText,
  Image,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { SharePointLinks } from './SharePointLinks'

export interface DocFile {
  name: string
  size: number
  type: string
  uploadedBy: string
  uploadedAt: string
  url: string
  source: 'onedrive' | 'local'
}

export interface DocumentPanelProps {
  files: DocFile[]
  sharepointLinks: { displayName: string; url: string; addedBy: string; addedAt: string }[]
  onUploadFiles: (files: File[]) => void
  onRemoveFile: (index: number) => void
  onAddSharePointLink: (link: { displayName: string; url: string }) => void
  onRemoveSharePointLink: (index: number) => void
  oneDriveConnected?: boolean
  oneDrivePath?: string
}

type Tab = 'files' | 'sharepoint'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(type: string) {
  const lower = type.toLowerCase()
  if (lower.includes('pdf')) return { Icon: FileText, color: '#EF4444' }
  if (lower.includes('word') || lower.includes('docx') || lower.includes('doc'))
    return { Icon: FileText, color: '#2F80ED' }
  if (lower.includes('excel') || lower.includes('xlsx') || lower.includes('xls') || lower.includes('sheet'))
    return { Icon: FileText, color: '#10B981' }
  if (lower.includes('image') || lower.includes('png') || lower.includes('jpg') || lower.includes('jpeg'))
    return { Icon: Image, color: '#8B5CF6' }
  return { Icon: FileText, color: 'var(--text-tertiary)' }
}

export function DocumentPanel({
  files,
  sharepointLinks,
  onUploadFiles,
  onRemoveFile,
  onAddSharePointLink,
  onRemoveSharePointLink,
  oneDriveConnected,
  oneDrivePath,
}: DocumentPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('files')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files
    if (selected && selected.length > 0) {
      onUploadFiles(Array.from(selected))
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      {/* OneDrive Status Banner */}
      {oneDriveConnected !== undefined && (
        <div
          className="flex items-center gap-2 px-3 py-2 mb-3 rounded-[8px] text-[12px]"
          style={{
            background: oneDriveConnected ? 'var(--success-light)' : 'var(--bg-surface)',
            color: oneDriveConnected ? 'var(--success)' : 'var(--text-secondary)',
            border: `1px solid ${oneDriveConnected ? 'var(--success)' : 'var(--border-default)'}`,
            borderColor: oneDriveConnected ? 'rgba(15,123,108,0.2)' : 'var(--border-default)',
          }}
        >
          {oneDriveConnected ? (
            <>
              <Cloud size={14} />
              <span className="font-medium">OneDrive Connected</span>
              {oneDrivePath && (
                <span className="text-[11px] opacity-75 ml-1">{oneDrivePath}</span>
              )}
            </>
          ) : (
            <>
              <CloudOff size={14} />
              <span>OneDrive not connected. Files will be stored locally.</span>
            </>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0 mb-4 border-b border-[var(--border-subtle)]">
        {[
          { key: 'files' as Tab, label: 'Uploaded Files', count: files.length },
          { key: 'sharepoint' as Tab, label: 'SharePoint Links', count: sharepointLinks.length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2 text-[13px] font-medium transition-colors relative"
            style={{
              color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-tertiary)',
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 text-[11px] tabular-nums">({tab.count})</span>
            )}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Uploaded Files Tab */}
      {activeTab === 'files' && (
        <div>
          {files.length === 0 ? (
            <p className="text-[13px] text-[var(--text-tertiary)] py-4 text-center">
              No files uploaded yet.
            </p>
          ) : (
            <div className="space-y-2 mb-3">
              {files.map((file, idx) => {
                const { Icon, color } = fileIcon(file.type)
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <Icon size={16} style={{ color, flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                        {file.name}
                      </p>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        {formatFileSize(file.size)}
                        <span className="mx-1">&middot;</span>
                        {file.uploadedBy}
                        <span className="mx-1">&middot;</span>
                        {file.uploadedAt}
                        {file.source === 'onedrive' && (
                          <>
                            <span className="mx-1">&middot;</span>
                            <Cloud size={10} className="inline -mt-0.5" /> OneDrive
                          </>
                        )}
                      </p>
                    </div>
                    <a
                      href={file.url}
                      download={file.name}
                      className="p-1.5 rounded-[6px] text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
                      title="Download"
                    >
                      <Download size={14} />
                    </a>
                    <button
                      onClick={() => onRemoveFile(idx)}
                      className="p-1.5 rounded-[6px] text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)] transition-colors"
                      title="Remove"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
          >
            <Upload size={13} />
            Upload File
          </button>
        </div>
      )}

      {/* SharePoint Links Tab */}
      {activeTab === 'sharepoint' && (
        <SharePointLinks
          links={sharepointLinks}
          onAdd={onAddSharePointLink}
          onRemove={onRemoveSharePointLink}
        />
      )}
    </div>
  )
}
