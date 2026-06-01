import { ArrowLeft } from 'lucide-react'

interface FullPageFormProps {
  /** Main heading shown in the page header. */
  title: string
  /** Optional supporting line under the title (e.g. "Step 2 of 6"). */
  subtitle?: string
  /** Called when the Back button is pressed. */
  onBack: () => void
  /** Label for the Back button. Defaults to "Back". */
  backLabel?: string
  /** Optional content rendered between the title and the Back button (e.g. step dots). */
  headerExtra?: React.ReactNode
  /** Main form body. Scrolls independently of the sticky header/footer. */
  children: React.ReactNode
  /** Sticky footer action bar (Save / Cancel etc.). */
  footer?: React.ReactNode
  /** Constrain body width for readability. Defaults to a comfortable form width. */
  maxWidth?: number | string
}

/**
 * Shared full-page form shell.
 *
 * Renders as a full-height view (header + scrollable body + sticky footer)
 * that fills the main content area, replacing the originating list. Use it
 * together with the page-routing store (`openForm` / `closeForm`) so any
 * list can navigate to a dedicated full-screen create/edit view and return
 * via the Back button.
 *
 * The body is the only scroll container, so long multi-step forms never need
 * nested scrolling and the action bar stays pinned to the bottom.
 */
export function FullPageForm({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  headerExtra,
  children,
  footer,
  maxWidth = 880,
}: FullPageFormProps) {
  const widthStyle = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)] animate-fade-in">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]">
        <div className="mx-auto w-full px-6 py-4 flex items-center gap-4" style={{ maxWidth: widthStyle }}>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[14px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all flex-shrink-0"
          >
            <ArrowLeft size={16} /> {backLabel}
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-semibold text-[var(--text-primary)] truncate">{title}</h1>
            {subtitle && <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5 truncate">{subtitle}</p>}
          </div>
          {headerExtra && <div className="flex-shrink-0">{headerExtra}</div>}
        </div>
      </header>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full px-6 py-6" style={{ maxWidth: widthStyle }}>
          {children}
        </div>
      </div>

      {/* Sticky footer */}
      {footer && (
        <footer className="flex-shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <div className="mx-auto w-full px-6 py-4 flex items-center justify-between gap-3" style={{ maxWidth: widthStyle }}>
            {footer}
          </div>
        </footer>
      )}
    </div>
  )
}
