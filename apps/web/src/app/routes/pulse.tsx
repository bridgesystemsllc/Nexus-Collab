import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Heart,
  Megaphone,
  Plus,
  Radio,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { usePulse, useMarkPulseRead, useMarkAllPulseRead } from '@/hooks/useData'
import { useUserStore } from '@/stores/userStore'
import { ModuleHeader } from '@/components/ModuleHeader'

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
  const currentUser = useUserStore((s) => s.currentUser)
  const firstName = currentUser?.firstName || 'User'

  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    if (activeTab !== 'ALL') f.type = activeTab
    // Pass userId for server-side filtering (Edit 8)
    if (currentUser?.id) f.userId = currentUser.id
    return f
  }, [activeTab, currentUser?.id])

  const { data: pulses, isLoading } = usePulse(
    Object.keys(filters).length > 0 ? filters : undefined
  )
  const markRead = useMarkPulseRead()
  const markAllRead = useMarkAllPulseRead()

  const items = (Array.isArray(pulses) ? pulses : (pulses as any)?.pulses ?? []) as any[]
  const unreadCount = items.filter((p: any) => !p.readAt).length

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header — user-scoped */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            {firstName}'s Pulses
          </h1>
          {unreadCount > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold text-white"
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
            className="btn-ghost flex items-center gap-2 text-[13px]"
          >
            <CheckCheck size={14} />
            Mark All Read
          </button>
        )}
      </div>

      {/* Type Filter Tabs */}
      <div className="flex gap-1 p-1 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-[8px] text-[13px] font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-[var(--accent)] text-white shadow-md'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
            }`}
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
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: `${config.color}20` }}
                  >
                    <Icon size={14} style={{ color: config.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-[14px] leading-relaxed ${isUnread ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                      {pulse.message}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      {pulse.deptName && (
                        <span className="badge badge-info text-[10px]">{pulse.deptName}</span>
                      )}
                      {timestamp && (
                        <span className="text-[11px] text-[var(--text-tertiary)]">{timestamp}</span>
                      )}
                    </div>
                  </div>

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

      {/* Empty State — elegant (Edit 8) */}
      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center mb-4">
            <Bell size={24} className="text-[var(--accent)]" />
          </div>
          <p className="text-[17px] font-semibold text-[var(--text-primary)] tracking-[-0.02em]">
            No active pulses
          </p>
          <p className="text-[14px] text-[var(--text-secondary)] mt-1 mb-4">
            You're all caught up. Create a new pulse to notify your team.
          </p>
          <button className="btn-primary flex items-center gap-2 text-[14px]">
            <Plus size={14} />
            Create Pulse
          </button>
        </div>
      )}
    </div>
  )
}
