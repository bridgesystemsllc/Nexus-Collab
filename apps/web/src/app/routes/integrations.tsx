import { useState, useEffect } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  ExternalLink,
  Hash,
  Key,
  Mail,
  MessageCircle,
  Pencil,
  Plug,
  RefreshCw,
  Settings,
  ShoppingCart,
  Table2,
  Unplug,
  X,
  Zap,
} from 'lucide-react'
import { useIntegrations, useSyncIntegration } from '@/hooks/useData'
import { api } from '@/lib/api'
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
      await api.post('/integrations/ERP_KAREVE_SYNC/connect', {
        apiUrl: apiUrl.trim(),
        apiKey: apiKey.trim() || undefined,
      })
      setSaveMsg('Credentials updated')
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
  const [enabled, setEnabled] = useState(integration.status === 'CONNECTED')
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const group = AUTH_GROUP[integration.type]
  const isOAuth = group === 'microsoft' || group === 'google'
  const isZapier = integration.type === 'ZAPIER'
  const isErp = integration.type === 'ERP_KAREVE_SYNC'

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      await api.post(`/integrations/${integration.type}/test`)
      setTestResult({ ok: true, message: 'Connection successful' })
    } catch {
      setTestResult({ ok: false, message: 'Connection failed' })
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

        {/* Incoming Sync */}
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">Incoming Data</h3>
          <div className="space-y-2">
            {(isErp
              ? [
                  { name: 'Product Names & Details', status: 'Syncing' },
                  { name: 'Product SKUs / UPCs', status: 'Syncing' },
                  { name: 'CM Information', status: 'Syncing' },
                  { name: 'Inventory Levels', status: 'Syncing' },
                  { name: 'Purchase Orders', status: 'Syncing' },
                  { name: 'Production Orders', status: 'Syncing' },
                  { name: 'BOM (Bill of Materials)', status: 'Syncing' },
                ]
              : [
                  { name: 'Tasks', status: 'Syncing' },
                  { name: 'Calendar Events', status: 'Syncing' },
                  { name: 'Contacts', status: 'Syncing' },
                  { name: 'Messages', status: 'Syncing' },
                ]
            ).map((item) => (
              <div key={item.name} className="flex items-center justify-between p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                <span className="text-[13px] text-[var(--text-primary)]">{item.name}</span>
                <span className="badge badge-healthy text-[10px]">{item.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Outgoing Sync */}
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">Outgoing Data</h3>
          <div className="space-y-2">
            {(isErp
              ? [
                  { name: 'Inventory Updates', status: 'Enabled' },
                  { name: 'PO Status Changes', status: 'Enabled' },
                  { name: 'Production Updates', status: 'Enabled' },
                  { name: 'SKU / Product Changes', status: 'Enabled' },
                  { name: 'CM Assignment Changes', status: 'Enabled' },
                ]
              : [
                  { name: 'Task Updates', status: 'Enabled' },
                  { name: 'Status Changes', status: 'Enabled' },
                  { name: 'Activity Logs', status: 'Enabled' },
                ]
            ).map((item) => (
              <div key={item.name} className="flex items-center justify-between p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                <span className="text-[13px] text-[var(--text-primary)]">{item.name}</span>
                <span className="badge badge-info text-[10px]">{item.status}</span>
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
  onSuccess: () => void
}) {
  const [apiUrl, setApiUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post('/integrations/ERP_KAREVE_SYNC/connect', { apiUrl, apiKey })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Connection failed. Check your credentials and try again.')
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

// ─── Main Page ───────────────────────────────────────────────

export function IntegrationsPage() {
  const { data: integrations, isLoading, refetch } = useIntegrations()
  const syncMutation = useSyncIntegration()

  const [settingsDrawer, setSettingsDrawer] = useState<any>(null)
  const [editModal, setEditModal] = useState<any>(null)
  const [showZapierModal, setShowZapierModal] = useState(false)
  const [zapierWebhookUrl, setZapierWebhookUrl] = useState('')
  const [showErpModal, setShowErpModal] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [oauthSetup, setOauthSetup] = useState<{ provider: string; required: { key: string; description: string }[] } | null>(null)

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
  }, [refetch])

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
          onSuccess={() => {
            setToast({ type: 'success', message: 'ERP Kareve Sync connected successfully' })
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
    </div>
  )
}
