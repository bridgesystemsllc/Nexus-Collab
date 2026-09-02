import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plug, Play, Pause, Trash2, TestTube2, ExternalLink } from 'lucide-react'
import { Section, Field, Alert, inputClass, borderFor, SectionSkeleton } from '../components/SettingsPrimitives'

// ─── Integrations Settings Section ────────────────────────────
// Allows ADMIN/OPS_MANAGER to manage connectors from Settings page.
// Links to full Integrations Hub for detailed management.

const API_BASE = '/api/v1/integrations'

interface Connector {
  id: string
  type: string
  name: string
  status: string
  paused: boolean
  lastTestAt: string | null
  lastTestOk: boolean | null
  lastError: string | null
  hasCredentials: boolean
}

async function fetchConnectors(): Promise<Connector[]> {
  const res = await fetch(API_BASE, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch connectors')
  return res.json()
}

async function testConnector(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/${id}/test`, {
    method: 'POST',
    credentials: 'include',
  })
  return res.json()
}

async function pauseConnector(id: string): Promise<Connector> {
  const res = await fetch(`${API_BASE}/${id}/pause`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to pause connector')
  return res.json()
}

async function resumeConnector(id: string): Promise<Connector> {
  const res = await fetch(`${API_BASE}/${id}/resume`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to resume connector')
  return res.json()
}

async function deleteConnector(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to delete connector')
}

export function IntegrationsSection() {
  const qc = useQueryClient()
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null)

  const connectors = useQuery({
    queryKey: ['settings', 'connectors'],
    queryFn: fetchConnectors,
  })

  const testMut = useMutation({
    mutationFn: testConnector,
    onSuccess: (data) => {
      if (data.ok) {
        setToast({ msg: 'Connection test passed', tone: 'success' })
      } else {
        setToast({ msg: data.error || 'Connection test failed', tone: 'error' })
      }
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

  const deleteMut = useMutation({
    mutationFn: deleteConnector,
    onSuccess: () => {
      setToast({ msg: 'Connector deleted', tone: 'success' })
      qc.invalidateQueries({ queryKey: ['settings', 'connectors'] })
    },
    onError: () => setToast({ msg: 'Failed to delete connector', tone: 'error' }),
  })

  if (connectors.isLoading) return <SectionSkeleton />
  if (connectors.isError) {
    return (
      <Section title="Integrations">
        <Alert>Could not load integrations.</Alert>
      </Section>
    )
  }

  const list = connectors.data ?? []
  const genericConnectors = list.filter((c) =>
    c.type.startsWith('GENERIC_')
  )

  return (
    <div className="space-y-4">
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

      <Section
        title="Connectors"
        description="Manage your organization's external service connections."
        action={
          <a
            href="/integrations"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
            style={{ color: 'var(--accent)' }}
          >
            <ExternalLink size={13} /> Open Integrations Hub
          </a>
        }
      >
        {genericConnectors.length === 0 ? (
          <div className="rounded-lg border p-6 text-center" style={{ borderColor: 'var(--border-default)' }}>
            <Plug size={24} className="mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm text-[var(--text-secondary)]">No connectors configured</p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              Add connectors in the Integrations Hub to connect external services.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {genericConnectors.map((connector) => (
              <li
                key={connector.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                style={{ borderColor: 'var(--border-default)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      {connector.name}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
                      style={{
                        background:
                          connector.status === 'CONNECTED'
                            ? 'rgba(30,158,90,0.1)'
                            : connector.status === 'ERROR'
                            ? 'rgba(239,68,68,0.1)'
                            : 'rgba(0,0,0,0.05)',
                        color:
                          connector.status === 'CONNECTED'
                            ? 'var(--success)'
                            : connector.status === 'ERROR'
                            ? 'var(--danger)'
                            : 'var(--text-tertiary)',
                      }}
                    >
                      {connector.paused ? 'Paused' : connector.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
                    {connector.type.replace('GENERIC_', '').replace(/_/g, ' ')}
                    {connector.lastTestAt && (
                      <> · Last tested {new Date(connector.lastTestAt).toLocaleDateString()}</>
                    )}
                  </p>
                  {connector.lastError && (
                    <p className="mt-0.5 text-[10px]" style={{ color: 'var(--danger)' }}>
                      {connector.lastError}
                    </p>
                  )}
                </div>

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

                  <button
                    onClick={() => {
                      if (confirm('Delete this connector? This cannot be undone.')) {
                        deleteMut.mutate(connector.id)
                      }
                    }}
                    disabled={deleteMut.isPending}
                    title="Delete connector"
                    className="rounded-lg border p-1.5 hover:bg-[var(--bg-surface)] disabled:opacity-40"
                    style={{ borderColor: 'var(--border-default)', color: 'var(--danger)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
