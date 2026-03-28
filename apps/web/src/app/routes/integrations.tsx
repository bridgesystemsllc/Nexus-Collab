import { Database, Mail, MessageCircle, Cloud, ShoppingCart, Hash, RefreshCw, Plug } from 'lucide-react'
import { useIntegrations, useSyncIntegration } from '@/hooks/useData'
import { formatDistanceToNow } from 'date-fns'

const ICON_MAP: Record<string, typeof Database> = {
  ERP_KAREVE_SYNC: Database,
  MICROSOFT_OUTLOOK: Mail,
  MICROSOFT_TEAMS: MessageCircle,
  MICROSOFT_ONEDRIVE: Cloud,
  AMAZON_VENDOR_CENTRAL: ShoppingCart,
  SLACK: Hash,
}

export function IntegrationsPage() {
  const { data: integrations, isLoading } = useIntegrations()
  const syncMutation = useSyncIntegration()

  const integrationList = Array.isArray(integrations) ? integrations : []
  const connected = integrationList.filter((i: any) => i.status === 'CONNECTED')
  const available = integrationList.filter((i: any) => i.status !== 'CONNECTED')

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Integrations Hub
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
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
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
            Connected
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
            {connected.map((integration: any) => {
              const Icon = ICON_MAP[integration.type] ?? Plug
              const lastSync = integration.lastSyncAt
                ? formatDistanceToNow(new Date(integration.lastSyncAt), { addSuffix: true })
                : 'Never'

              return (
                <div
                  key={integration.id}
                  className="data-cell relative overflow-hidden"
                >
                  {/* Green status bar */}
                  <div
                    className="absolute top-0 left-0 right-0 h-[3px]"
                    style={{ background: 'var(--success)' }}
                  />

                  <div className="relative z-10">
                    {/* Icon + Name + Status */}
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: 'var(--accent-subtle)' }}
                      >
                        <Icon className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {integration.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="pulse-dot" style={{ background: 'var(--success)' }} />
                          <span className="text-xs" style={{ color: 'var(--success)' }}>
                            Connected
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center justify-between text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
                      <span>{(integration.syncCount ?? 0).toLocaleString()} synced</span>
                      <span>Last sync: {lastSync}</span>
                    </div>

                    {/* Sync Button */}
                    <button
                      onClick={() => syncMutation.mutate(integration.type)}
                      disabled={syncMutation.isPending}
                      className="btn-ghost w-full flex items-center justify-center gap-2 text-sm"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`}
                      />
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
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
            Available
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
            {available.map((integration: any) => {
              const Icon = ICON_MAP[integration.type] ?? Plug

              return (
                <div key={integration.id} className="data-cell" style={{ opacity: 0.7 }}>
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: 'var(--bg-elevated)' }}
                      >
                        <Icon className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {integration.name}
                        </h3>
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          Not connected
                        </span>
                      </div>
                    </div>

                    <button className="btn-primary w-full text-sm py-2">
                      Connect
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
