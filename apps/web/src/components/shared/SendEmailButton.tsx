import { useState, useMemo, useEffect, useCallback } from 'react'
import { X, Send, Copy, Check, Mail, AlertTriangle, Loader2 } from 'lucide-react'
import { useMembers, useSendProductionEmail, useMicrosoftStatus } from '@/hooks/useData'
import type { ProductionEmailRecipient } from '@/hooks/useData'
import { Toast } from '@/components/shared/Toast'
import type { ToastData } from '@/components/shared/Toast'
import { OverlayPortal } from '@/components/shared/OverlayPortal'
import { ConnectMicrosoft } from '@/components/shared/ConnectMicrosoft'

export interface SendEmailButtonProps {
  itemId?: string
  defaultSubject?: string
  defaultHtml?: string
  onSent?: (result: { sent: boolean; configured: boolean }) => void
}

const inputClass =
  'w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface EmailModalProps {
  open: boolean
  onClose: () => void
  itemId?: string
  defaultSubject?: string
  defaultHtml?: string
  onSent?: (result: { sent: boolean; configured: boolean }) => void
}

function EmailModal({ open, onClose, itemId, defaultSubject, defaultHtml, onSent }: EmailModalProps) {
  const membersQuery = useMembers()
  const sendEmail = useSendProductionEmail()
  const microsoftStatus = useMicrosoftStatus()

  const [recipients, setRecipients] = useState<ProductionEmailRecipient[]>([])
  const [emailInput, setEmailInput] = useState('')
  const [subject, setSubject] = useState(defaultSubject || '')
  const [bodyHtml, setBodyHtml] = useState(defaultHtml || '')
  const [bodyText, setBodyText] = useState('')
  const [copied, setCopied] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const isConnected = microsoftStatus.data?.connected ?? false
  const isConfigured = microsoftStatus.data?.configured ?? false

  useEffect(() => {
    if (!open) return
    setSubject(defaultSubject || '')
    setBodyHtml(defaultHtml || '')
    setBodyText(defaultHtml?.replace(/<[^>]*>/g, '') || '')
    setNotConfigured(false)
    setCopied(false)
    setEmailInput('')
    setRecipients([])
  }, [open, defaultSubject, defaultHtml])

  const addEmail = useCallback((raw: string) => {
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
  }, [])

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
      const text = `Subject: ${subject}\n\n${bodyText}`
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setToast({ message: 'Email content copied to clipboard', type: 'success' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setToast({ message: 'Could not copy — select and copy manually', type: 'error' })
    }
  }, [subject, bodyText])

  const handleSend = useCallback(async () => {
    if (recipients.length === 0) {
      setToast({ message: 'Add at least one recipient', type: 'error' })
      return
    }
    setNotConfigured(false)
    try {
      const res = await sendEmail.mutateAsync({
        recipients,
        subject: subject.trim() || 'Update',
        html: bodyHtml || `<p>${bodyText.replace(/\n/g, '<br/>')}</p>`,
        itemId,
      })
      if (res?.sent) {
        setToast({ message: `Email sent to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`, type: 'success' })
        onSent?.({ sent: true, configured: true })
        setTimeout(() => onClose(), 600)
      } else if (res && res.configured === false) {
        setNotConfigured(true)
        onSent?.({ sent: false, configured: false })
      } else {
        setToast({ message: res?.error || 'Send failed — copy the content instead', type: 'error' })
        setNotConfigured(true)
      }
    } catch {
      setNotConfigured(true)
      setToast({ message: 'Email service unavailable — copy the content instead', type: 'error' })
    }
  }, [recipients, subject, bodyHtml, bodyText, itemId, sendEmail, onClose, onSent])

  if (!open) return null

  const sending = sendEmail.isPending

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div
          className="relative z-10 flex flex-col bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl shadow-2xl w-full max-w-2xl"
          style={{ maxHeight: 'calc(100vh - 4rem)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Mail size={18} style={{ color: 'var(--accent)' }} />
              Send email
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Microsoft connection status */}
            {!isConnected && isConfigured && (
              <ConnectMicrosoft variant="inline" purpose="to send email" />
            )}

            {!isConfigured && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[rgba(255,159,10,0.08)] border border-[rgba(255,159,10,0.25)]">
                <AlertTriangle size={16} className="text-[#FF9F0A] flex-shrink-0 mt-0.5" />
                <p className="text-[13px] text-[var(--text-secondary)]">
                  Email isn't configured on the server. Copy the content instead and paste it into your mail client.
                </p>
              </div>
            )}

            {/* Recipients */}
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                To
              </label>
              <div className="flex flex-wrap items-center gap-1.5 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-2.5 py-2 focus-within:border-[var(--accent)] transition-all">
                {recipients.map((r) => (
                  <span
                    key={r.email}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] bg-[var(--accent-subtle)] text-[var(--accent)]"
                  >
                    <span className="font-medium">{r.name || r.email}</span>
                    <button
                      onClick={() => removeRecipient(r.email)}
                      className="hover:opacity-70 transition-opacity"
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
            </div>

            {/* Subject */}
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject..."
                className={inputClass}
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                Body
              </label>
              <textarea
                value={bodyText}
                onChange={(e) => {
                  setBodyText(e.target.value)
                  setBodyHtml(`<p>${e.target.value.replace(/\n/g, '<br/>')}</p>`)
                }}
                rows={8}
                placeholder="Email content..."
                className={`${inputClass} resize-none`}
              />
            </div>

            {/* Not-configured notice */}
            {notConfigured && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[rgba(255,159,10,0.08)] border border-[rgba(255,159,10,0.25)]">
                <AlertTriangle size={16} className="text-[#FF9F0A] flex-shrink-0 mt-0.5" />
                <p className="text-[13px] text-[var(--text-secondary)]">
                  Email isn't connected — copy the content instead and paste it into your mail client.
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
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>

        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </div>
    </OverlayPortal>
  )
}

export function SendEmailButton({ itemId, defaultSubject, defaultHtml, onSent }: SendEmailButtonProps) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--accent)] bg-[var(--accent-subtle)] hover:bg-[var(--accent)]/15 transition-colors"
      >
        <Mail size={14} />
        Send email
      </button>

      <EmailModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        itemId={itemId}
        defaultSubject={defaultSubject}
        defaultHtml={defaultHtml}
        onSent={onSent}
      />
    </>
  )
}
