import { useEffect, useRef } from 'react'
import { CheckCircle2, AlertTriangle } from 'lucide-react'

// ─── Reusable toast notification ─────────────────────────────
// Fixed bottom-right, auto-dismisses, success/error variants.
// Owner keeps the state:
//   const [toast, setToast] = useState<ToastData | null>(null)
//   <Toast toast={toast} onDismiss={() => setToast(null)} />

export type ToastType = 'success' | 'error'

export interface ToastData {
  message: string
  type: ToastType
}

interface ToastProps {
  toast: ToastData | null
  onDismiss: () => void
  /** Auto-dismiss delay in ms. Defaults to 2500. */
  duration?: number
}

export function Toast({ toast, onDismiss, duration = 2500 }: ToastProps) {
  // Keep the latest dismiss callback without resetting the timer on re-renders.
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => dismissRef.current(), duration)
    return () => clearTimeout(t)
  }, [toast, duration])

  if (!toast) return null

  const Icon = toast.type === 'success' ? CheckCircle2 : AlertTriangle

  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-[13px] font-medium shadow-lg animate-fade-in"
      style={{
        background: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
        color: '#fff',
      }}
    >
      <Icon size={15} className="shrink-0" />
      {toast.message}
    </div>
  )
}
