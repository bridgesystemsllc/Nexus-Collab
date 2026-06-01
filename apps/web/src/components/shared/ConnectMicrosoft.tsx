import { useState } from 'react'
import { CheckCircle2, Loader2, Mail, Unplug } from 'lucide-react'
import { useMicrosoftStatus, useDisconnectMicrosoft } from '@/hooks/useData'

interface ConnectMicrosoftProps {
  // `card` renders a full settings card (Integrations page). `inline` renders a
  // compact prompt for use inside attach modals when the user isn't connected.
  variant?: 'card' | 'inline'
  // Optional context label shown in the inline prompt (e.g. "to attach email").
  purpose?: string
}

// Kick off the OAuth flow via a full-page navigation (cookies are sent and the
// server can 302 to Microsoft — an XHR can't follow a cross-origin redirect).
function startConnect() {
  window.location.href = '/api/v1/integrations/microsoft/connect'
}

export function ConnectMicrosoft({ variant = 'card', purpose }: ConnectMicrosoftProps) {
  const { data, isLoading } = useMicrosoftStatus()
  const disconnect = useDisconnectMicrosoft()
  const [confirming, setConfirming] = useState(false)

  const configured = data?.configured ?? false
  const connected = data?.connected ?? false
  const accountEmail = data?.accountEmail as string | undefined

  // ── Inline (used inside attach modals) ──────────────────────
  if (variant === 'inline') {
    if (isLoading || connected) return null
    return (
      <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 flex items-center gap-3">
        <Mail size={16} className="text-[var(--text-secondary)] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-[var(--text-primary)] font-medium">
            Connect your Microsoft account{purpose ? ` ${purpose}` : ''}
          </p>
          <p className="text-[12px] text-[var(--text-secondary)]">
            {configured
              ? 'Link your work account to continue.'
              : 'Microsoft isn’t set up yet — ask an admin to add the Azure credentials.'}
          </p>
        </div>
        {configured && (
          <button
            onClick={startConnect}
            className="shrink-0 px-3 py-1.5 rounded-[8px] text-[13px] font-medium bg-[var(--accent)] text-white hover:opacity-90"
          >
            Connect
          </button>
        )}
      </div>
    )
  }

  // ── Card (Integrations page) ────────────────────────────────
  return (
    <div className="p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-[10px] bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
            <Mail size={18} className="text-[var(--accent)]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Your Microsoft account</h3>
            <p className="text-[12px] text-[var(--text-secondary)] truncate">
              {connected
                ? `Connected${accountEmail ? ` · ${accountEmail}` : ''}`
                : 'Read your own Outlook mail and OneDrive files'}
            </p>
          </div>
        </div>

        {isLoading ? (
          <Loader2 size={18} className="animate-spin text-[var(--text-secondary)]" />
        ) : connected ? (
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--success)]">
            <CheckCircle2 size={15} /> Connected
          </span>
        ) : null}
      </div>

      {!isLoading && !configured && (
        <p className="text-[12px] text-[var(--text-secondary)] rounded-[8px] bg-[var(--bg-base)] border border-[var(--border-subtle)] p-2.5">
          Microsoft isn’t configured yet. An admin needs to add{' '}
          <span className="font-mono text-[11px]">AZURE_TENANT_ID</span>,{' '}
          <span className="font-mono text-[11px]">AZURE_CLIENT_ID</span> and{' '}
          <span className="font-mono text-[11px]">AZURE_CLIENT_SECRET</span> and register the redirect URI.
        </p>
      )}

      {!isLoading && configured && !connected && (
        <button
          onClick={startConnect}
          className="w-full px-3 py-2 rounded-[8px] text-[13px] font-medium bg-[var(--accent)] text-white hover:opacity-90"
        >
          Connect Microsoft
        </button>
      )}

      {!isLoading && connected && (
        <div className="flex items-center gap-2">
          {confirming ? (
            <>
              <button
                onClick={() => disconnect.mutate(undefined, { onSettled: () => setConfirming(false) })}
                disabled={disconnect.isPending}
                className="flex-1 px-3 py-2 rounded-[8px] text-[13px] font-medium bg-[var(--danger)] text-white hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {disconnect.isPending ? <Loader2 size={14} className="animate-spin" /> : <Unplug size={14} />}
                Confirm disconnect
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-3 py-2 rounded-[8px] text-[13px] font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-base)]"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-[13px] font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-base)]"
            >
              <Unplug size={14} /> Disconnect
            </button>
          )}
        </div>
      )}
    </div>
  )
}
