// ─── Emails ─────────────────────────────────────────────────
// The vendor's ETA usually arrives as an email, and today it lives in somebody's
// inbox where nobody else can find it. Three ways in — paste the text, drop the
// .eml, or pull it from the connected mailbox — because the fastest one wins and
// which is fastest depends on the person.

import { useRef, useState } from 'react'
import { Loader2, Mail, Paperclip, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { useOorCollection } from '../useOorQueries'
import { ThreadComposer } from '../ThreadComposer'
import { Pill } from '../OorPills'
import { formatLongDate } from '../oorFormat'

interface EmailAttachment {
  id: string
  createdAt: string
  payload: {
    subject: string | null
    fromAddress: string | null
    toAddresses: string[]
    ccAddresses: string[]
    sentAt: string | null
    bodyText: string
    attachmentCount: number
    source: string
    filename: string | null
  }
}

export function EmailsTab({ lineId }: { lineId: string }) {
  const emails = useOorCollection<EmailAttachment>(lineId, 'emails')
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ['oor', 'emails', lineId] })

  const uploadEml = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      await api.post(`/operations/oor/lines/${lineId}/emails`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      refresh()
    } catch {
      setUploadError('That file could not be read as an email.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <ThreadComposer
        fields={[{ name: 'raw', label: 'Paste the email', type: 'textarea', required: true, rows: 5,
          placeholder: 'From: supplier@vendor.com\nSubject: RE: tube ETA\n\nTubes ship the 12th.' }]}
        submitLabel="Attach email"
        hint="Headers are read when present; a bare paste is kept as the body."
        onSubmit={async (values) => {
          await api.post(`/operations/oor/lines/${lineId}/emails`, { raw: values.raw, source: 'paste' })
          refresh()
        }}
      />

      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".eml,message/rfc822"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) uploadEml(file)
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px]"
          style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          Upload .eml
        </button>
        {uploadError ? <span className="text-[12px]" style={{ color: 'var(--danger)' }}>{uploadError}</span> : null}
      </div>

      {emails.isLoading ? (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
          <Loader2 size={13} className="animate-spin" /> Loading emails…
        </div>
      ) : (emails.data?.rows.length ?? 0) === 0 ? (
        <div className="text-[13px] py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
          No emails attached to this line.
        </div>
      ) : (
        <div className="space-y-2">
          {emails.data!.rows.map((e) => {
            const p = e.payload
            const expanded = open === e.id
            return (
              <div key={e.id} className="rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : e.id)}
                  className="w-full text-left px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Mail size={12} style={{ color: 'var(--text-tertiary)' }} />
                    <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                      {p.subject ?? '(no subject)'}
                    </span>
                    {p.attachmentCount > 0 ? (
                      <Pill icon={Paperclip}>{p.attachmentCount}</Pill>
                    ) : null}
                    <Pill>{p.source.replace('_', ' ')}</Pill>
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {p.fromAddress ?? 'unknown sender'}
                    {p.toAddresses?.length ? ` → ${p.toAddresses.join(', ')}` : ''}
                    {' · '}
                    {formatLongDate(p.sentAt ?? e.createdAt)}
                  </div>
                </button>
                {expanded ? (
                  <div
                    className="px-3 pb-3 text-[12px] whitespace-pre-wrap leading-snug"
                    style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border-default)', paddingTop: 8 }}
                  >
                    {p.bodyText || '(no body)'}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
