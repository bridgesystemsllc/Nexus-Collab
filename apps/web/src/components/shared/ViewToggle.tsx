import { LayoutGrid, Rows3, Table2, List } from 'lucide-react'

export type ViewMode = 'table' | 'list'

interface ViewToggleProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
  /** Optional override for the icons used for each mode. */
  icons?: { table?: React.ElementType; list?: React.ElementType }
  className?: string
}

/**
 * Reusable table ↔ list/line view toggle.
 *
 * Drop next to a module's header and feed the value into a conditional render:
 *
 * ```tsx
 * const [view, setView] = useState<ViewMode>('table')
 * <ViewToggle value={view} onChange={setView} />
 * {view === 'table' ? <SomeTable .../> : <SomeList .../>}
 * ```
 */
export function ViewToggle({ value, onChange, icons, className }: ViewToggleProps) {
  const TableIcon = icons?.table ?? Table2
  const ListIcon = icons?.list ?? Rows3

  const options: { mode: ViewMode; label: string; Icon: React.ElementType }[] = [
    { mode: 'table', label: 'Table view', Icon: TableIcon },
    { mode: 'list', label: 'List view', Icon: ListIcon },
  ]

  return (
    <div
      className={`inline-flex items-center gap-1 p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] ${className ?? ''}`}
      role="group"
      aria-label="View mode"
    >
      {options.map(({ mode, label, Icon }) => {
        const active = value === mode
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-all ${
              active
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Icon size={16} />
          </button>
        )
      })}
    </div>
  )
}

// Re-exported so callers can pick alternative icons without extra imports.
export { LayoutGrid, List }
