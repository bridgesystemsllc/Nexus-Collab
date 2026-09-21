import { X, Plug, Bot, Boxes, Users, CreditCard, Building2 } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'

interface SettingsPopupProps {
  onClose: () => void
}

const SETTINGS_ITEMS = [
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'email-agent', label: 'Email Agent', icon: Bot },
  { id: 'dept-manager', label: 'Dept Manager', icon: Boxes },
  { id: 'people', label: 'People', icon: Users },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'organization', label: 'Organization', icon: Building2 },
] as const

type SettingsItemId = typeof SETTINGS_ITEMS[number]['id']

export function SettingsPopup({ onClose }: SettingsPopupProps) {
  const setPage = useAppStore((s) => s.setPage)

  const handleSelect = (id: SettingsItemId) => {
    if (id === 'organization') {
      setPage('settings')
      // Navigate to organization section within settings
      const params = new URLSearchParams(window.location.search)
      params.set('view', 'settings')
      params.set('section', 'organization')
      window.history.replaceState(null, '', `?${params.toString()}`)
    } else {
      setPage(id as any)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20" onClick={onClose}>
      <div
        className="w-64 rounded-xl border border-[var(--border-default)] bg-[var(--bg-base)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="py-2">
          {SETTINGS_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
