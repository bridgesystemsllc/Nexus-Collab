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
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Package,
  TrendingUp,
  Truck,
} from 'lucide-react'
import type { ElementType } from 'react'
import { useAppStore } from '@/stores/appStore'

type StaticPage =
  | 'dashboard'
  | 'everything'
  | 'rd'
  | 'ops'
  | 'cowork'
  | 'docs'
  | 'product-catalog'
  | 'integrations'
  | 'email-agent'
  | 'dept-manager'
  | 'pulse'

type NavItem =
  | {
      id: StaticPage
      label: string
      icon: ElementType
      deptId?: never
    }
  | {
      id: 'custom-dept'
      label: string
      icon: ElementType
      deptId: string
    }

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
      { id: 'custom-dept' as const, label: 'Vendor Mgmt', icon: Truck, deptId: 'vendor-mgmt' },
      { id: 'custom-dept' as const, label: 'Finance', icon: BarChart3, deptId: 'finance' },
      { id: 'custom-dept' as const, label: 'Sales', icon: TrendingUp, deptId: 'sales' },
      { id: 'custom-dept' as const, label: 'Marketing', icon: Megaphone, deptId: 'marketing' },
    ],
  },
  {
    label: 'COLLABORATION',
    items: [
      { id: 'cowork' as const, label: 'Cowork Spaces', icon: Users },
      { id: 'docs' as const, label: 'Documents', icon: FileText },
      { id: 'product-catalog' as const, label: 'Product Catalog', icon: Package },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { id: 'integrations' as const, label: 'Integrations', icon: Plug },
      { id: 'email-agent' as const, label: 'Email Agent', icon: Bot },
      { id: 'dept-manager' as const, label: 'Dept Manager', icon: Boxes },
      { id: 'pulse' as const, label: 'Pulse', icon: Bell },
    ],
  },
]

export function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage)
  const selectedDeptId = useAppStore((s) => s.selectedDeptId)
  const setPage = useAppStore((s) => s.setPage)
  const setSelectedDept = useAppStore((s) => s.setSelectedDept)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const toggleAIPanel = useAppStore((s) => s.toggleAIPanel)

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
        {navSections.map((section) => (
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
              {(section.items as NavItem[]).map((item) => {
                const Icon = item.icon
                const isActive =
                  currentPage === item.id ||
                  (item.id === 'custom-dept' &&
                    currentPage === 'custom-dept' &&
                    selectedDeptId === item.deptId) ||
                  (item.id === 'cowork' && currentPage === 'cowork-detail')
                return (
                  <button
                    key={item.deptId ?? item.id}
                    onClick={() => {
                      if (item.id === 'custom-dept') {
                        setSelectedDept(item.deptId)
                        return
                      }
                      setPage(item.id)
                    }}
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
