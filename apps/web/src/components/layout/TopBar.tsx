import { Search, Bell, LogOut } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { useUserStore } from '@/stores/userStore'
import { usePulse } from '@/hooks/useData'

const pageTitles: Record<string, string> = {
  dashboard: 'Command Center',
  everything: 'Everything',
  rd: 'R&D Department',
  ops: 'Operations',
  cowork: 'Cowork Spaces',
  'cowork-detail': 'Cowork Space',
  docs: 'Documents',
  'product-catalog': 'Product Catalog',
  integrations: 'Integrations',
  'email-agent': 'Email Agent',
  'dept-manager': 'Department Manager',
  pulse: 'Pulse',
  'custom-dept': 'Department',
}

export function TopBar() {
  const currentPage = useAppStore((s) => s.currentPage)
  const setPage = useAppStore((s) => s.setPage)
  const currentUser = useUserStore((s) => s.currentUser)
  const { data: pulseData } = usePulse()

  const unreadCount = Array.isArray(pulseData)
    ? pulseData.filter((n: any) => !n.read).length
    : typeof pulseData === 'object' && pulseData?.unread != null
      ? pulseData.unread
      : 0

  const title = pageTitles[currentPage] ?? 'NEXUS'

  return (
    <header
      className="flex items-center justify-between px-6 border-b bg-[var(--bg-base)]"
      style={{ height: 52, borderColor: 'var(--border-subtle)' }}
    >
      {/* Page Title */}
      <h1
        className="text-[28px] font-bold tracking-tight"
        style={{ color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.2 }}
      >
        {title}
      </h1>

      {/* Right Section */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-tertiary)' }}
          />
          <input
            type="text"
            placeholder="Search NEXUS..."
            className="pl-9 pr-4 py-2 w-64 rounded-lg text-sm outline-none transition-colors"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Pulse Bell */}
        <button
          onClick={() => setPage('pulse')}
          className="relative p-2 rounded-lg transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold leading-none"
              style={{ background: 'var(--accent)' }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Current user + sign out */}
        {currentUser && (
          <div className="flex items-center gap-2 pl-2 ml-1" style={{ borderLeft: '1px solid var(--border-subtle)' }}>
            <div
              className="flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-bold text-white"
              style={{ background: 'var(--accent)' }}
              title={currentUser.name}
            >
              {currentUser.avatar && !currentUser.avatar.startsWith('http')
                ? currentUser.avatar
                : (currentUser.name || '?')
                    .split(/\s+/)
                    .map((p) => p[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
            </div>
            <a
              href="/api/logout"
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              title="Sign out"
            >
              <LogOut size={18} />
            </a>
          </div>
        )}
      </div>
    </header>
  )
}
