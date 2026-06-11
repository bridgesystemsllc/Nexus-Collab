import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Loader2, KeyRound } from 'lucide-react'
import { api } from '@/lib/api'

// ─── Formulations password gate (frontend) ───────────────────
// Server-side enforced: the API rejects gated routes with 403 until this
// session POSTs the correct password to /formulations-gate/unlock. This
// wrapper only decides whether to show the lock screen or the module.

interface GateStatus {
  locked: boolean
  unlocked: boolean
}

export function FormulationsGate({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<GateStatus>({
    queryKey: ['formulations-gate-status'],
    queryFn: () => api.get('/formulations-gate/status').then((r) => r.data),
    staleTime: 30_000,
  })

  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // While probing, show a quiet placeholder instead of flashing the lock.
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
      </div>
    )
  }

  // Gate disabled, or this session already unlocked → render the module.
  if (!data?.locked || data?.unlocked) {
    return <>{children}</>
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      // Raw fetch (not the shared axios client): its 401 interceptor would
      // bounce a wrong-password response to the login page.
      const res = await fetch('/api/v1/formulations-gate/unlock', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.status === 401) {
        setError('Incorrect password. Try again.')
        return
      }
      if (!res.ok) {
        setError('Unable to unlock right now. Try again.')
        return
      }
      setPassword('')
      await qc.invalidateQueries({ queryKey: ['formulations-gate-status'] })
    } catch {
      setError('Unable to unlock right now. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-full max-w-[380px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-8 py-10 text-center shadow-lg">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center mb-5">
          <Lock size={24} className="text-[var(--accent)]" />
        </div>
        <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Formulations are locked</h2>
        <p className="text-[12px] text-[var(--text-tertiary)] mt-1.5 leading-relaxed">
          This module contains confidential formulas. Enter the access password to unlock it for this session.
        </p>

        <form onSubmit={handleUnlock} className="mt-6 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError('')
            }}
            placeholder="Password"
            autoFocus
            autoComplete="off"
            className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          {error && <p className="text-[12px] text-[var(--danger)] text-left px-1">{error}</p>}
          <button
            type="submit"
            disabled={!password || busy}
            className="w-full inline-flex items-center justify-center gap-2 btn-primary px-4 py-2.5 rounded-xl text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}
