import {
  LayoutDashboard,
  Database,
  FlaskConical,
  Settings2,
  Users,
  FileText,
  Plug,
  Bell,
  Boxes,
  Bot,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'

const navSections = [
  {
    label: 'OVERVIEW',
    items: [
      { id: 'dashboard' as const, label: 'Command Center', icon: LayoutDashboard },
      { id: 'everything' as const, label: 'Everything', icon: Database },
    ],
  },
  {
    label: 'DEPARTMENTS',
    items: [
      { id: 'rd' as const, label: 'R&D', icon: FlaskConical },
      { id: 'ops' as const, label: 'Operations', icon: Settings2 },
    ],
  },
  {
    label: 'COLLABORATION',
    items: [
      { id: 'cowork' as const, label: 'Cowork Spaces', icon: Users },
      { id: 'docs' as const, label: 'Documents', icon: FileText },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { id: 'integrations' as const, label: 'Integrations', icon: Plug },
      { id: 'dept-manager' as const, label: 'Dept Manager', icon: Boxes },
      { id: 'pulse' as const, label: 'Pulse', icon: Bell },
    ],
  },
]

export function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage)
  const setPage = useAppStore((s) => s.setPage)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const toggleAIPanel = useAppStore((s) => s.toggleAIPanel)

  return (
    <aside
      className="h-screen flex flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-all duration-200"
      style={{ width: sidebarCollapsed ? 64 : 240 }}
    >
      {/* Logo / Title */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--border-subtle)]">
        {!sidebarCollapsed && (
          <span className="text-lg font-bold tracking-tight text-[var(--accent)]">
            NEXUS
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {navSections.map((section) => (
          <div key={section.label}>
            {!sidebarCollapsed && (
              <div className="px-3 mb-2 text-[11px] font-medium tracking-[0.08em] text-[var(--text-tertiary)] uppercase">
                {section.label}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive =
                  currentPage === item.id ||
                  (item.id === 'cowork' && currentPage === 'cowork-detail')
                return (
                  <button
                    key={item.id}
                    onClick={() => setPage(item.id)}
                    className={`nav-item w-full ${isActive ? 'active' : ''} ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <Icon size={18} />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: AI Assistant */}
      <div className="p-2 border-t border-[var(--border-subtle)]">
        <button
          onClick={toggleAIPanel}
          className={`nav-item w-full ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
          title={sidebarCollapsed ? 'AI Assistant' : undefined}
        >
          <Bot size={18} className="text-[var(--accent)]" />
          {!sidebarCollapsed && (
            <span className="text-[var(--accent)] font-medium">AI Assistant</span>
          )}
        </button>
      </div>
    </aside>
  )
}
