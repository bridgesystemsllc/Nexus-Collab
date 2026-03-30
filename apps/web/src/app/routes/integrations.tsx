import { useState } from 'react'
import {
  Cloud,
  Database,
  Hash,
  Mail,
  MessageCircle,
  Pencil,
  Plug,
  RefreshCw,
  Settings,
  ShoppingCart,
  X,
} from 'lucide-react'
import { useIntegrations, useSyncIntegration } from '@/hooks/useData'
import { formatDistanceToNow } from 'date-fns'
import { Dialog } from '@/components/Dialog'
import { ModuleHeader } from '@/components/ModuleHeader'

const ICON_MAP: Record<string, typeof Database> = {
  ERP_KAREVE_SYNC: Database,
  MICROSOFT_OUTLOOK: Mail,
  MICROSOFT_TEAMS: MessageCircle,
  MICROSOFT_ONEDRIVE: Cloud,
  AMAZON_VENDOR_CENTRAL: ShoppingCart,
  SLACK: Hash,
}

// ─── Integration Settings Drawer (Edit 6) ─────────────────
function IntegrationSettingsDrawer({
  integration,
  onClose,
}: {
  integration: any
  onClose: () => void
}) {
  const [enabled, setEnabled] = useState(integration.status === 'CONNECTED')

  return (
    <Dialog open={true} onClose={onClose} title={`${integration.name} Settings`} subtitle="Configure sync and data mapping" wide>
      <div className="space-y-6">
        {/* Status */}
        <div className="flex items-center justify-between p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <div>
            <p className="text-[14px] font-medium text-[var(--text-primary)]">Integration Status</p>
            <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
              {integration.status === 'CONNECTED' ? 'Active and syncing data' : 'Not connected'}
            </p>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`w-11 h-6 rounded-full transition-colors ${
              enabled ? 'bg-[var(--success)]' : 'bg-[var(--border-default)]'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-[22px]' : 'translate-x-[2px]'
              }`}
            />
          </button>
        </div>

        {/* Incoming Sync */}
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">Incoming Data</h3>
          <div className="space-y-2">
            {['Tasks', 'Calendar Events', 'Contacts', 'Messages'].map((item) => (
              <div key={item} className="flex items-center justify-between p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                <span className="text-[13px] text-[var(--text-primary)]">{item}</span>
                <span className="badge badge-healthy text-[10px]">Syncing</span>
              </div>
            ))}
          </div>
        </div>

        {/* Outgoing Sync */}
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">Outgoing Data</h3>
          <div className="space-y-2">
            {['Task Updates', 'Status Changes', 'Activity Logs'].map((item) => (
              <div key={item} className="flex items-center justify-between p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                <span className="text-[13px] text-[var(--text-primary)]">{item}</span>
                <span className="badge badge-info text-[10px]">Enabled</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sync Info */}
        <div className="p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em]">Sync Frequency</p>
              <p className="text-[14px] text-[var(--text-primary)] mt-1">Every 15 minutes</p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em]">Last Synced</p>
              <p className="text-[14px] text-[var(--text-primary)] mt-1">
                {integration.lastSyncAt
                  ? formatDistanceToNow(new Date(integration.lastSyncAt), { addSuffix: true })
                  : 'Never'}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em]">Records Synced</p>
              <p className="text-[14px] text-[var(--text-primary)] mt-1 tabular-nums">{(integration.syncCount ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em]">Connection Type</p>
              <p className="text-[14px] text-[var(--text-primary)] mt-1">OAuth 2.0</p>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

// ─── Integration Edit Modal (Edit 6) ──────────────────────
function IntegrationEditModal({
  integration,
  onClose,
}: {
  integration: any
  onClose: () => void
}) {
  const [name, setName] = useState(integration.name)

  return (
    <Dialog open={true} onClose={onClose} title={`Edit ${integration.name}`} subtitle="Modify integration settings">
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
            Integration Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
            API Endpoint
          </label>
          <input
            type="url"
            placeholder="https://api.example.com"
            className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
          />
        </div>
        <button className="btn-primary w-full text-[14px]">Save Changes</button>
      </div>
    </Dialog>
  )
}

// ─── Main Page ────────────────────────────────────────────
export function IntegrationsPage() {
  const { data: integrations, isLoading } = useIntegrations()
  const syncMutation = useSyncIntegration()
  const [settingsDrawer, setSettingsDrawer] = useState<any>(null)
  const [editModal, setEditModal] = useState<any>(null)

  const integrationList = Array.isArray(integrations) ? integrations : []
  const connected = integrationList.filter((i: any) => i.status === 'CONNECTED')
  const available = integrationList.filter((i: any) => i.status !== 'CONNECTED')

  const statusBadge = (status: string) => {
    switch (status) {
      case 'CONNECTED': return { label: 'Active', className: 'badge-healthy' }
      case 'ERROR': return { label: 'Error', className: 'badge-emergency' }
      case 'SYNCING': return { label: 'Syncing', className: 'badge-info' }
      default: return { label: 'Paused', className: 'badge-accent' }
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
          Integrations Hub
        </h1>
        <p className="text-[14px] text-[var(--text-secondary)] mt-0.5">
          Manage connected services and data sync
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-44 rounded-xl" />
          ))}
        </div>
      )}

      {/* Connected Section */}
      {!isLoading && connected.length > 0 && (
        <div>
          <ModuleHeader icon={RefreshCw} title="Connected">
            <span className="text-[12px] text-[var(--text-secondary)] tabular-nums">{connected.length} active</span>
          </ModuleHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
            {connected.map((integration: any) => {
              const Icon = ICON_MAP[integration.type] ?? Plug
              const lastSync = integration.lastSyncAt
                ? formatDistanceToNow(new Date(integration.lastSyncAt), { addSuffix: true })
                : 'Never'
              const badge = statusBadge(integration.status)

              return (
                <div key={integration.id} className="data-cell relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-[var(--success)]" />
                  <div className="relative z-10">
                    {/* Header with Edit/Settings buttons (Edit 6) */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--accent-subtle)]">
                        <Icon size={20} className="text-[var(--accent)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{integration.name}</h3>
                          <span className={`badge text-[10px] ${badge.className}`}>{badge.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="pulse-dot bg-[var(--success)]" />
                          <span className="text-[11px] text-[var(--success)]">Connected</span>
                        </div>
                      </div>
                      {/* Edit + Settings buttons (Edit 6) */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditModal(integration)}
                          className="p-1.5 rounded-[6px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => setSettingsDrawer(integration)}
                          className="p-1.5 rounded-[6px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                          title="Settings"
                        >
                          <Settings size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] mb-4">
                      <span className="tabular-nums">{(integration.syncCount ?? 0).toLocaleString()} synced</span>
                      <span>Last sync: {lastSync}</span>
                    </div>

                    {/* Sync Button */}
                    <button
                      onClick={() => syncMutation.mutate(integration.type)}
                      disabled={syncMutation.isPending}
                      className="btn-ghost w-full flex items-center justify-center gap-2 text-[13px]"
                    >
                      <RefreshCw size={13} className={syncMutation.isPending ? 'animate-spin' : ''} />
                      Sync Now
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Available Section */}
      {!isLoading && available.length > 0 && (
        <div>
          <ModuleHeader icon={Plug} title="Available" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
            {available.map((integration: any) => {
              const Icon = ICON_MAP[integration.type] ?? Plug
              return (
                <div key={integration.id} className="data-cell">
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--bg-elevated)]">
                        <Icon size={20} className="text-[var(--text-tertiary)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{integration.name}</h3>
                        <span className="text-[12px] text-[var(--text-tertiary)]">Not connected</span>
                      </div>
                    </div>
                    <button className="btn-primary w-full text-[13px] py-2">Connect</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Settings Drawer (Edit 6) */}
      {settingsDrawer && (
        <IntegrationSettingsDrawer
          integration={settingsDrawer}
          onClose={() => setSettingsDrawer(null)}
        />
      )}

      {/* Edit Modal (Edit 6) */}
      {editModal && (
        <IntegrationEditModal
          integration={editModal}
          onClose={() => setEditModal(null)}
        />
      )}
    </div>
  )
}
