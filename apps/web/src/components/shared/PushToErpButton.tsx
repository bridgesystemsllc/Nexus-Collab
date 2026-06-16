import { useEffect, useState } from 'react'
import { Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { usePushToErp } from '@/hooks/useData'
import { useUserStore } from '@/stores/userStore'

// Compact "Push to ERP" header-action button for a single Nexus module feed
// (components / boms / finance). Triggers a manual push and surfaces the result
// inline: "Pushed N to ERP", a dry-run notice when the ERP isn't connected, or
// an error (incl. 403 → "Admin access required"). Admin-gated: non-admins see a
// disabled button (unknown role in dev is treated as admin, mirroring routing).
export function PushToErpButton({ feedKey, label }: { feedKey: string; label: string }) {
  const role = useUserStore((s) => s.currentUser?.role)
  const editable = role == null || role === 'ADMIN' || role === 'OPS_MANAGER'
  const push = usePushToErp()
  const [msg, setMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  // Auto-dismiss the inline result after a few seconds.
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  const handlePush = async () => {
    setMsg(null)
    try {
      const res = await push.mutateAsync({ feeds: [feedKey] })
      const r = res.feeds?.[feedKey]
      if (!r) {
        setMsg({ type: 'info', text: 'Nothing to push' })
      } else if (r.error) {
        setMsg({ type: 'error', text: r.error })
      } else if (r.dryRun) {
        setMsg({ type: 'info', text: `Dry run: ${r.count} would send (ERP not connected)` })
      } else {
        setMsg({ type: 'success', text: `Pushed ${r.count} to ERP` })
      }
    } catch (err: any) {
      const status = err?.response?.status
      setMsg({
        type: 'error',
        text: status === 403 ? 'Admin access required' : err?.response?.data?.error || 'Push failed',
      })
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && (
        <span
          className={`text-[12px] flex items-center gap-1 whitespace-nowrap ${
            msg.type === 'success'
              ? 'text-[var(--success)]'
              : msg.type === 'error'
                ? 'text-[var(--danger)]'
                : 'text-[var(--text-secondary)]'
          }`}
        >
          {msg.type === 'success' ? (
            <CheckCircle2 size={12} />
          ) : msg.type === 'error' ? (
            <AlertTriangle size={12} />
          ) : null}
          {msg.text}
        </span>
      )}
      <button
        onClick={handlePush}
        disabled={!editable || push.isPending}
        title={editable ? `Push ${label} to ERP` : 'Admin access required'}
        className="flex items-center gap-1.5 btn-ghost px-3 py-2 rounded-lg text-[13px] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {push.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        Push to ERP
      </button>
    </div>
  )
}
