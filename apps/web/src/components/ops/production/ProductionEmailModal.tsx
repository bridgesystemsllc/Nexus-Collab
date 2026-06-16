import { useState, useMemo, useEffect, useCallback } from 'react'
import { X, Send, Copy, Check, Mail, AlertTriangle } from 'lucide-react'
import { useMembers, useDepartments, useSendProductionEmail } from '@/hooks/useData'
import type { ProductionEmailRecipient } from '@/hooks/useData'
import { Toast } from '@/components/shared/Toast'
import type { ToastData } from '@/components/shared/Toast'
import { buildProductionUpdateEmail } from './productionEmail'
import type { ProductionOrder } from './productionData'

interface ProductionEmailModalProps {
  item: any | null
  open: boolean
  onClose: () => void
}

const inputClass =
  'w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ProductionEmailModal({ item, open, onClose }: ProductionEmailModalProps) {
  const d: Partial<ProductionOrder> = item?.data || {}

  const membersQuery = useMembers()
  const departmentsQuery = useDepartments()
  const sendEmail = useSendProductionEmail()

  const [recipients, setRecipients] = useState<ProductionEmailRecipient[]>([])
  const [emailInput, setEmailInput] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [copied, setCopied] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  // Generated email content (subject + html + text) for the current item.
  const built = useMemo(() => buildProductionUpdateEmail(d), [item])

  // Operations dept members → default recipient list.
  const opsRecipients = useMemo<ProductionEmailRecipient[]>(() => {
    const members: any[] = Array.isArray(membersQuery.data) ? membersQuery.data : []
    const depts: any[] = Array.isArray(departmentsQuery.data) ? departmentsQuery.data : []
    const opsDept = depts.find((dep) => dep?.type === 'BUILTIN_OPS')
    if (!opsDept) return []
    return members
      .filter((m) => m?.departmentId === opsDept.id && m?.email)
      .map((m) => ({ email: String(m.email), name: m.name ? String(m.name) : undefined }))
  }, [membersQuery.data, departmentsQuery.data])

  // (Re)seed the form whenever the modal opens for an item, or once the ops
  // members resolve. Only seeds recipients when the list is still empty so we
  // never clobber the user's edits.
  useEffect(() => {
    if (!open) return
    setSubject(built.subject)
    setBodyText(built.text)
    setNotConfigured(false)
    setCopied(false)
    setEmailInput('')
  }, [open, item])

  useEffect(() => {
    if (!open) return
    setRecipients((prev) => (prev.length === 0 && opsRecipients.length ? opsRecipients : prev))
  }, [open, opsRecipients])

  const addEmail = useCallback(
    (raw: string) => {
      const email = raw.trim().toLowerCase()
      if (!email) return
      if (!EMAIL_RE.test(email)) {
        setToast({ message: 'Enter a valid email address', type: 'error' })
        return
      }
      setRecipients((prev) =>
        prev.some((r) => r.email.toLowerCase() === email) ? prev : [...prev, { email }]
      )
      setEmailInput('')
    },
    []
  )

  const removeRecipient = useCallback((email: string) => {
    setRecipients((prev) => prev.filter((r) => r.email !== email))
  }, [])

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addEmail(emailInput)
    } else if (e.key === 'Backspace' && !emailInput && recipients.length) {
      removeRecipient(recipients[recipients.length - 1].email)
    }
  }

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(bodyText)
      setCopied(true)
      setToast({ message: 'Update copied to clipboard', type: 'success' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setToast({ message: 'Could not copy — select and copy manually', type: 'error' })
    }
  }, [bodyText])

  const handleSend = useCallback(async () => {
    if (recipients.length === 0) {
      setToast({ message: 'Add at least one recipient', type: 'error' })
      return
    }
    setNotConfigured(false)
    try {
      const res = await sendEmail.mutateAsync({
        recipients,
        subject: subject.trim() || built.subject,
        html: built.html,
        itemId: item?.id,
      })
      if (res?.sent) {
        setToast({ message: `Update emailed to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`, type: 'success' })
        setTimeout(() => onClose(), 600)
      } else if (res && res.configured === false) {
        setNotConfigured(true)
      } else {
        setToast({ message: res?.error || 'Send failed — copy the update instead', type: 'error' })
        setNotConfigured(true)
      }
    } catch {
      // Backend may 404 until merged; degrade gracefully to the Copy path.
      setNotConfigured(true)
      setToast({ message: 'Email service unavailable — copy the update instead', type: 'error' })
    }
  }, [recipients, subject, built, item, sendEmail, onClose])

  if (!open) return null

  const sending = sendEmail.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 flex flex-col bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl shadow-2xl w-full max-w-3xl"
        style={{ maxHeight: 'calc(100vh - 4rem)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Mail size={18} style={{ color: 'var(--accent)' }} />
              Create Production Update Email
            </h2>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5 truncate">
              {d.salesOrder || d.itemNumber || (d as any).poNumber || '—'} &mdash;{' '}
              {d.description || (d as any).product || 'Production Item'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex-shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Recipients */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
              Recipients
              <span className="text-[var(--text-tertiary)] font-normal ml-1.5">(Operations team by default)</span>
            </label>
            <div className="flex flex-wrap items-center gap-1.5 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-2.5 py-2 focus-within:border-[var(--accent)] transition-all">
              {recipients.map((r) => (
                <span
                  key={r.email}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] bg-[var(--accent-subtle)] text-[var(--accent)]"
                >
                  <span className="font-medium">{r.name || r.email}</span>
                  {r.name && <span className="text-[var(--text-tertiary)]">{r.email}</span>}
                  <button
                    onClick={() => removeRecipient(r.email)}
                    className="hover:opacity-70 transition-opacity"
                    aria-label={`Remove ${r.email}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={handleEmailKeyDown}
                onBlur={() => emailInput.trim() && addEmail(emailInput)}
                placeholder={recipients.length ? 'Add email…' : 'name@company.com'}
                className="flex-1 min-w-[160px] bg-transparent outline-none text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] py-1"
              />
            </div>
            {membersQuery.isLoading && (
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5">Loading Operations team…</p>
            )}
            {!membersQuery.isLoading && opsRecipients.length === 0 && recipients.length === 0 && (
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5">
                No Operations members found — add recipients manually.
              </p>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Body: editable text + live HTML preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                Message (copied text)
              </label>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={14}
                className={`${inputClass} resize-y font-mono text-[12px] leading-relaxed`}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                Email preview
              </label>
              <div
                className="rounded-lg border border-[var(--border-default)] overflow-auto bg-white"
                style={{ height: '362px' }}
              >
                <iframe
                  title="Email preview"
                  srcDoc={built.html}
                  className="w-full h-full border-0"
                  sandbox=""
                />
              </div>
            </div>
          </div>

          {/* Not-configured notice */}
          {notConfigured && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[rgba(255,159,10,0.08)] border border-[rgba(255,159,10,0.25)]">
              <AlertTriangle size={16} className="text-[#FF9F0A] flex-shrink-0 mt-0.5" />
              <p className="text-[13px] text-[var(--text-secondary)]">
                Email isn't connected on the server — copy the update instead and paste it into your mail client.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[var(--border-subtle)]">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-medium transition-all border"
            style={{
              borderColor: notConfigured ? 'var(--accent)' : 'var(--border-default)',
              background: notConfigured ? 'var(--accent-subtle)' : 'transparent',
              color: notConfigured ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-[14px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || recipients.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[14px] font-medium text-white transition-all disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              <Send size={16} />
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}

export default ProductionEmailModal
