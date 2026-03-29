import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: React.ReactNode
  wide?: boolean
}

export function Dialog({ open, onClose, title, subtitle, children, wide }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`relative z-10 flex flex-col bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-2xl animate-dialog-in ${
          wide ? 'w-full max-w-3xl' : 'w-full max-w-xl'
        }`}
        style={{ maxHeight: 'calc(100vh - 4rem)' }}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[var(--border-subtle)]">
            <div className="flex-1 min-w-0 pr-4">
              {title && (
                <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors flex-shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}
