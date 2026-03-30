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
import { useDepartments } from '@/hooks/useData'
import type { LucideIcon } from 'lucide-react'

type Page = Parameters<ReturnType<typeof useAppStore.getState>['setPage']>[0]

interface NavItem {
  id: Page
  label: string
  icon?: LucideIcon
  emoji?: string
  deptId?: string
}

interface NavSection {
  label: string
  items: NavItem[]
}

const overviewSection: NavSection = {
  label: 'OVERVIEW',
  items: [
    { id: 'dashboard', label: 'Command Center', icon: LayoutDashboard },
    { id: 'everything', label: 'Everything', icon: Database },
  ],
}

const collaborationSection: NavSection = {
  label: 'COLLABORATION',
  items: [
    { id: 'cowork', label: 'Cowork Spaces', icon: Users },
    { id: 'docs', label: 'Documents', icon: FileText },
  ],
}

const systemSection: NavSection = {
  label: 'SYSTEM',
  items: [
    { id: 'integrations', label: 'Integrations', icon: Plug },
    { id: 'dept-manager', label: 'Dept Manager', icon: Boxes },
    { id: 'pulse', label: 'Pulse', icon: Bell },
  ],
}

// Fallback departments shown while API is loading
const fallbackDeptItems: NavItem[] = [
  { id: 'rd', label: 'R&D', icon: FlaskConical },
  { id: 'ops', label: 'Operations', icon: Settings2 },
]

function buildDeptItems(departments: any[]): NavItem[] {
  return departments.map((dept) => {
    if (dept.type === 'BUILTIN_RD') {
      return { id: 'rd' as Page, label: dept.name, icon: FlaskConical, deptId: dept.id }
    }
    if (dept.type === 'BUILTIN_OPS') {
      return { id: 'ops' as Page, label: dept.name, icon: Settings2, deptId: dept.id }
    }
    // Custom department — use emoji icon from DB
    return {
      id: 'custom-dept' as Page,
      label: dept.name,
      emoji: dept.icon || '📁',
      deptId: dept.id,
    }
  })
}

export function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage)
  const selectedDeptId = useAppStore((s) => s.selectedDeptId)
  const setPage = useAppStore((s) => s.setPage)
  const setSelectedDept = useAppStore((s) => s.setSelectedDept)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const toggleAIPanel = useAppStore((s) => s.toggleAIPanel)

  const { data: departments, isLoading } = useDepartments()

  const deptItems = !isLoading && Array.isArray(departments)
    ? buildDeptItems(departments)
    : fallbackDeptItems

  const sections: NavSection[] = [
    overviewSection,
    { label: 'DEPARTMENTS', items: deptItems },
    collaborationSection,
    systemSection,
  ]

  return (
    <aside
      className="h-screen flex flex-col transition-all duration-200"
      style={{
        width: sidebarCollapsed ? 64 : 240,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-default)',
      }}
    >
      {/* Logo / Title */}
      <div
        className="flex items-center justify-between px-4 h-14"
        style={{ borderBottom: '1px solid var(--border-default)' }}
      >
        {!sidebarCollapsed && (
          <span
            className="text-lg font-bold tracking-tight"
            style={{ color: 'var(--accent-secondary)' }}
          >
            NEXUS
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {sections.map((section) => (
          <div key={section.label}>
            {!sidebarCollapsed && (
              <div
                className="px-3 mb-2 text-[11px] font-semibold tracking-[0.06em] uppercase"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {section.label}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isCustomDept = item.id === 'custom-dept' && !!item.deptId
                const isActive = isCustomDept
                  ? currentPage === 'custom-dept' && selectedDeptId === item.deptId
                  : currentPage === item.id ||
                    (item.id === 'cowork' && currentPage === 'cowork-detail')

                const handleClick = () => {
                  if (isCustomDept) {
                    setSelectedDept(item.deptId!)
                  } else {
                    setPage(item.id)
                  }
                }

                const Icon = item.icon
                // Use deptId as key for custom depts to avoid duplicate 'custom-dept' keys
                const key = isCustomDept ? `dept-${item.deptId}` : item.id

                return (
                  <button
                    key={key}
                    onClick={handleClick}
                    className={`nav-item w-full ${isActive ? 'active' : ''} ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    {Icon ? (
                      <Icon size={18} />
                    ) : (
                      <span className="text-base leading-none" style={{ width: 18, textAlign: 'center' }}>
                        {item.emoji}
                      </span>
                    )}
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: AI Assistant */}
      <div style={{ padding: 8, borderTop: '1px solid var(--border-default)' }}>
        <button
          onClick={toggleAIPanel}
          className={`nav-item w-full ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
          title={sidebarCollapsed ? 'AI Assistant' : undefined}
        >
          <Bot size={18} style={{ color: 'var(--accent)' }} />
          {!sidebarCollapsed && (
            <span style={{ color: 'var(--accent)', fontWeight: 550 }}>NEXUS AI</span>
          )}
        </button>
      </div>
    </aside>
  )
}
