import { useState, useEffect, useMemo } from 'react'
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cloud,
  Copy,
  Database,
  ExternalLink,
  Globe,
  Hash,
  History,
  Key,
  Link2,
  Lock,
  Mail,
  MessageCircle,
  Pause,
  Pencil,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Route,
  Server,
  Settings,
  ShoppingCart,
  Table2,
  Trash2,
  Unplug,
  Upload,
  Webhook,
  X,
  Zap,
} from 'lucide-react'
import {
  useIntegrations,
  useSyncIntegration,
  useDepartments,
  useErpRouting,
  useUpdateErpRouting,
  useErpOutbound,
  useUpdateErpOutbound,
  usePushToErp,
  useConnectorCatalog,
  useCreateConnector,
  useTestConnector,
  usePauseConnector,
  useResumeConnector,
  useDeleteConnector,
  useAutomations,
  useCreateAutomation,
  useUpdateAutomation,
  useDeleteAutomation,
  usePauseAutomation,
  useResumeAutomation,
  useActivateAutomation,
  useRunAutomation,
  useAutomationRuns,
  type ErpRoutingFeed,
  type ErpRoutingPatch,
  type ErpOutboundFeed,
  type ErpOutboundPatch,
  type ErpPushResponse,
  type ConnectorDefinition,
  type Automation,
  type AutomationRun,
} from '@/hooks/useData'
import { useUserStore } from '@/stores/userStore'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ConnectMicrosoft } from '@/components/shared/ConnectMicrosoft'
import { formatDistanceToNow } from 'date-fns'
import { Dialog } from '@/components/Dialog'
import { ModuleHeader } from '@/components/ModuleHeader'

// ─── Maps ────────────────────────────────────────────────────

const ICON_MAP: Record<string, typeof Database> = {
  ERP_KAREVE_SYNC: Database,
  MICROSOFT_OUTLOOK: Mail,
  MICROSOFT_TEAMS: MessageCircle,
  MICROSOFT_ONEDRIVE: Cloud,
  AMAZON_VENDOR_CENTRAL: ShoppingCart,
  SLACK: Hash,
  GOOGLE_GMAIL: Mail,
  GOOGLE_SHEETS: Table2,
  ZAPIER: Zap,
}

const AUTH_GROUP: Record<string, string> = {
  MICROSOFT_OUTLOOK: 'microsoft',
  MICROSOFT_TEAMS: 'microsoft',
  MICROSOFT_ONEDRIVE: 'microsoft',
  GOOGLE_GMAIL: 'google',
  GOOGLE_SHEETS: 'google',
}

// ─── ERP Settings Section (editable API URL + Key) ───────────

function ErpSettingsSection({
  integration,
  onTestConnection,
  testing,
  testResult,
}: {
  integration: any
  onTestConnection: () => void
  testing: boolean
  testResult: { ok: boolean; message: string } | null
}) {
  const [editing, setEditing] = useState(false)
  const [apiUrl, setApiUrl] = useState(integration.config?.apiUrl || '')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      const { data } = await api.post('/integrations/ERP_KAREVE_SYNC/connect', {
        apiUrl: apiUrl.trim(),
        apiKey: apiKey.trim() || undefined,
      })
      setSaveMsg(
        data?.live
          ? 'Credentials updated — live data verified'
          : data?.error || 'Saved, but live ERP data could not be verified',
      )
      setEditing(false)
      setApiKey('')
    } catch (err: any) {
      setSaveMsg(err?.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">ERP Configuration</h3>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-[12px] text-[var(--accent)] font-medium hover:underline">
            Edit Credentials
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              API URL
            </label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://erp.kareve.com/api/v1"
              className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              API Key <span className="normal-case text-[var(--text-tertiary)]">(leave blank to keep current)</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter new API key"
              className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !apiUrl.trim()}
              className="btn-primary text-[13px] px-4 py-2 disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Save Credentials'}
            </button>
            <button onClick={() => { setEditing(false); setApiUrl(integration.config?.apiUrl || ''); setApiKey('') }} className="btn-ghost text-[13px] px-3 py-2">
              Cancel
            </button>
          </div>
          {saveMsg && (
            <p className={`text-[12px] ${saveMsg.includes('updated') ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              {saveMsg}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em]">API URL</p>
            <p className="text-[13px] text-[var(--text-primary)] mt-1 font-mono">{integration.config?.apiUrl || 'Not configured'}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em]">API Key</p>
            <p className="text-[13px] text-[var(--text-secondary)] mt-1 font-mono flex items-center gap-1.5">
              <Key size={12} />
              {integration.config?.apiKey ? '••••••••' + String(integration.config.apiKey).slice(-4) : 'Not configured'}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-[var(--border-subtle)]">
        <button
          onClick={onTestConnection}
          disabled={testing}
          className="btn-ghost text-[13px] flex items-center gap-2"
        >
          <RefreshCw size={13} className={testing ? 'animate-spin' : ''} />
          Test Connection
        </button>
        {testResult && (
          <p className={`text-[12px] flex items-center gap-1 ${testResult.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {testResult.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {testResult.message}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── ERP Data Routing Section ────────────────────────────────
// Lets an admin map each ERP feed to a Nexus module and toggle it on/off.
// Non-admins see it read-only (controls disabled + an "Admin only" note).

interface ModuleTarget {
  id: string
  type: string
  name: string
  department: string
}

function useModuleTargets(): ModuleTarget[] {
  const { data: departments } = useDepartments()
  const list = Array.isArray(departments) ? departments : []
  const targets: ModuleTarget[] = []
  for (const dept of list) {
    for (const mod of dept.modules ?? []) {
      targets.push({ id: mod.id, type: mod.type, name: mod.name, department: dept.name })
    }
  }
  return targets
}

function ToggleSwitch({
  on,
  onChange,
  disabled,
}: {
  on: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
        on ? 'bg-[var(--success)]' : 'bg-[var(--border-default)]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      aria-pressed={on}
    >
      <div
        className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-[18px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  )
}

// A single editable feed row. Tracks pending edits via the parent's draft map.
function RoutingFeedRow({
  feed,
  draft,
  targets,
  editable,
  onChange,
}: {
  feed: ErpRoutingFeed
  draft: ErpRoutingPatch[string] | undefined
  targets: ModuleTarget[]
  editable: boolean
  onChange: (patch: ErpRoutingPatch[string]) => void
}) {
  const [advanced, setAdvanced] = useState(false)

  // Effective values = server value overridden by any pending draft edit.
  const enabled = draft?.enabled ?? feed.enabled
  const targetModuleId =
    draft && 'targetModuleId' in draft ? draft.targetModuleId : feed.targetModuleId
  const erpPath = draft && 'erpPath' in draft ? draft.erpPath : feed.erpPath
  const defaultType = feed.targetModuleType || 'auto'

  return (
    <div className="p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">{feed.label}</p>
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{feed.description}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-[10px] ${enabled ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'}`}>
            {enabled ? 'On' : 'Off'}
          </span>
          <ToggleSwitch
            on={enabled}
            disabled={!editable}
            onChange={(next) => onChange({ ...draft, enabled: next })}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] w-[44px] flex-shrink-0">
          Route to
        </span>
        <div className="relative flex-1">
          <select
            value={targetModuleId ?? ''}
            disabled={!editable || !enabled}
            onChange={(e) => {
              const v = e.target.value
              const next: ErpRoutingPatch[string] = { ...draft }
              if (v === '') {
                next.targetModuleId = null
                next.targetModuleType = null
              } else {
                const t = targets.find((m) => m.id === v)
                next.targetModuleId = v
                if (t) next.targetModuleType = t.type
              }
              onChange(next)
            }}
            className="w-full appearance-none pl-3 pr-8 py-2 rounded-[8px] text-[12px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Default ({defaultType})</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.department} — {t.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none"
          />
        </div>
      </div>

      {/* Advanced: ERP path override */}
      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] mt-2 flex items-center gap-1"
      >
        <ChevronDown size={11} className={`transition-transform ${advanced ? 'rotate-180' : ''}`} />
        Advanced
      </button>
      {advanced && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] w-[44px] flex-shrink-0">
            ERP path
          </span>
          <input
            type="text"
            value={erpPath ?? ''}
            disabled={!editable}
            placeholder={`/${feed.key}`}
            onChange={(e) => onChange({ ...draft, erpPath: e.target.value })}
            className="flex-1 px-3 py-1.5 rounded-[8px] text-[12px] font-mono outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors disabled:opacity-50"
          />
        </div>
      )}
    </div>
  )
}

function ErpDataRoutingSection() {
  const role = useUserStore((s) => s.currentUser?.role)
  // Admin/OPS_MANAGER can edit. Unknown role in dev → treat as editable.
  const editable = role == null || role === 'ADMIN' || role === 'OPS_MANAGER'

  const { data, isLoading, isError } = useErpRouting()
  const targets = useModuleTargets()
  const updateRouting = useUpdateErpRouting()

  // Pending edits keyed by feed key; only changed feeds are sent on save.
  const [draft, setDraft] = useState<ErpRoutingPatch>({})
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const feeds = data?.feeds ?? []
  const dirty = Object.keys(draft).length > 0
  const enabledCount = feeds.filter((f) => draft[f.key]?.enabled ?? f.enabled).length

  const handleSave = async () => {
    setMsg(null)
    try {
      await updateRouting.mutateAsync(draft)
      setDraft({})
      setMsg({ type: 'success', text: 'Data routing saved' })
    } catch (err: any) {
      const status = err?.response?.status
      setMsg({
        type: 'error',
        text: status === 403 ? 'Admin access required' : err?.response?.data?.error || 'Failed to save routing',
      })
    }
  }

  return (
    <div className="p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Route size={15} className="text-[var(--accent)]" />
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Data Routing</h3>
        </div>
        {!editable && (
          <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
            <Lock size={11} /> Admin only
          </span>
        )}
      </div>
      <p className="text-[12px] text-[var(--text-secondary)]">
        Choose which ERP feeds flow into which Nexus modules. Only enabled feeds sync.
      </p>

      {isLoading && <div className="skeleton h-24 rounded-[10px]" />}
      {isError && (
        <p className="text-[12px] text-[var(--text-tertiary)]">Routing configuration unavailable.</p>
      )}

      {!isLoading && !isError && feeds.length > 0 && (
        <>
          <div className="space-y-2">
            {feeds.map((feed) => (
              <RoutingFeedRow
                key={feed.key}
                feed={feed}
                draft={draft[feed.key]}
                targets={targets}
                editable={editable}
                onChange={(patch) => setDraft((d) => ({ ...d, [feed.key]: patch }))}
              />
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
              {enabledCount} of {feeds.length} feeds syncing
            </span>
            <div className="flex items-center gap-3">
              {msg && (
                <span
                  className={`text-[12px] flex items-center gap-1 ${
                    msg.type === 'success' ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                  }`}
                >
                  {msg.type === 'success' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {msg.text}
                </span>
              )}
              {editable && (
                <button
                  onClick={handleSave}
                  disabled={!dirty || updateRouting.isPending}
                  className="btn-primary text-[13px] px-4 py-2 disabled:opacity-40"
                >
                  {updateRouting.isPending ? 'Saving...' : 'Save Routing'}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Outbound to ERP Section ─────────────────────────────────
// Lets an admin control which Nexus feeds (components / boms / finance) may push
// TO the ERP, edit each feed's ERP path, and trigger a manual push. Non-admins
// see it read-only (controls disabled + an "Admin only" note). When the ERP is
// not connected, a push returns dryRun results describing what WOULD be sent.

// A single editable outbound feed row. Tracks pending edits via the parent draft.
function OutboundFeedRow({
  feed,
  draft,
  editable,
  result,
  onChange,
}: {
  feed: ErpOutboundFeed
  draft: ErpOutboundPatch[string] | undefined
  editable: boolean
  result: ErpPushResponse['feeds'][string] | undefined
  onChange: (patch: ErpOutboundPatch[string]) => void
}) {
  const [advanced, setAdvanced] = useState(false)

  // Effective values = server value overridden by any pending draft edit.
  const enabled = draft?.enabled ?? feed.enabled
  const erpPath = draft && 'erpPath' in draft ? draft.erpPath : feed.erpPath

  return (
    <div className="p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">{feed.label}</p>
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{feed.description}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">{feed.itemCount} items</span>
          <span className={`text-[10px] ${enabled ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'}`}>
            {enabled ? 'On' : 'Off'}
          </span>
          <ToggleSwitch
            on={enabled}
            disabled={!editable}
            onChange={(next) => onChange({ ...draft, enabled: next })}
          />
        </div>
      </div>

      {/* Per-feed push result (set after a "Push now"). */}
      {result && (
        <p
          className={`text-[11px] mt-2 flex items-center gap-1 ${
            result.error
              ? 'text-[var(--danger)]'
              : result.dryRun
                ? 'text-[var(--text-secondary)]'
                : 'text-[var(--success)]'
          }`}
        >
          {result.error ? (
            <AlertTriangle size={11} />
          ) : result.dryRun ? null : (
            <CheckCircle2 size={11} />
          )}
          {result.error
            ? result.error
            : result.dryRun
              ? `Dry run (ERP not connected): ${result.count} would send`
              : `Pushed ${result.count}`}
        </p>
      )}

      {/* Advanced: ERP path override */}
      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] mt-2 flex items-center gap-1"
      >
        <ChevronDown size={11} className={`transition-transform ${advanced ? 'rotate-180' : ''}`} />
        Advanced
      </button>
      {advanced && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] w-[44px] flex-shrink-0">
            ERP path
          </span>
          <input
            type="text"
            value={erpPath ?? ''}
            disabled={!editable}
            placeholder={`/${feed.key}`}
            onChange={(e) => onChange({ ...draft, erpPath: e.target.value })}
            className="flex-1 px-3 py-1.5 rounded-[8px] text-[12px] font-mono outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors disabled:opacity-50"
          />
        </div>
      )}
    </div>
  )
}

function ErpOutboundSection() {
  const role = useUserStore((s) => s.currentUser?.role)
  // Admin/OPS_MANAGER can edit. Unknown role in dev → treat as editable.
  const editable = role == null || role === 'ADMIN' || role === 'OPS_MANAGER'

  const { data, isLoading, isError } = useErpOutbound()
  const updateOutbound = useUpdateErpOutbound()
  const pushToErp = usePushToErp()

  // Pending edits keyed by feed key; only changed feeds are sent on save.
  const [draft, setDraft] = useState<ErpOutboundPatch>({})
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  // Results from the last push, keyed by feed key.
  const [pushResults, setPushResults] = useState<ErpPushResponse['feeds']>({})

  const feeds = data?.feeds ?? []
  const dirty = Object.keys(draft).length > 0
  const enabledKeys = feeds.filter((f) => draft[f.key]?.enabled ?? f.enabled).map((f) => f.key)

  const handleSave = async () => {
    setMsg(null)
    try {
      await updateOutbound.mutateAsync(draft)
      setDraft({})
      setMsg({ type: 'success', text: 'Outbound config saved' })
    } catch (err: any) {
      const status = err?.response?.status
      setMsg({
        type: 'error',
        text: status === 403 ? 'Admin access required' : err?.response?.data?.error || 'Failed to save',
      })
    }
  }

  const handlePush = async () => {
    setMsg(null)
    setPushResults({})
    try {
      const res = await pushToErp.mutateAsync({ feeds: enabledKeys })
      setPushResults(res.feeds ?? {})
    } catch (err: any) {
      const status = err?.response?.status
      setMsg({
        type: 'error',
        text: status === 403 ? 'Admin access required' : err?.response?.data?.error || 'Push failed',
      })
    }
  }

  return (
    <div className="p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Upload size={15} className="text-[var(--accent)]" />
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Outbound to ERP</h3>
        </div>
        {!editable && (
          <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
            <Lock size={11} /> Admin only
          </span>
        )}
      </div>
      <p className="text-[12px] text-[var(--text-secondary)]">
        Choose which Nexus modules may push data to the ERP, then push on demand.
      </p>

      {isLoading && <div className="skeleton h-24 rounded-[10px]" />}
      {isError && (
        <p className="text-[12px] text-[var(--text-tertiary)]">Outbound configuration unavailable.</p>
      )}

      {!isLoading && !isError && feeds.length > 0 && (
        <>
          <div className="space-y-2">
            {feeds.map((feed) => (
              <OutboundFeedRow
                key={feed.key}
                feed={feed}
                draft={draft[feed.key]}
                editable={editable}
                result={pushResults[feed.key]}
                onChange={(patch) => setDraft((d) => ({ ...d, [feed.key]: patch }))}
              />
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
              {enabledKeys.length} of {feeds.length} feeds enabled
            </span>
            <div className="flex items-center gap-3">
              {msg && (
                <span
                  className={`text-[12px] flex items-center gap-1 ${
                    msg.type === 'success' ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                  }`}
                >
                  {msg.type === 'success' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {msg.text}
                </span>
              )}
              {editable && (
                <>
                  <button
                    onClick={handleSave}
                    disabled={!dirty || updateOutbound.isPending}
                    className="btn-ghost text-[13px] px-4 py-2 disabled:opacity-40"
                  >
                    {updateOutbound.isPending ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={handlePush}
                    disabled={enabledKeys.length === 0 || pushToErp.isPending}
                    className="btn-primary text-[13px] px-4 py-2 flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Upload size={13} className={pushToErp.isPending ? 'animate-pulse' : ''} />
                    {pushToErp.isPending ? 'Pushing...' : 'Push now'}
                  </button>
                </>
              )}
            </div>
          </div>

          <p className="text-[11px] text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-subtle)]">
            Only enabled feeds push; pushes are manual.
          </p>
        </>
      )}
    </div>
  )
}

// ─── Integration Settings Drawer ─────────────────────────────

function IntegrationSettingsDrawer({
  integration,
  onClose,
  onDisconnect,
  onReconnect,
}: {
  integration: any
  onClose: () => void
  onDisconnect: (integration: any) => void
  onReconnect: (integration: any) => void
}) {
  const [enabled, setEnabled] = useState(integration.status === 'CONNECTED' || integration.status === 'SYNCING')
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const group = AUTH_GROUP[integration.type]
  const isOAuth = group === 'microsoft' || group === 'google'
  const isZapier = integration.type === 'ZAPIER'
  const isErp = integration.type === 'ERP_KAREVE_SYNC'

  // Live ERP routing — drives the incoming-data list below.
  const { data: erpRouting } = useErpRouting(isErp && (integration.status === 'CONNECTED' || integration.status === 'SYNCING'))
  const moduleTargets = useModuleTargets()
  const moduleNameById = new Map(moduleTargets.map((t) => [t.id, `${t.department} — ${t.name}`]))

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const { data } = await api.post(`/integrations/${integration.type}/test`)
      setTestResult({ ok: true, message: data?.message || 'Connection successful' })
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err?.response?.data?.error || 'Connection failed',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={true} onClose={onClose} title={`${integration.name} Settings`} subtitle="Configure sync and data mapping" wide>
      <div className="space-y-6">
        {/* Status */}
        <div className="flex items-center justify-between p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <div>
            <p className="text-[14px] font-medium text-[var(--text-primary)]">Integration Status</p>
            <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
              {integration.status === 'SYNCING'
                ? 'Sync in progress…'
                : integration.status === 'CONNECTED'
                  ? integration.config?.liveVerified
                    ? 'Live ERP data verified'
                    : 'Connected — sample data mode (live ERP not verified)'
                  : 'Not connected'}
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

        {/* Type-specific info */}
        {isZapier && (
          <div className="p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Zapier Details</h3>
            <div>
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em]">Webhook URL</p>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1 font-mono break-all">
                {integration.config?.webhookUrl || 'Not available'}
              </p>
            </div>
            {integration.config?.lastReceivedAt && (
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em]">Last Received</p>
                <p className="text-[13px] text-[var(--text-secondary)] mt-1">
                  {formatDistanceToNow(new Date(integration.config.lastReceivedAt), { addSuffix: true })}
                </p>
              </div>
            )}
          </div>
        )}

        {isErp && (
          <ErpSettingsSection
            integration={integration}
            onTestConnection={handleTestConnection}
            testing={testing}
            testResult={testResult}
          />
        )}

        {isErp && integration.status === 'CONNECTED' && <ErpDataRoutingSection />}

        {isOAuth && (
          <div className="p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">OAuth Connection</h3>
            <p className="text-[12px] text-[var(--text-secondary)]">
              Connected via {group === 'microsoft' ? 'Microsoft' : 'Google'} OAuth 2.0
            </p>
            <button
              onClick={() => onReconnect(integration)}
              className="btn-ghost text-[13px] flex items-center gap-2"
            >
              <RefreshCw size={13} />
              Reconnect
            </button>
          </div>
        )}

        {/* Incoming Sync — live for ERP (driven by Data Routing), static otherwise */}
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">Incoming Data</h3>
          <div className="space-y-2">
            {isErp ? (
              (erpRouting?.feeds ?? []).length > 0 ? (
                erpRouting!.feeds.map((feed) => {
                  const target = feed.targetModuleId
                    ? moduleNameById.get(feed.targetModuleId) ?? feed.targetModuleType ?? 'module'
                    : `Default (${feed.targetModuleType || 'auto'})`
                  return (
                    <div key={feed.key} className="flex items-center justify-between p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <span className="text-[13px] text-[var(--text-primary)]">{feed.label}</span>
                      {feed.enabled ? (
                        <span className="badge badge-healthy text-[10px]">Syncing to {target}</span>
                      ) : (
                        <span className="badge badge-accent text-[10px]">Off</span>
                      )}
                    </div>
                  )
                })
              ) : (
                <p className="text-[12px] text-[var(--text-tertiary)] px-1">
                  Configure feeds in Data Routing above.
                </p>
              )
            ) : (
              [
                { name: 'Tasks', status: 'Syncing' },
                { name: 'Calendar Events', status: 'Syncing' },
                { name: 'Contacts', status: 'Syncing' },
                { name: 'Messages', status: 'Syncing' },
              ].map((item) => (
                <div key={item.name} className="flex items-center justify-between p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                  <span className="text-[13px] text-[var(--text-primary)]">{item.name}</span>
                  <span className="badge badge-healthy text-[10px]">{item.status}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Outgoing Sync — live "Outbound to ERP" for ERP, static otherwise */}
        {isErp ? (
          <ErpOutboundSection />
        ) : (
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">Outgoing Data</h3>
            <div className="space-y-2">
              {[
                { name: 'Task Updates', status: 'Enabled' },
                { name: 'Status Changes', status: 'Enabled' },
                { name: 'Activity Logs', status: 'Enabled' },
              ].map((item) => (
                <div key={item.name} className="flex items-center justify-between p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                  <span className="text-[13px] text-[var(--text-primary)]">{item.name}</span>
                  <span className="badge badge-info text-[10px]">{item.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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
              <p className="text-[14px] text-[var(--text-primary)] mt-1">
                {isOAuth ? 'OAuth 2.0' : isZapier ? 'Webhook' : isErp ? 'API Key' : 'Direct'}
              </p>
            </div>
          </div>
        </div>

        {/* Disconnect */}
        <button
          onClick={() => { onDisconnect(integration); onClose() }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-[var(--danger)] border border-[var(--danger)]/20 hover:bg-[var(--danger)]/5 transition-colors"
        >
          <Unplug size={14} />
          Disconnect Integration
        </button>
      </div>
    </Dialog>
  )
}

// ─── Integration Edit Modal ──────────────────────────────────

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

// ─── Zapier Webhook Modal ────────────────────────────────────

function ZapierWebhookModal({
  webhookUrl,
  onClose,
}: {
  webhookUrl: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={true} onClose={onClose} title="Zapier Connected" subtitle="Your webhook is ready to use">
      <div className="space-y-4">
        <p className="text-[13px] text-[var(--text-secondary)]">
          Paste this URL into your Zapier webhook trigger to send data to Nexus Collab.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={webhookUrl}
            className="flex-1 px-3 py-2.5 rounded-[10px] text-[13px] font-mono outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
          />
          <button
            onClick={handleCopy}
            className="btn-ghost flex items-center gap-1.5 text-[13px] px-3 py-2.5 whitespace-nowrap"
          >
            <Copy size={13} />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <button onClick={onClose} className="btn-primary w-full text-[14px]">Done</button>
      </div>
    </Dialog>
  )
}

// ─── ERP Config Modal ────────────────────────────────────────

function ErpConfigModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: (message?: string) => void
}) {
  const [apiUrl, setApiUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      // Save the credentials AND validate them against the real ERP in one
      // round trip. /connect now returns `live` (whether the ERP actually
      // returned data) plus a precise error on failure (e.g. HTTP 401 = the ERP
      // rejected the API key), so we give an honest result instead of always
      // reporting success.
      const { data } = await api.post('/integrations/ERP_KAREVE_SYNC/connect', { apiUrl, apiKey })
      if (data?.live) {
        onSuccess(data?.message || 'ERP connected — live data verified.')
        onClose()
      } else {
        // Credentials are saved (sample-data sync still works), but live ERP
        // data could not be verified — surface exactly why so the user can fix it.
        setError(
          data?.error ||
            'Credentials saved, but live ERP data could not be verified. Check the API URL and key.',
        )
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          'Connection failed. Check your credentials and try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={true} onClose={onClose} title="Connect ERP — Kareve Sync" subtitle="Enter your ERP API credentials">
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
            API URL
          </label>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://erp.example.com/api"
            className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key"
            className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
          />
        </div>
        {error && (
          <p className="text-[12px] text-[var(--danger)] flex items-center gap-1.5">
            <AlertTriangle size={12} />
            {error}
          </p>
        )}
        <button
          onClick={handleSubmit}
          disabled={loading || !apiUrl || !apiKey}
          className="btn-primary w-full text-[14px] disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'Test & Connect'}
        </button>
      </div>
    </Dialog>
  )
}

// ─── OAuth Setup Modal ───────────────────────────────────────

const PROVIDER_DOCS: Record<string, { label: string; docsUrl: string; steps: string[] }> = {
  microsoft: {
    label: 'Microsoft',
    docsUrl: 'https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    steps: [
      'Go to Azure Portal → App registrations → New registration',
      'Set the Redirect URI to your app URL + /auth/callback/microsoft',
      'Under Certificates & secrets, create a new client secret',
      'Copy the Application (client) ID, Directory (tenant) ID, and client secret value',
      'Add the 4 secrets below to your Replit project secrets',
    ],
  },
  google: {
    label: 'Google',
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
    steps: [
      'Go to Google Cloud Console → APIs & Services → Credentials',
      'Create OAuth 2.0 Client ID → Web application',
      'Add your app URL + /auth/callback/google as an authorized redirect URI',
      'Copy the Client ID and Client Secret',
      'Add the 3 secrets below to your Replit project secrets',
    ],
  },
}

function OAuthSetupModal({
  provider,
  requiredVars,
  onClose,
}: {
  provider: string
  requiredVars: { key: string; description: string }[]
  onClose: () => void
}) {
  const [copied, setCopied] = useState<string | null>(null)
  const info = PROVIDER_DOCS[provider]
  if (!info) return null

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <Dialog open={true} onClose={onClose} title={`Connect ${info.label}`} subtitle="OAuth setup required" wide>
      <div className="space-y-6">
        {/* Explanation */}
        <div className="flex gap-3 p-4 rounded-[12px] bg-[var(--warning-light)] border border-[var(--warning)]">
          <Key size={18} className="text-[var(--warning)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-medium text-[var(--text-primary)]">
              OAuth credentials needed
            </p>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1">
              To connect your {info.label} account, you need to register an OAuth app and add the credentials to your Replit project secrets.
            </p>
          </div>
        </div>

        {/* Steps */}
        <div>
          <p className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Setup steps</p>
          <ol className="space-y-2">
            {info.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-[13px] text-[var(--text-primary)]">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] text-[11px] font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Required secrets */}
        <div>
          <p className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Required secrets</p>
          <div className="space-y-2">
            {requiredVars.map((v) => (
              <div key={v.key} className="flex items-center gap-3 p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-mono font-semibold text-[var(--accent)]">{v.key}</p>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 truncate">{v.description}</p>
                </div>
                <button
                  onClick={() => copy(v.key)}
                  className="p-1.5 rounded-[6px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors flex-shrink-0"
                  title="Copy key name"
                >
                  {copied === v.key ? <CheckCircle2 size={14} className="text-[var(--success)]" /> : <Copy size={14} />}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="flex gap-3 pt-2">
          <a
            href={info.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary flex items-center gap-2 text-[13px]"
          >
            <ExternalLink size={14} />
            Open {info.label} Console
          </a>
          <button onClick={onClose} className="btn-ghost text-[13px]">
            Close
          </button>
        </div>
      </div>
    </Dialog>
  )
}

// ─── Add Connector Modal ──────────────────────────────────────

function AddConnectorModal({
  catalog,
  onClose,
  onSuccess,
}: {
  catalog: ConnectorDefinition[]
  onClose: () => void
  onSuccess: (message: string) => void
}) {
  const [step, setStep] = useState<'select' | 'configure'>('select')
  const [selectedType, setSelectedType] = useState<ConnectorDefinition | null>(null)
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [authType, setAuthType] = useState<'NONE' | 'BASIC' | 'BEARER' | 'API_KEY'>('NONE')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [headerName, setHeaderName] = useState('X-API-Key')
  const [error, setError] = useState('')

  const createConnector = useCreateConnector()

  const genericTypes = catalog.filter(c => c.isGeneric)

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'GENERIC_HTTP': return Globe
      case 'GENERIC_MCP': return Server
      case 'GENERIC_WEBHOOK': return Webhook
      default: return Plug
    }
  }

  const handleCreate = async () => {
    setError('')
    if (!selectedType || !name.trim()) return

    const config: Record<string, unknown> = {}

    if (selectedType.type === 'GENERIC_HTTP' || selectedType.type === 'GENERIC_MCP') {
      if (!baseUrl.trim()) {
        setError('Base URL is required')
        return
      }
      config.baseUrl = baseUrl.trim()
      config.authType = authType

      if (authType === 'BASIC') {
        config.username = username
        config.password = password
      } else if (authType === 'BEARER') {
        config.token = token
      } else if (authType === 'API_KEY') {
        config.apiKey = apiKey
        config.headerName = headerName || 'X-API-Key'
      }
    }

    try {
      await createConnector.mutateAsync({
        type: selectedType.type,
        name: name.trim(),
        config,
      })
      onSuccess(`${name} connector created successfully`)
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create connector')
    }
  }

  return (
    <Dialog open={true} onClose={onClose} title="Add Connector" subtitle="Connect a new service to your workspace">
      {step === 'select' ? (
        <div className="space-y-4">
          <p className="text-[13px] text-[var(--text-secondary)]">
            Select a connector type to add to your organization.
          </p>
          <div className="space-y-2">
            {genericTypes.map((connector) => {
              const Icon = getTypeIcon(connector.type)
              return (
                <button
                  key={connector.type}
                  onClick={() => {
                    setSelectedType(connector)
                    setName(connector.name)
                    setStep('configure')
                  }}
                  className="w-full flex items-center gap-3 p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--accent-subtle)]">
                    <Icon size={20} className="text-[var(--accent)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[var(--text-primary)]">{connector.name}</p>
                    <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">{connector.description}</p>
                  </div>
                  <ChevronDown size={16} className="text-[var(--text-tertiary)] -rotate-90" />
                </button>
              )
            })}
          </div>
          {genericTypes.length === 0 && (
            <p className="text-[13px] text-[var(--text-tertiary)] text-center py-8">
              No connector types available.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <button
            onClick={() => setStep('select')}
            className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] flex items-center gap-1"
          >
            <ChevronDown size={12} className="rotate-90" /> Back
          </button>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              Connector Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My HTTP Connector"
              className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {(selectedType?.type === 'GENERIC_HTTP' || selectedType?.type === 'GENERIC_MCP') && (
            <>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
                  Base URL
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
                  Authentication
                </label>
                <div className="relative">
                  <select
                    value={authType}
                    onChange={(e) => setAuthType(e.target.value as typeof authType)}
                    className="w-full appearance-none px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
                  >
                    <option value="NONE">None</option>
                    <option value="BASIC">Basic Auth</option>
                    <option value="BEARER">Bearer Token</option>
                    <option value="API_KEY">API Key</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                </div>
              </div>

              {authType === 'BASIC' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
                      Username
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
                    />
                  </div>
                </div>
              )}

              {authType === 'BEARER' && (
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
                    Bearer Token
                  </label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Enter your bearer token"
                    className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
                  />
                </div>
              )}

              {authType === 'API_KEY' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
                      Header Name
                    </label>
                    <input
                      type="text"
                      value={headerName}
                      onChange={(e) => setHeaderName(e.target.value)}
                      placeholder="X-API-Key"
                      className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your API key"
                      className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {selectedType?.type === 'GENERIC_WEBHOOK' && (
            <div className="p-4 rounded-[10px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <p className="text-[13px] text-[var(--text-secondary)]">
                A unique webhook URL will be generated after creation. You can then use this URL to receive events from external services.
              </p>
            </div>
          )}

          {error && (
            <p className="text-[12px] text-[var(--danger)] flex items-center gap-1.5">
              <AlertTriangle size={12} />
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleCreate}
              disabled={createConnector.isPending || !name.trim()}
              className="btn-primary flex-1 text-[14px] disabled:opacity-50"
            >
              {createConnector.isPending ? 'Creating...' : 'Create Connector'}
            </button>
            <button onClick={onClose} className="btn-ghost text-[14px]">
              Cancel
            </button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

// ─── Automation Run History Modal ─────────────────────────────

function AutomationHistoryModal({
  automation,
  onClose,
}: {
  automation: Automation
  onClose: () => void
}) {
  const { data: runs, isLoading } = useAutomationRuns(automation.id)

  const statusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS': return { label: 'Success', className: 'badge-healthy' }
      case 'FAILED': return { label: 'Failed', className: 'badge-emergency' }
      case 'RUNNING': return { label: 'Running', className: 'badge-info' }
      case 'PENDING': return { label: 'Pending', className: 'badge-accent' }
      case 'SKIPPED': return { label: 'Skipped', className: 'badge-accent' }
      default: return { label: status, className: 'badge-accent' }
    }
  }

  return (
    <Dialog open={true} onClose={onClose} title={`Run History: ${automation.name}`} subtitle="Recent automation executions" wide>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="skeleton h-16 rounded-[10px]" />)}
          </div>
        )}

        {!isLoading && (!runs || runs.length === 0) && (
          <div className="py-8 text-center">
            <History size={32} className="text-[var(--text-tertiary)] mx-auto mb-3" />
            <p className="text-[14px] text-[var(--text-secondary)]">No runs yet</p>
            <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
              Runs will appear here once the automation is triggered.
            </p>
          </div>
        )}

        {runs && runs.length > 0 && runs.map((run: AutomationRun) => {
          const badge = statusBadge(run.status)
          const startTime = new Date(run.startedAt)
          return (
            <div key={run.id} className="p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`badge text-[10px] ${badge.className}`}>{badge.label}</span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    {run.trigger === 'SCHEDULE' && <Clock size={10} className="inline mr-1" />}
                    {run.trigger === 'WEBHOOK' && <Webhook size={10} className="inline mr-1" />}
                    {run.trigger === 'MANUAL' && <Play size={10} className="inline mr-1" />}
                    {run.trigger}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                  {formatDistanceToNow(startTime, { addSuffix: true })}
                </span>
              </div>

              <div className="flex items-center gap-4 text-[12px] text-[var(--text-secondary)]">
                {run.durationMs != null && (
                  <span className="tabular-nums">{run.durationMs}ms</span>
                )}
                {run.httpStatus != null && (
                  <span className={`tabular-nums ${run.httpStatus >= 400 ? 'text-[var(--danger)]' : ''}`}>
                    HTTP {run.httpStatus}
                  </span>
                )}
                {run.recordsProcessed > 0 && (
                  <span className="tabular-nums">{run.recordsProcessed} processed</span>
                )}
                {run.recordsFailed > 0 && (
                  <span className="tabular-nums text-[var(--danger)]">{run.recordsFailed} failed</span>
                )}
              </div>

              {run.error && (
                <p className="text-[12px] text-[var(--danger)] mt-2 font-mono break-all">
                  [{run.error.code}] {run.error.message}
                </p>
              )}

              {run.idempotencyKey && (
                <p className="text-[10px] text-[var(--text-tertiary)] mt-2 font-mono">
                  {run.idempotencyKey}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </Dialog>
  )
}

// ─── Create/Edit Automation Modal ─────────────────────────────

function AutomationModal({
  integrations,
  automation,
  onClose,
  onSuccess,
}: {
  integrations: any[]
  automation?: Automation
  onClose: () => void
  onSuccess: (message: string) => void
}) {
  const isEdit = !!automation
  const [name, setName] = useState(automation?.name || '')
  const [description, setDescription] = useState(automation?.description || '')
  // §5.2: Use connectorId not integrationId
  const [connectorId, setConnectorId] = useState(automation?.connectorId || '')
  const [triggerType, setTriggerType] = useState<'SCHEDULE' | 'WEBHOOK' | 'MANUAL'>(automation?.triggerType || 'MANUAL')
  // §5.2: Use triggerConfig.everyMinutes instead of cronExpression
  const [everyMinutes, setEveryMinutes] = useState(automation?.triggerConfig?.everyMinutes ?? 15)
  const [timezone, setTimezone] = useState(automation?.triggerConfig?.timezone || 'UTC')
  // §5.2: Use actionType and actionConfig
  const [actionType, setActionType] = useState<'HTTP_REQUEST' | 'MCP_CALL' | 'WEBHOOK_FORWARD'>(
    (automation?.actionType as 'HTTP_REQUEST' | 'MCP_CALL' | 'WEBHOOK_FORWARD') || 'HTTP_REQUEST'
  )
  const [method, setMethod] = useState((automation?.actionConfig?.method as string) || 'GET')
  const [path, setPath] = useState((automation?.actionConfig?.path as string) || '')
  // §5.2: Use retryPolicy.maxAttempts instead of maxRetries
  const [maxAttempts, setMaxAttempts] = useState(automation?.retryPolicy?.maxAttempts ?? 3)
  const [baseDelayMs, setBaseDelayMs] = useState(automation?.retryPolicy?.baseDelayMs ?? 1000)
  const [error, setError] = useState('')

  const createAutomation = useCreateAutomation()
  const updateAutomation = useUpdateAutomation()

  const genericIntegrations = useMemo(() => 
    integrations.filter((i: any) => 
      i.type?.startsWith('GENERIC_') && (i.status === 'CONNECTED' || i.status === 'SYNCING')
    ),
    [integrations]
  )

  const handleSubmit = async () => {
    setError('')
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (!connectorId && !isEdit) {
      setError('Please select a connector')
      return
    }

    // §5.2: Build triggerConfig and actionConfig
    const triggerConfig = triggerType === 'SCHEDULE' 
      ? { everyMinutes, timezone }
      : {}

    const actionConfig = {
      method,
      path: path.trim() || '/',
    }

    const retryPolicy = maxAttempts > 0 
      ? { maxAttempts, baseDelayMs, maxBackoffMs: baseDelayMs * 8 } 
      : undefined

    try {
      if (isEdit) {
        await updateAutomation.mutateAsync({
          id: automation.id,
          name: name.trim(),
          description: description.trim() || undefined,
          triggerConfig,
          actionConfig,
          retryPolicy: retryPolicy || null,
        })
        onSuccess('Automation updated successfully')
      } else {
        await createAutomation.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          connectorId,
          triggerType,
          triggerConfig,
          actionType,
          actionConfig,
          retryPolicy,
        })
        onSuccess('Automation created successfully')
      }
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.error || `Failed to ${isEdit ? 'update' : 'create'} automation`)
    }
  }

  return (
    <Dialog 
      open={true} 
      onClose={onClose} 
      title={isEdit ? 'Edit Automation' : 'Create Automation'} 
      subtitle={isEdit ? 'Modify automation settings' : 'Set up a new automated workflow'}
      wide
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Automation"
            className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
            Description <span className="normal-case">(optional)</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this automation do?"
            className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
          />
        </div>

        {!isEdit && (
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              Connector
            </label>
            <div className="relative">
              <select
                value={connectorId}
                onChange={(e) => setConnectorId(e.target.value)}
                className="w-full appearance-none px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
              >
                <option value="">Select a connector...</option>
                {genericIntegrations.map((i: any) => (
                  <option key={i.id} value={i.id}>{i.name} ({i.type.replace('GENERIC_', '')})</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
            </div>
            {genericIntegrations.length === 0 && (
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5">
                No connectors available. Create an HTTP, MCP, or Webhook connector first.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
            Trigger Type
          </label>
          <div className="flex gap-2">
            {(['MANUAL', 'SCHEDULE', 'WEBHOOK'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setTriggerType(type)}
                className={`flex-1 px-3 py-2 rounded-[8px] text-[13px] border transition-colors ${
                  triggerType === type
                    ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)]'
                    : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)]'
                }`}
              >
                {type === 'MANUAL' && <Play size={12} className="inline mr-1.5" />}
                {type === 'SCHEDULE' && <Clock size={12} className="inline mr-1.5" />}
                {type === 'WEBHOOK' && <Webhook size={12} className="inline mr-1.5" />}
                {type.charAt(0) + type.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {triggerType === 'SCHEDULE' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
                Run Every
              </label>
              <div className="flex gap-2">
                {[15, 60, 1440].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setEveryMinutes(mins)}
                    className={`flex-1 px-3 py-2 rounded-[8px] text-[13px] border transition-colors ${
                      everyMinutes === mins
                        ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)]'
                        : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)]'
                    }`}
                  >
                    {mins === 15 ? '15 min' : mins === 60 ? '1 hour' : '24 hours'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
                Timezone
              </label>
              <div className="relative">
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full appearance-none px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="America/Chicago">Central Time (CT)</option>
                  <option value="America/Denver">Mountain Time (MT)</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              HTTP Method
            </label>
            <div className="relative">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full appearance-none px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
              >
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              Path
            </label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/api/endpoint"
              className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              Max Attempts
            </label>
            <input
              type="number"
              min="0"
              max="10"
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              Base Delay (ms)
            </label>
            <input
              type="number"
              min="100"
              step="100"
              value={baseDelayMs}
              onChange={(e) => setBaseDelayMs(parseInt(e.target.value) || 1000)}
              className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors tabular-nums"
            />
          </div>
        </div>

        {error && (
          <p className="text-[12px] text-[var(--danger)] flex items-center gap-1.5">
            <AlertTriangle size={12} />
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSubmit}
            disabled={createAutomation.isPending || updateAutomation.isPending || !name.trim()}
            className="btn-primary flex-1 text-[14px] disabled:opacity-50"
          >
            {createAutomation.isPending || updateAutomation.isPending 
              ? 'Saving...' 
              : isEdit ? 'Save Changes' : 'Create Automation'}
          </button>
          <button onClick={onClose} className="btn-ghost text-[14px]">
            Cancel
          </button>
        </div>
      </div>
    </Dialog>
  )
}

// ─── Automations Panel ────────────────────────────────────────

function AutomationsPanel({
  integrations,
  onToast,
}: {
  integrations: any[]
  onToast: (toast: { type: 'success' | 'error'; message: string }) => void
}) {
  const { data: automations, isLoading } = useAutomations()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null)
  const [historyAutomation, setHistoryAutomation] = useState<Automation | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const role = useUserStore((s) => s.currentUser?.role)
  const canEdit = role == null || role === 'ADMIN' || role === 'OPS_MANAGER'

  const pauseAutomation = usePauseAutomation()
  const resumeAutomation = useResumeAutomation()
  const activateAutomation = useActivateAutomation()
  const runAutomation = useRunAutomation()
  const deleteAutomation = useDeleteAutomation()

  const handlePause = async (automation: Automation) => {
    try {
      await pauseAutomation.mutateAsync(automation.id)
      onToast({ type: 'success', message: `${automation.name} paused` })
    } catch (err: any) {
      onToast({ type: 'error', message: err?.response?.data?.error || 'Failed to pause' })
    }
  }

  const handleResume = async (automation: Automation) => {
    try {
      await resumeAutomation.mutateAsync(automation.id)
      onToast({ type: 'success', message: `${automation.name} resumed` })
    } catch (err: any) {
      onToast({ type: 'error', message: err?.response?.data?.error || 'Failed to resume' })
    }
  }

  // §5.2: POST /:id/activate for DRAFT → ACTIVE
  const handleActivate = async (automation: Automation) => {
    try {
      await activateAutomation.mutateAsync(automation.id)
      onToast({ type: 'success', message: `${automation.name} activated` })
    } catch (err: any) {
      onToast({ type: 'error', message: err?.response?.data?.error || 'Failed to activate' })
    }
  }

  // §5.2: POST /:id/run executes immediately
  const handleRun = async (automation: Automation) => {
    try {
      await runAutomation.mutateAsync(automation.id)
      onToast({ type: 'success', message: `${automation.name} executed` })
    } catch (err: any) {
      onToast({ type: 'error', message: err?.response?.data?.error || 'Failed to run' })
    }
  }

  const handleDelete = async (automation: Automation) => {
    if (!confirm(`Delete automation "${automation.name}"? This cannot be undone.`)) return
    try {
      await deleteAutomation.mutateAsync(automation.id)
      onToast({ type: 'success', message: `${automation.name} deleted` })
    } catch (err: any) {
      onToast({ type: 'error', message: err?.response?.data?.error || 'Failed to delete' })
    }
  }

  const copyWebhookUrl = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(url)
    setTimeout(() => setCopied(null), 2000)
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE': return { label: 'Active', className: 'badge-healthy' }
      case 'PAUSED': return { label: 'Paused', className: 'badge-accent' }
      case 'ERROR': return { label: 'Error', className: 'badge-emergency' }
      case 'DISABLED': return { label: 'Disabled', className: 'badge-accent' }
      default: return { label: status, className: 'badge-accent' }
    }
  }

  const triggerIcon = (type: string) => {
    switch (type) {
      case 'SCHEDULE': return Clock
      case 'WEBHOOK': return Webhook
      case 'MANUAL': return Play
      default: return Zap
    }
  }

  const automationList = Array.isArray(automations) ? automations : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">Automations</h2>
          <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
            Automated workflows powered by your connectors
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary text-[13px] flex items-center gap-1.5"
          >
            <Plus size={14} />
            New Automation
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-32 rounded-xl" />)}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && automationList.length === 0 && (
        <div className="text-center py-12 px-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <Zap size={40} className="text-[var(--text-tertiary)] mx-auto mb-4" />
          <h3 className="text-[16px] font-medium text-[var(--text-primary)]">No automations yet</h3>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1 max-w-sm mx-auto">
            Create automations to run scheduled tasks, respond to webhooks, or trigger actions manually.
          </p>
          {canEdit && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary text-[13px] mt-4"
            >
              Create your first automation
            </button>
          )}
        </div>
      )}

      {/* Automation List */}
      {!isLoading && automationList.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {automationList.map((automation: Automation) => {
            const badge = statusBadge(automation.status)
            const TriggerIcon = triggerIcon(automation.triggerType)
            // §5.2: Use connectorId instead of integrationId
            const integration = integrations.find((i: any) => i.id === automation.connectorId)

            return (
              <div key={automation.id} className="data-cell">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--accent-subtle)]">
                      <TriggerIcon size={16} className="text-[var(--accent)]" />
                    </div>
                    <div>
                      <h3 className="text-[14px] font-medium text-[var(--text-primary)]">{automation.name}</h3>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        {integration?.name || 'Unknown connector'}
                      </p>
                    </div>
                  </div>
                  <span className={`badge text-[10px] ${badge.className}`}>{badge.label}</span>
                </div>

                {automation.description && (
                  <p className="text-[12px] text-[var(--text-secondary)] mb-3 line-clamp-2">
                    {automation.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-[11px] text-[var(--text-tertiary)] mb-3">
                  <span className="flex items-center gap-1">
                    <TriggerIcon size={10} />
                    {automation.triggerType}
                  </span>
                  {automation.triggerConfig?.everyMinutes && (
                    <span className="font-mono">
                      every {automation.triggerConfig.everyMinutes === 1440 
                        ? '24h' 
                        : automation.triggerConfig.everyMinutes === 60 
                        ? '1h' 
                        : `${automation.triggerConfig.everyMinutes}m`}
                    </span>
                  )}
                  {automation.lastRunAt && (
                    <span>
                      Last run: {formatDistanceToNow(new Date(automation.lastRunAt), { addSuffix: true })}
                    </span>
                  )}
                </div>

                {automation.triggerType === 'WEBHOOK' && integration?.type === 'GENERIC_WEBHOOK' && (
                  <div className="flex items-center gap-2 mb-3 p-2 rounded-[8px] bg-[var(--bg-elevated)]">
                    <Webhook size={12} className="text-[var(--text-tertiary)] flex-shrink-0" />
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      Webhook endpoint configured on connector
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  {canEdit && (
                    <>
                      {automation.status === 'ACTIVE' ? (
                        <button
                          onClick={() => handlePause(automation)}
                          disabled={pauseAutomation.isPending}
                          className="btn-ghost text-[12px] py-1.5 flex items-center gap-1"
                        >
                          <Pause size={11} />
                          Pause
                        </button>
                      ) : (
                        <button
                          onClick={() => handleResume(automation)}
                          disabled={resumeAutomation.isPending}
                          className="btn-ghost text-[12px] py-1.5 flex items-center gap-1"
                        >
                          <Play size={11} />
                          Resume
                        </button>
                      )}
                      {automation.status === 'DRAFT' && (
                        <button
                          onClick={() => handleActivate(automation)}
                          disabled={activateAutomation.isPending}
                          className="btn-ghost text-[12px] py-1.5 flex items-center gap-1 text-[var(--success)]"
                        >
                          <CheckCircle2 size={11} />
                          Activate
                        </button>
                      )}
                      <button
                        onClick={() => handleRun(automation)}
                        disabled={runAutomation.isPending || (automation.status !== 'ACTIVE' && automation.status !== 'DRAFT')}
                        className="btn-ghost text-[12px] py-1.5 flex items-center gap-1 disabled:opacity-40"
                      >
                        <Zap size={11} />
                        Run
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setHistoryAutomation(automation)}
                    className="btn-ghost text-[12px] py-1.5 flex items-center gap-1"
                  >
                    <History size={11} />
                    History
                  </button>
                  <div className="flex-1" />
                  {canEdit && (
                    <>
                      <button
                        onClick={() => setEditingAutomation(automation)}
                        className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(automation)}
                        disabled={deleteAutomation.isPending}
                        className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--bg-elevated)] transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <AutomationModal
          integrations={integrations}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(message) => onToast({ type: 'success', message })}
        />
      )}

      {editingAutomation && (
        <AutomationModal
          integrations={integrations}
          automation={editingAutomation}
          onClose={() => setEditingAutomation(null)}
          onSuccess={(message) => onToast({ type: 'success', message })}
        />
      )}

      {historyAutomation && (
        <AutomationHistoryModal
          automation={historyAutomation}
          onClose={() => setHistoryAutomation(null)}
        />
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────

export function IntegrationsPage() {
  const { data: integrations, isLoading, refetch } = useIntegrations()
  const { data: catalog } = useConnectorCatalog()
  const syncMutation = useSyncIntegration()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<'connectors' | 'automations'>('connectors')
  const [settingsDrawer, setSettingsDrawer] = useState<any>(null)
  const [editModal, setEditModal] = useState<any>(null)
  const [showZapierModal, setShowZapierModal] = useState(false)
  const [zapierWebhookUrl, setZapierWebhookUrl] = useState('')
  const [showErpModal, setShowErpModal] = useState(false)
  const [showAddConnectorModal, setShowAddConnectorModal] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [oauthSetup, setOauthSetup] = useState<{ provider: string; required: { key: string; description: string }[] } | null>(null)

  const role = useUserStore((s) => s.currentUser?.role)
  const canEdit = role == null || role === 'ADMIN' || role === 'OPS_MANAGER'

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  // Handle OAuth callback query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const error = params.get('error')

    if (connected === 'microsoft' || connected === 'google') {
      const label = connected === 'microsoft' ? 'Microsoft' : 'Google'
      setToast({ type: 'success', message: `${label} account connected successfully` })
      refetch()
      window.history.replaceState({}, '', window.location.pathname)
    } else if (error) {
      setToast({ type: 'error', message: decodeURIComponent(error) })
      window.history.replaceState({}, '', window.location.pathname)
    }

    // Per-user Microsoft Graph connect flow returns "?ms=connected|error".
    const ms = params.get('ms')
    if (ms === 'connected') {
      setToast({ type: 'success', message: 'Microsoft account connected successfully' })
      qc.invalidateQueries({ queryKey: ['microsoft', 'status'] })
      window.history.replaceState({}, '', window.location.pathname)
    } else if (ms === 'error') {
      const reason = params.get('reason')
      setToast({ type: 'error', message: `Microsoft connection failed${reason ? `: ${reason}` : ''}` })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [refetch, qc])

  const integrationList = Array.isArray(integrations) ? integrations : []
  const catalogList = Array.isArray(catalog) ? catalog : []
  // SYNCING is a transient state during a manual sync — the integration is
  // still connected, so keep it in the Active section (with a Syncing badge)
  // instead of dropping it back to "Available" as if the setup was lost.
  const isActive = (i: any) => i.status === 'CONNECTED' || i.status === 'SYNCING'
  const connected = integrationList.filter(isActive)
  const available = integrationList.filter((i: any) => !isActive(i))

  const statusBadge = (status: string) => {
    switch (status) {
      case 'CONNECTED': return { label: 'Active', className: 'badge-healthy' }
      case 'ERROR': return { label: 'Error', className: 'badge-emergency' }
      case 'SYNCING': return { label: 'Syncing', className: 'badge-info' }
      default: return { label: 'Paused', className: 'badge-accent' }
    }
  }

  const handleConnect = async (integration: any) => {
    const type = integration.type
    const group = AUTH_GROUP[type]
    setConnecting(type)

    try {
      if (group === 'microsoft' || group === 'google') {
        const connectType = group === 'microsoft' ? 'MICROSOFT_OUTLOOK' : 'GOOGLE_GMAIL'
        const { data } = await api.post(`/integrations/${connectType}/connect`)
        window.open(data.authUrl, '_blank', 'noopener,noreferrer')
      } else if (type === 'ZAPIER') {
        const { data } = await api.post('/integrations/ZAPIER/connect')
        setZapierWebhookUrl(data.webhookUrl)
        setShowZapierModal(true)
      } else if (type === 'ERP_KAREVE_SYNC') {
        setShowErpModal(true)
      } else {
        await api.post(`/integrations/${type}/connect`)
        setToast({ type: 'success', message: `${integration.name} connected` })
        refetch()
      }
    } catch (err: any) {
      const errData = err?.response?.data
      if (errData?.error === 'configuration_required') {
        setOauthSetup({ provider: errData.provider, required: errData.required })
      } else {
        setToast({ type: 'error', message: errData?.message || `Failed to connect ${integration.name}` })
      }
    } finally {
      setConnecting(null)
    }
  }

  const handleDisconnect = async (integration: any) => {
    const type = integration.type
    const group = AUTH_GROUP[type]

    try {
      if (group === 'microsoft' || group === 'google') {
        // Disconnect all integrations in the same OAuth group
        const groupTypes = Object.entries(AUTH_GROUP)
          .filter(([, g]) => g === group)
          .map(([t]) => t)
        await Promise.all(
          groupTypes.map((t) => api.post(`/integrations/${t}/disconnect`))
        )
        const label = group === 'microsoft' ? 'Microsoft' : 'Google'
        setToast({ type: 'success', message: `All ${label} integrations disconnected` })
      } else {
        await api.post(`/integrations/${type}/disconnect`)
        setToast({ type: 'success', message: `${integration.name} disconnected` })
      }
      refetch()
    } catch (err: any) {
      setToast({ type: 'error', message: err?.response?.data?.message || 'Failed to disconnect' })
    }
  }

  const handleReconnect = async (integration: any) => {
    const group = AUTH_GROUP[integration.type]
    if (group === 'microsoft' || group === 'google') {
      const connectType = group === 'microsoft' ? 'MICROSOFT_OUTLOOK' : 'GOOGLE_GMAIL'
      try {
        const { data } = await api.post(`/integrations/${connectType}/connect`)
        window.open(data.authUrl, '_blank', 'noopener,noreferrer')
      } catch (err: any) {
        const errData = err?.response?.data
        if (errData?.error === 'configuration_required') {
          setOauthSetup({ provider: errData.provider, required: errData.required })
        } else {
          setToast({ type: 'error', message: errData?.message || 'Failed to reconnect' })
        }
      }
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2 animate-fade-in ${
          toast.type === 'success'
            ? 'bg-[var(--success-light)] border-[var(--success)] text-[var(--success)]'
            : 'bg-[var(--danger-light)] border-[var(--danger)] text-[var(--danger)]'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span className="text-[13px] font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2"><X size={14} /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            Integrations Hub
          </h1>
          <p className="text-[14px] text-[var(--text-secondary)] mt-0.5">
            Manage connected services, connectors, and automations
          </p>
        </div>
        {canEdit && activeTab === 'connectors' && (
          <button
            onClick={() => setShowAddConnectorModal(true)}
            className="btn-primary text-[13px] flex items-center gap-1.5"
          >
            <Plus size={14} />
            Add Connector
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] w-fit">
        <button
          onClick={() => setActiveTab('connectors')}
          className={`px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'connectors'
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Plug size={14} />
          Connectors
        </button>
        <button
          onClick={() => setActiveTab('automations')}
          className={`px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'automations'
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Zap size={14} />
          Automations
        </button>
      </div>

      {/* Automations Tab */}
      {activeTab === 'automations' && (
        <AutomationsPanel integrations={integrationList} onToast={setToast} />
      )}

      {/* Connectors Tab */}
      {activeTab === 'connectors' && (
        <>
          {/* Per-user Microsoft account connection */}
          <ConnectMicrosoft variant="card" />

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
                    {/* Header */}
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
                      {/* Edit + Settings + Disconnect */}
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
                        <button
                          onClick={() => handleDisconnect(integration)}
                          className="p-1.5 rounded-[6px] text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--bg-elevated)] transition-colors"
                          title="Disconnect"
                        >
                          <Unplug size={13} />
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
              const isConnecting = connecting === integration.type
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
                    <button
                      onClick={() => handleConnect(integration)}
                      disabled={isConnecting}
                      className="btn-primary w-full text-[13px] py-2 disabled:opacity-50"
                    >
                      {isConnecting ? 'Connecting...' : 'Connect'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
        </>
      )}

      {/* Settings Drawer */}
      {settingsDrawer && (
        <IntegrationSettingsDrawer
          integration={settingsDrawer}
          onClose={() => setSettingsDrawer(null)}
          onDisconnect={handleDisconnect}
          onReconnect={handleReconnect}
        />
      )}

      {/* Edit Modal */}
      {editModal && (
        <IntegrationEditModal
          integration={editModal}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* Zapier Webhook Modal */}
      {showZapierModal && (
        <ZapierWebhookModal
          webhookUrl={zapierWebhookUrl}
          onClose={() => { setShowZapierModal(false); refetch() }}
        />
      )}

      {/* ERP Config Modal */}
      {showErpModal && (
        <ErpConfigModal
          onClose={() => setShowErpModal(false)}
          onSuccess={(message?: string) => {
            setToast({ type: 'success', message: message || 'ERP Kareve Sync connected successfully' })
            refetch()
          }}
        />
      )}

      {/* OAuth Setup Modal */}
      {oauthSetup && (
        <OAuthSetupModal
          provider={oauthSetup.provider}
          requiredVars={oauthSetup.required}
          onClose={() => setOauthSetup(null)}
        />
      )}

      {/* Add Connector Modal */}
      {showAddConnectorModal && catalogList.length > 0 && (
        <AddConnectorModal
          catalog={catalogList}
          onClose={() => setShowAddConnectorModal(false)}
          onSuccess={(message) => {
            setToast({ type: 'success', message })
            refetch()
          }}
        />
      )}
    </div>
  )
}
