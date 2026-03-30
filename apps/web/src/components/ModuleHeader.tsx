import { useState, useRef, useEffect } from 'react'
import { Settings, ChevronDown, ChevronUp } from 'lucide-react'

interface ModuleHeaderProps {
  icon: React.ElementType
  title: string
  children?: React.ReactNode
  onSettingsChange?: (settings: ModuleSettings) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export interface ModuleSettings {
  sortOrder: 'newest' | 'oldest' | 'priority' | 'name'
  notifications: boolean
}

function SettingsPopover({
  open,
  onClose,
  settings,
  onChange,
  onCollapse,
}: {
  open: boolean
  onClose: () => void
  settings: ModuleSettings
  onChange: (s: ModuleSettings) => void
  onCollapse?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      className="absolute right-0 top-8 z-50 w-56 p-3 rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
      style={{ backdropFilter: 'blur(20px)' }}
    >
      <p className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-[0.06em] mb-2">
        Module Settings
      </p>

      {/* Sort Order */}
      <label className="block mb-3">
        <span className="text-[12px] text-[var(--text-secondary)] mb-1 block">Sort by</span>
        <select
          value={settings.sortOrder}
          onChange={(e) => onChange({ ...settings, sortOrder: e.target.value as ModuleSettings['sortOrder'] })}
          className="w-full px-2 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[8px] text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="priority">Priority</option>
          <option value="name">Name</option>
        </select>
      </label>

      {/* Notifications */}
      <label className="flex items-center justify-between mb-3 cursor-pointer">
        <span className="text-[12px] text-[var(--text-secondary)]">Notifications</span>
        <button
          onClick={() => onChange({ ...settings, notifications: !settings.notifications })}
          className={`w-9 h-5 rounded-full transition-colors ${
            settings.notifications ? 'bg-[var(--accent)]' : 'bg-[var(--border-default)]'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
              settings.notifications ? 'translate-x-[18px]' : 'translate-x-[2px]'
            }`}
          />
        </button>
      </label>

      {/* Collapse */}
      {onCollapse && (
        <button
          onClick={() => { onCollapse(); onClose() }}
          className="w-full text-left text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] py-1.5 transition-colors"
        >
          Collapse this module
        </button>
      )}
    </div>
  )
}

export function ModuleHeader({
  icon: Icon,
  title,
  children,
  onSettingsChange,
  collapsed,
  onToggleCollapse,
}: ModuleHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<ModuleSettings>({
    sortOrder: 'newest',
    notifications: true,
  })

  const handleSettingsChange = (s: ModuleSettings) => {
    setSettings(s)
    // Persist to localStorage
    localStorage.setItem(`nexus-module-${title.toLowerCase().replace(/\s+/g, '-')}`, JSON.stringify(s))
    onSettingsChange?.(s)
  }

  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[17px] font-semibold text-[var(--text-primary)] tracking-[-0.02em] flex items-center gap-2">
        <Icon size={16} className="text-[var(--accent)]" />
        {title}
      </h2>
      <div className="flex items-center gap-2">
        {children}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-[6px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="p-1.5 rounded-[6px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <Settings size={14} />
          </button>
          <SettingsPopover
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            settings={settings}
            onChange={handleSettingsChange}
            onCollapse={onToggleCollapse}
          />
        </div>
      </div>
    </div>
  )
}
