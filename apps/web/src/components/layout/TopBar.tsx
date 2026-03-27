import { Search, Bell } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { usePulse } from '@/hooks/useData'

const pageTitles: Record<string, string> = {
  dashboard: 'Command Center',
  everything: 'Everything',
  rd: 'R&D Department',
  ops: 'Operations',
  cowork: 'Cowork Spaces',
  'cowork-detail': 'Cowork Space',
  docs: 'Documents',
  integrations: 'Integrations',
  'dept-manager': 'Department Manager',
  pulse: 'Pulse',
  'custom-dept': 'Department',
}

export function TopBar() {
  const currentPage = useAppStore((s) => s.currentPage)
  const { data: pulseData } = usePulse()

  const unreadCount = Array.isArray(pulseData)
    ? pulseData.filter((n: any) => !n.read).length
    : 0

  const title = pageTitles[currentPage] ?? 'NEXUS'

  return (
    <header
      className="flex items-center justify-between px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]"
      style={{ height: 56 }}
    >
      {/* Page Title */}
      <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
        {title}
      </h1>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
          <input
            type="text"
            placeholder="Search NEXUS..."
            className="pl-9 pr-4 py-1.5 w-64 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        {/* Pulse Bell */}
        <button className="relative p-2 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors">
          <Bell size={18} className="text-[var(--text-secondary)]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}
