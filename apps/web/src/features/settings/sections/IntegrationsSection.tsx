import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Key,
  Pause,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Settings,
  TestTube2,
  Trash2,
  Zap,
} from 'lucide-react'
import { Section, Alert, SectionSkeleton } from '../components/SettingsPrimitives'

// ─── Integrations Settings Section ────────────────────────────
// §5.2: Shows connectors and automations for ADMIN/OPS_MANAGER.
// Displays: hasCredentials, apiKeyMasked (••••last4), status (DISCONNECTED/CONNECTED/ERROR),
// ERP routing/outbound/apiUrl, automations with DRAFT→activate, triggerConfig.everyMinutes.
// NEVER renders: iv, encrypted, tag, apiKey, token, password, secrets.

const API_BASE = '/api/v1/integrations'
const AUTOMATIONS_API = '/api/v1/automations'

// §5.2: Sanitized integration from API - no secrets
export interface SanitizedConnector {
  id: string
  type: string
  name: string
  status: string // DISCONNECTED, CONNECTED, ERROR, SYNCING
  paused: boolean
  authType: string | null
  lastTestAt: string | null
  lastTestOk: boolean | null
  lastError: string | null
  consecutiveFailures: number
  circuitOpenUntil: string | null
  // §5.2: Masked output fields
  hasCredentials: boolean
  apiKeyMasked: string | null // ••••last4
  // §5.2: Preserved config fields (no secrets)
  config: {
    baseUrl?: string
    apiUrl?: string
    routing?: Record<string, unknown>
    outbound?: Record<string, unknown>
    liveVerified?: boolean
    webhookUrl?: string
    webhookId?: string
    testPath?: string
    mcpServerUrl?: string
  }
}

// §5.2: Automation with triggerType/triggerConfig/actionType/actionConfig
export interface Automation {
  id: string
  name: string
  description: string | null
  connectorId: string
  triggerType: 'SCHEDULE' | 'WEBHOOK' | 'MANUAL'
  triggerConfig: { everyMinutes?: number; timezone?: string } | null
  actionType: 'HTTP_REQUEST' | 'MCP_CALL' | 'WEBHOOK_FORWARD'
  actionConfig: { method?: string; path?: string } | null
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ERROR'
  nextRunAt: string | null
  lastRunAt: string | null
  lastRunOk: boolean | null
  lastError: string | null
}

async function fetchConnectors(): Promise<SanitizedConnector[]> {
  const res = await fetch(API_BASE, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch connectors')
  return res.json()
}

async function fetchAutomations(): Promise<Automation[]> {
  const res = await fetch(AUTOMATIONS_API, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch automations')
  return res.json()
}

async function testConnector(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/${id}/test`, {
    method: 'POST',
    credentials: 'include',
  })
  return res.json()
}

async function pauseConnector(id: string): Promise<SanitizedConnector> {
  const res = await fetch(`${API_BASE}/${id}/pause`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to pause connector')
  return res.json()
}

async function resumeConnector(id: string): Promise<SanitizedConnector> {
  const res = await fetch(`${API_BASE}/${id}/resume`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to resume connector')
  return res.json()
}

async function activateAutomation(id: string): Promise<Automation> {
  const res = await fetch(`${AUTOMATIONS_API}/${id}/activate`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to activate automation')
  return res.json()
}

async function runAutomation(id: string): Promise<unknown> {
  const res = await fetch(`${AUTOMATIONS_API}/${id}/run`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to run automation')
  return res.json()
}

// §5.2: Format everyMinutes to human readable
function formatSchedule(everyMinutes: number | undefined): string {
  if (!everyMinutes) return 'Manual'
  if (everyMinutes === 15) return 'Every 15 min'
  if (everyMinutes === 60) return 'Every hour'
  if (everyMinutes === 1440) return 'Every 24 hours'
  return `Every ${everyMinutes} min`
}

// Status badge styling
function getStatusStyle(status: string, paused: boolean) {
  if (paused) {
    return {
      background: 'rgba(0,0,0,0.05)',
      color: 'var(--text-tertiary)',
      label: 'Paused',
    }
  }
  switch (status) {
    case 'CONNECTED':
      return {
        background: 'rgba(30,158,90,0.1)',
        color: 'var(--success)',
        label: 'Connected',
      }
    case 'DISCONNECTED':
      return {
        background: 'rgba(234,179,8,0.1)',
        color: 'var(--warning, #ca8a04)',
        label: 'Disconnected',
      }
    case 'ERROR':
      return {
        background: 'rgba(239,68,68,0.1)',
        color: 'var(--danger)',
        label: 'Error',
      }
    case 'DRAFT':
      return {
        background: 'rgba(99,102,241,0.1)',
        color: 'var(--accent)',
        label: 'Draft',
      }
    case 'ACTIVE':
      return {
        background: 'rgba(30,158,90,0.1)',
        color: 'var(--success)',
        label: 'Active',
      }
    default:
      return {
        background: 'rgba(0,0,0,0.05)',
        color: 'var(--text-tertiary)',
        label: status,
      }
  }
}

export function IntegrationsSection() {
  const qc = useQueryClient()
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null)

  const connectors = useQuery({
    queryKey: ['settings', 'connectors'],
    queryFn: fetchConnectors,
  })

  const automations = useQuery({
    queryKey: ['settings', 'automations'],
    queryFn: fetchAutomations,
  })

  const testMut = useMutation({
    mutationFn: testConnector,
    onSuccess: (data) => {
      setToast({
        msg: data.ok ? 'Connection test passed' : data.error || 'Connection test failed',
        tone: data.ok ? 'success' : 'error',
      })
      qc.invalidateQueries({ queryKey: ['settings', 'connectors'] })
    },
    onError: () => setToast({ msg: 'Connection test failed', tone: 'error' }),
  })

  const pauseMut = useMutation({
    mutationFn: pauseConnector,
    onSuccess: () => {
      setToast({ msg: 'Connector paused', tone: 'success' })
      qc.invalidateQueries({ queryKey: ['settings', 'connectors'] })
    },
    onError: () => setToast({ msg: 'Failed to pause connector', tone: 'error' }),
  })

  const resumeMut = useMutation({
    mutationFn: resumeConnector,
    onSuccess: () => {
      setToast({ msg: 'Connector resumed', tone: 'success' })
      qc.invalidateQueries({ queryKey: ['settings', 'connectors'] })
    },
    onError: () => setToast({ msg: 'Failed to resume connector', tone: 'error' }),
  })

  const activateMut = useMutation({
    mutationFn: activateAutomation,
    onSuccess: () => {
      setToast({ msg: 'Automation activated', tone: 'success' })
      qc.invalidateQueries({ queryKey: ['settings', 'automations'] })
    },
    onError: () => setToast({ msg: 'Failed to activate automation', tone: 'error' }),
  })

  const runMut = useMutation({
    mutationFn: runAutomation,
    onSuccess: () => {
      setToast({ msg: 'Automation executed', tone: 'success' })
      qc.invalidateQueries({ queryKey: ['settings', 'automations'] })
    },
    onError: () => setToast({ msg: 'Failed to run automation', tone: 'error' }),
  })

  if (connectors.isLoading || automations.isLoading) return <SectionSkeleton />
  if (connectors.isError) {
    return (
      <Section title="Integrations">
        <Alert>Could not load integrations. You may not have permission.</Alert>
      </Section>
    )
  }

  const connectorList = connectors.data ?? []
  const automationList = automations.data ?? []

  return (
    <div className="space-y-6" data-testid="integrations-section">
      {toast && (
        <p
          role="status"
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: toast.tone === 'success' ? 'var(--success)' : 'var(--danger)',
            background: toast.tone === 'success' ? 'rgba(30,158,90,0.06)' : 'rgba(239,68,68,0.06)',
            color: toast.tone === 'success' ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {toast.msg}
        </p>
      )}

      {/* Connectors Section */}
      <Section
        title="Connectors"
        description="External service connections for your organization."
        action={
          <a
            href="/integrations"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
            style={{ color: 'var(--accent)' }}
          >
            <Plus size={13} /> Add Connector
          </a>
        }
      >
        {connectorList.length === 0 ? (
          <div
            className="rounded-lg border p-6 text-center"
            style={{ borderColor: 'var(--border-default)' }}
            data-testid="connectors-empty"
          >
            <Plug size={24} className="mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm font-medium text-[var(--text-secondary)]">No connectors yet</p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              Connect HTTP APIs, MCP servers, or webhooks to automate workflows.
            </p>
            <a
              href="/integrations"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white"
              style={{ background: 'var(--accent)' }}
            >
              <Plus size={12} /> Add your first connector
            </a>
          </div>
        ) : (
          <ul className="space-y-2" data-testid="connectors-list">
            {connectorList.map((connector) => {
              const statusStyle = getStatusStyle(connector.status, connector.paused)
              const configUrl = connector.config?.baseUrl || connector.config?.apiUrl || connector.config?.mcpServerUrl

              return (
                <li
                  key={connector.id}
                  className="rounded-lg border px-3 py-3"
                  style={{ borderColor: 'var(--border-default)' }}
                  data-testid={`connector-${connector.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Name and status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {connector.name}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
                          style={{ background: statusStyle.background, color: statusStyle.color }}
                          data-testid="connector-status"
                        >
                          {statusStyle.label}
                        </span>
                        {/* §5.2: hasCredentials badge */}
                        {connector.hasCredentials && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)]"
                            style={{ background: 'rgba(0,0,0,0.04)' }}
                            data-testid="has-credentials"
                          >
                            <Key size={8} /> Credentials set
                          </span>
                        )}
                      </div>

                      {/* Type and URL */}
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
                        <span>{connector.type.replace('GENERIC_', '').replace(/_/g, ' ')}</span>
                        {configUrl && (
                          <>
                            <span>·</span>
                            <span className="font-mono truncate max-w-[200px]" title={configUrl}>
                              {configUrl}
                            </span>
                          </>
                        )}
                      </div>

                      {/* §5.2: apiKeyMasked (••••last4) */}
                      {connector.apiKeyMasked && (
                        <p
                          className="mt-1 text-[10px] text-[var(--text-tertiary)] font-mono"
                          data-testid="api-key-masked"
                        >
                          API Key: {connector.apiKeyMasked}
                        </p>
                      )}

                      {/* §5.2: ERP routing/outbound info */}
                      {connector.config?.routing && (
                        <p className="mt-1 text-[10px] text-[var(--text-tertiary)]" data-testid="erp-routing">
                          Routing: {Object.keys(connector.config.routing).filter(k => (connector.config.routing as any)[k]).join(', ') || 'None'}
                        </p>
                      )}
                      {connector.config?.outbound && (
                        <p className="mt-1 text-[10px] text-[var(--text-tertiary)]" data-testid="erp-outbound">
                          Outbound: {Object.keys(connector.config.outbound).filter(k => (connector.config.outbound as any)[k]).join(', ') || 'None'}
                        </p>
                      )}

                      {/* Last test info */}
                      {connector.lastTestAt && (
                        <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                          Last tested: {new Date(connector.lastTestAt).toLocaleString()}
                          {connector.lastTestOk === true && ' ✓'}
                          {connector.lastTestOk === false && ' ✗'}
                        </p>
                      )}

                      {/* Error display */}
                      {connector.lastError && (
                        <p className="mt-1 text-[10px]" style={{ color: 'var(--danger)' }} data-testid="connector-error">
                          {connector.lastError}
                        </p>
                      )}

                      {/* Circuit breaker warning */}
                      {connector.circuitOpenUntil && new Date(connector.circuitOpenUntil) > new Date() && (
                        <p className="mt-1 text-[10px]" style={{ color: 'var(--warning, #ca8a04)' }}>
                          Circuit open until {new Date(connector.circuitOpenUntil).toLocaleTimeString()}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => testMut.mutate(connector.id)}
                        disabled={testMut.isPending}
                        title="Test connection"
                        className="rounded-lg border p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] disabled:opacity-40"
                        style={{ borderColor: 'var(--border-default)' }}
                      >
                        <TestTube2 size={14} />
                      </button>

                      {connector.paused ? (
                        <button
                          onClick={() => resumeMut.mutate(connector.id)}
                          disabled={resumeMut.isPending}
                          title="Resume connector"
                          className="rounded-lg border p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] disabled:opacity-40"
                          style={{ borderColor: 'var(--border-default)' }}
                        >
                          <Play size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => pauseMut.mutate(connector.id)}
                          disabled={pauseMut.isPending}
                          title="Pause connector"
                          className="rounded-lg border p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] disabled:opacity-40"
                          style={{ borderColor: 'var(--border-default)' }}
                        >
                          <Pause size={14} />
                        </button>
                      )}

                      <a
                        href={`/integrations?id=${connector.id}`}
                        title="Configure"
                        className="rounded-lg border p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
                        style={{ borderColor: 'var(--border-default)' }}
                      >
                        <Settings size={14} />
                      </a>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      {/* Automations Section */}
      <Section
        title="Automations"
        description="Scheduled tasks and webhook handlers."
        action={
          <a
            href="/integrations?tab=automations"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
            style={{ color: 'var(--accent)' }}
          >
            <Plus size={13} /> Create Automation
          </a>
        }
      >
        {automationList.length === 0 ? (
          <div
            className="rounded-lg border p-6 text-center"
            style={{ borderColor: 'var(--border-default)' }}
            data-testid="automations-empty"
          >
            <Zap size={24} className="mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm font-medium text-[var(--text-secondary)]">No automations yet</p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              Create automations to run scheduled tasks or handle incoming webhooks.
            </p>
            <a
              href="/integrations?tab=automations"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white"
              style={{ background: 'var(--accent)' }}
            >
              <Plus size={12} /> Create your first automation
            </a>
          </div>
        ) : (
          <ul className="space-y-2" data-testid="automations-list">
            {automationList.map((automation) => {
              const statusStyle = getStatusStyle(automation.status, false)
              const connector = connectorList.find((c) => c.id === automation.connectorId)

              return (
                <li
                  key={automation.id}
                  className="rounded-lg border px-3 py-3"
                  style={{ borderColor: 'var(--border-default)' }}
                  data-testid={`automation-${automation.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Name and status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {automation.name}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
                          style={{ background: statusStyle.background, color: statusStyle.color }}
                          data-testid="automation-status"
                        >
                          {statusStyle.label}
                        </span>
                      </div>

                      {/* §5.2: triggerType and triggerConfig.everyMinutes */}
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
                        <span className="inline-flex items-center gap-1" data-testid="trigger-type">
                          <Clock size={10} />
                          {automation.triggerType}
                          {automation.triggerType === 'SCHEDULE' && automation.triggerConfig?.everyMinutes && (
                            <span data-testid="trigger-config">
                              ({formatSchedule(automation.triggerConfig.everyMinutes)})
                            </span>
                          )}
                        </span>
                        {connector && (
                          <>
                            <span>·</span>
                            <span>{connector.name}</span>
                          </>
                        )}
                      </div>

                      {/* §5.2: actionType and actionConfig */}
                      {automation.actionConfig && (
                        <p className="mt-1 text-[10px] text-[var(--text-tertiary)] font-mono" data-testid="action-config">
                          {automation.actionType}: {automation.actionConfig.method} {automation.actionConfig.path}
                        </p>
                      )}

                      {/* Next/last run */}
                      {automation.nextRunAt && (
                        <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                          Next run: {new Date(automation.nextRunAt).toLocaleString()}
                        </p>
                      )}
                      {automation.lastRunAt && (
                        <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                          Last run: {new Date(automation.lastRunAt).toLocaleString()}
                          {automation.lastRunOk === true && ' ✓'}
                          {automation.lastRunOk === false && ' ✗'}
                        </p>
                      )}

                      {/* Error display */}
                      {automation.lastError && (
                        <p className="mt-1 text-[10px]" style={{ color: 'var(--danger)' }} data-testid="automation-error">
                          {automation.lastError}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      {/* §5.2: DRAFT → activate button */}
                      {automation.status === 'DRAFT' && (
                        <button
                          onClick={() => activateMut.mutate(automation.id)}
                          disabled={activateMut.isPending}
                          title="Activate automation"
                          className="rounded-lg border px-2 py-1.5 text-[11px] font-medium hover:bg-[var(--bg-surface)] disabled:opacity-40"
                          style={{ borderColor: 'var(--success)', color: 'var(--success)' }}
                          data-testid="activate-button"
                        >
                          <CheckCircle2 size={12} className="inline mr-1" />
                          Activate
                        </button>
                      )}

                      {/* Run button */}
                      {(automation.status === 'ACTIVE' || automation.status === 'DRAFT') && (
                        <button
                          onClick={() => runMut.mutate(automation.id)}
                          disabled={runMut.isPending}
                          title="Run now"
                          className="rounded-lg border p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] disabled:opacity-40"
                          style={{ borderColor: 'var(--border-default)' }}
                        >
                          <RefreshCw size={14} />
                        </button>
                      )}

                      <a
                        href={`/integrations?tab=automations&id=${automation.id}`}
                        title="Configure"
                        className="rounded-lg border p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
                        style={{ borderColor: 'var(--border-default)' }}
                      >
                        <Settings size={14} />
                      </a>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}
