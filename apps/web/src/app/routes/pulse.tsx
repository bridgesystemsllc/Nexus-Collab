import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  Radio,
  Heart,
  Megaphone,
  Bell,
  CheckCheck,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { usePulse, useMarkPulseRead, useMarkAllPulseRead } from '@/hooks/useData'

type PulseType = 'ALL' | 'ALERT' | 'SIGNAL' | 'HEARTBEAT' | 'BROADCAST'

const TABS: { key: PulseType; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'ALERT', label: 'Alerts' },
  { key: 'SIGNAL', label: 'Signals' },
  { key: 'HEARTBEAT', label: 'Heartbeats' },
  { key: 'BROADCAST', label: 'Broadcasts' },
]

const TYPE_CONFIG: Record<
  string,
  { icon: typeof AlertTriangle; color: string }
> = {
  ALERT: { icon: AlertTriangle, color: '#FF453A' },
  SIGNAL: { icon: Radio, color: '#FF9F0A' },
  HEARTBEAT: { icon: Heart, color: '#32D74B' },
  BROADCAST: { icon: Megaphone, color: '#64D2FF' },
}

export function PulsePage() {
  const [activeTab, setActiveTab] = useState<PulseType>('ALL')

  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    if (activeTab !== 'ALL') f.type = activeTab
    return f
  }, [activeTab])

  const { data: pulses, isLoading } = usePulse(
    Object.keys(filters).length > 0 ? filters : undefined
  )
  const markRead = useMarkPulseRead()
  const markAllRead = useMarkAllPulseRead()

  const items = (Array.isArray(pulses) ? pulses : (pulses as any)?.pulses ?? []) as any[]
  const unreadCount = items.filter((p: any) => !p.readAt).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Pulse
          </h1>
          {unreadCount > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-bold text-white"
              style={{ background: 'var(--accent)' }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <CheckCheck className="w-4 h-4" />
            Mark All Read
          </button>
        )}
      </div>

      {/* Type Filter Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-surface)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={{
              background: activeTab === tab.key ? 'var(--accent)' : 'transparent',
              color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      )}

      {/* Notification List */}
      {!isLoading && items.length > 0 && (
        <div className="space-y-2 stagger">
          {items.map((pulse: any) => {
            const config = TYPE_CONFIG[pulse.type] ?? {
              icon: Bell,
              color: 'var(--text-tertiary)',
            }
            const Icon = config.icon
            const isUnread = !pulse.readAt
            const timestamp = pulse.createdAt
              ? formatDistanceToNow(new Date(pulse.createdAt), { addSuffix: true })
              : ''

            return (
              <div
                key={pulse.id}
                className="data-cell flex gap-4 cursor-pointer"
                style={{
                  borderLeftWidth: isUnread ? '3px' : '1px',
                  borderLeftColor: isUnread ? config.color : 'var(--border-subtle)',
                  background: isUnread ? 'var(--bg-surface)' : 'var(--bg-overlay)',
                }}
                onClick={() => {
                  if (isUnread) markRead.mutate(pulse.id)
                }}
              >
                <div className="relative z-10 flex gap-4 w-full">
                  {/* Type Icon */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: `${config.color}20` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: config.color }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm leading-relaxed"
                      style={{
                        color: isUnread ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontWeight: isUnread ? 500 : 400,
                      }}
                    >
                      {pulse.message}
                    </p>

                    <div className="flex items-center gap-3 mt-1.5">
                      {pulse.deptName && (
                        <span className="badge badge-info text-[10px]">{pulse.deptName}</span>
                      )}
                      {timestamp && (
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {timestamp}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Unread dot */}
                  {isUnread && (
                    <div className="flex-shrink-0 mt-1">
                      <div className="pulse-dot" style={{ background: config.color }} />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-tertiary)' }}>
          <Bell className="w-12 h-12 mb-4 opacity-40" />
          <p className="text-lg font-medium">No notifications</p>
          <p className="text-sm mt-1">You are all caught up</p>
        </div>
      )}
    </div>
  )
}
