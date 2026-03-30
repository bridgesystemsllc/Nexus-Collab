import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Mail,
  Bot,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  ChevronDown,
  Send,
  AlertTriangle,
  Loader2,
  Eye,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Dialog } from '@/components/Dialog'
import { formatDistanceToNow } from 'date-fns'

// ─── Test Agent Modal ────────────────────────────────────
function TestAgentModal({ onClose }: { onClose: () => void }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [fromEmail, setFromEmail] = useState('')

  const testMutation = useMutation({
    mutationFn: (data: { subject: string; body: string; fromEmail?: string }) =>
      api.post('/email-agent/test', data).then((r) => r.data),
  })

  const handleRun = () => {
    testMutation.mutate({
      subject,
      body,
      ...(fromEmail ? { fromEmail } : {}),
    })
  }

  return (
    <Dialog open={true} onClose={onClose} title="Test Email Agent" subtitle="Simulate an inbound email to see how the agent parses it" wide>
      <div className="space-y-5">
        {/* Input Fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Update project timeline for KareEve launch"
              className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Write the email body content here..."
              className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors resize-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              From Email <span className="text-[var(--text-tertiary)] normal-case">(optional)</span>
            </label>
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="sender@example.com"
              className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
            />
          </div>
        </div>

        {/* Run Button */}
        <button
          onClick={handleRun}
          disabled={!subject || !body || testMutation.isPending}
          className="btn-primary w-full flex items-center justify-center gap-2 text-[14px]"
        >
          {testMutation.isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Running Test...
            </>
          ) : (
            <>
              <Send size={14} />
              Run Test
            </>
          )}
        </button>

        {/* Error */}
        {testMutation.isError && (
          <div className="p-4 rounded-[12px] bg-[var(--danger-subtle)] border border-[var(--danger)]/20">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={14} className="text-[var(--danger)]" />
              <span className="text-[13px] font-medium text-[var(--danger)]">Test Failed</span>
            </div>
            <p className="text-[12px] text-[var(--text-secondary)]">
              {(testMutation.error as any)?.response?.data?.message || 'An error occurred while running the test.'}
            </p>
          </div>
        )}

        {/* Results */}
        {testMutation.data && (
          <div className="space-y-4">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Test Results</h3>

            <div className="p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em]">Parsed Intent</p>
                  <p className="text-[14px] text-[var(--text-primary)] mt-1">{testMutation.data.intent || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em]">Confidence</p>
                  <p className="text-[14px] text-[var(--text-primary)] mt-1 tabular-nums">
                    {testMutation.data.confidence != null ? `${testMutation.data.confidence}%` : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {testMutation.data.actions && (
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em] mb-2">Actions</p>
                <div className="space-y-2">
                  {testMutation.data.actions.map((action: any, i: number) => (
                    <div key={i} className="p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)]">
                      {typeof action === 'string' ? action : JSON.stringify(action, null, 2)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {testMutation.data.executionResults && (
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em] mb-2">Execution Results</p>
                <pre className="p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(testMutation.data.executionResults, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}

// ─── Confidence Badge ────────────────────────────────────
function ConfidenceBadge({ value }: { value: number }) {
  const color =
    value >= 85
      ? 'badge-healthy'
      : value >= 60
        ? 'badge-accent'
        : 'badge-emergency'
  return (
    <span className={`badge text-[10px] tabular-nums ${color}`}>
      {value}%
    </span>
  )
}

// ─── Status Badge ────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: 'badge-healthy',
    completed: 'badge-healthy',
    failed: 'badge-emergency',
    error: 'badge-emergency',
    pending: 'badge-accent',
    skipped: 'badge-info',
  }
  return (
    <span className={`badge text-[10px] ${map[status?.toLowerCase()] || 'badge-info'}`}>
      {status}
    </span>
  )
}

// ─── Main Page ───────────────────────────────────────────
export function AgentSettingsPage() {
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [addingSender, setAddingSender] = useState(false)
  const [newSenderEmail, setNewSenderEmail] = useState('')
  const [capabilityOpen, setCapabilityOpen] = useState(false)

  const { data: agentStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['email-agent-status'],
    queryFn: () => api.get('/email-agent/status').then((r) => r.data),
  })

  const { data: agentLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['email-agent-logs'],
    queryFn: () => api.get('/email-agent/logs').then((r) => r.data),
  })

  const isActive = agentStatus?.active === true
  const logList = Array.isArray(agentLogs) ? agentLogs : agentLogs?.logs ?? []

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
          Email Agent Settings
        </h1>
        <p className="text-[14px] text-[var(--text-secondary)] mt-0.5">
          Configure and monitor your AI email agent
        </p>
      </div>

      {/* ─── 1. Agent Inbox Status Card ────────────────────── */}
      <div className="data-cell relative overflow-hidden">
        {isActive && <div className="absolute top-0 left-0 right-0 h-[3px] bg-[var(--success)]" />}
        {!isActive && !statusLoading && <div className="absolute top-0 left-0 right-0 h-[3px] bg-[var(--danger)]" />}

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--accent-subtle)]">
                <Bot size={20} className="text-[var(--accent)]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Agent Inbox</h2>
                  {statusLoading ? (
                    <Loader2 size={14} className="animate-spin text-[var(--text-tertiary)]" />
                  ) : isActive ? (
                    <span className="badge badge-healthy text-[10px]">Listening</span>
                  ) : (
                    <span className="badge badge-emergency text-[10px]">Disconnected</span>
                  )}
                </div>
                {agentStatus?.mailbox && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Mail size={12} className="text-[var(--text-tertiary)]" />
                    <span className="text-[12px] text-[var(--text-secondary)]">{agentStatus.mailbox}</span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setTestModalOpen(true)}
              className="btn-primary flex items-center gap-2 text-[13px] py-2 px-4"
            >
              <Send size={13} />
              Test Agent
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em]">Agent Email</p>
              <p className="text-[14px] text-[var(--text-primary)] mt-1 truncate">
                {statusLoading ? '...' : agentStatus?.mailbox || 'Not configured'}
              </p>
            </div>
            <div className="p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em]">Last Email Processed</p>
              <p className="text-[14px] text-[var(--text-primary)] mt-1 truncate">
                {statusLoading
                  ? '...'
                  : agentStatus?.lastProcessed
                    ? `${agentStatus.lastProcessed.subject}`
                    : 'None'}
              </p>
              {agentStatus?.lastProcessed?.timestamp && (
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                  {formatDistanceToNow(new Date(agentStatus.lastProcessed.timestamp), { addSuffix: true })}
                </p>
              )}
            </div>
            <div className="p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.06em]">Processed This Month</p>
              <p className="text-[14px] text-[var(--text-primary)] mt-1 tabular-nums">
                {statusLoading ? '...' : (agentStatus?.processedThisMonth ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 2. Configuration Checklist ────────────────────── */}
      <div>
        <h2 className="text-[16px] font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Shield size={18} className="text-[var(--text-tertiary)]" />
          Configuration Checklist
        </h2>
        <div className="data-cell">
          <div className="space-y-3">
            {[
              { label: 'Graph API Credentials', ok: agentStatus?.hasGraphCreds },
              { label: 'Anthropic API Key', ok: agentStatus?.hasAnthropicKey },
              { label: 'Agent Mailbox', ok: !!agentStatus?.mailbox },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                {statusLoading ? (
                  <Loader2 size={16} className="animate-spin text-[var(--text-tertiary)]" />
                ) : item.ok ? (
                  <CheckCircle2 size={16} className="text-[var(--success)] flex-shrink-0" />
                ) : (
                  <XCircle size={16} className="text-[var(--danger)] flex-shrink-0" />
                )}
                <span className="text-[13px] text-[var(--text-primary)]">{item.label}</span>
                {!statusLoading && (
                  <span className={`ml-auto text-[11px] ${item.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {item.ok ? 'Configured' : 'Missing'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── 3. Authorized Senders ─────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Mail size={18} className="text-[var(--text-tertiary)]" />
            Authorized Senders
          </h2>
          <button
            onClick={() => setAddingSender(true)}
            className="btn-ghost flex items-center gap-1.5 text-[13px]"
          >
            + Add Sender
          </button>
        </div>
        <div className="data-cell">
          {addingSender && (
            <div className="flex items-center gap-2 mb-4">
              <input
                type="email"
                value={newSenderEmail}
                onChange={(e) => setNewSenderEmail(e.target.value)}
                placeholder="email@example.com"
                className="flex-1 px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
                autoFocus
              />
              <button
                onClick={() => { setAddingSender(false); setNewSenderEmail('') }}
                className="btn-ghost text-[13px] py-2"
              >
                Cancel
              </button>
              <button
                disabled={!newSenderEmail}
                className="btn-primary text-[13px] py-2"
              >
                Add
              </button>
            </div>
          )}

          {statusLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
            </div>
          ) : agentStatus?.authorizedSenders?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] pb-2 pr-4">Email</th>
                    <th className="text-left text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] pb-2 pr-4">Date Added</th>
                    <th className="text-right text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {agentStatus.authorizedSenders.map((sender: any, i: number) => {
                    const email = typeof sender === 'string' ? sender : sender.email
                    const dateAdded = typeof sender === 'object' ? sender.dateAdded : null
                    return (
                      <tr key={i} className="border-b border-[var(--border-subtle)] last:border-0">
                        <td className="py-3 pr-4 text-[13px] text-[var(--text-primary)]">{email}</td>
                        <td className="py-3 pr-4 text-[12px] text-[var(--text-secondary)]">
                          {dateAdded ? formatDistanceToNow(new Date(dateAdded), { addSuffix: true }) : '—'}
                        </td>
                        <td className="py-3 text-right">
                          <button className="p-1.5 rounded-[6px] text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--bg-elevated)] transition-colors" title="Remove">
                            <X size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[13px] text-[var(--text-tertiary)] text-center py-6">No authorized senders configured</p>
          )}

          <p className="text-[11px] text-[var(--text-tertiary)] mt-4 pt-3 border-t border-[var(--border-subtle)]">
            Authorized senders are configured via the AUTHORIZED_SENDERS environment variable
          </p>
        </div>
      </div>

      {/* ─── 4. Agent Log ──────────────────────────────────── */}
      <div>
        <h2 className="text-[16px] font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Clock size={18} className="text-[var(--text-tertiary)]" />
          Agent Log
        </h2>
        <div className="data-cell">
          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
            </div>
          ) : logList.length === 0 ? (
            <div className="text-center py-10">
              <Bot size={32} className="text-[var(--text-tertiary)] mx-auto mb-3 opacity-40" />
              <p className="text-[14px] text-[var(--text-secondary)]">No agent activity yet</p>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-1">Processed emails will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] pb-2 pr-4">Date/Time</th>
                    <th className="text-left text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] pb-2 pr-4">From</th>
                    <th className="text-left text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] pb-2 pr-4">Subject</th>
                    <th className="text-left text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] pb-2 pr-4">Intent</th>
                    <th className="text-left text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] pb-2 pr-4">Confidence</th>
                    <th className="text-left text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logList.map((log: any) => {
                    const isExpanded = expandedLog === log.id
                    return (
                      <>
                        <tr
                          key={log.id}
                          onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                          className="border-b border-[var(--border-subtle)] cursor-pointer hover:bg-[var(--bg-surface)] transition-colors"
                        >
                          <td className="py-3 pr-4 text-[12px] text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                            {log.timestamp
                              ? new Date(log.timestamp).toLocaleString(undefined, {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td className="py-3 pr-4 text-[13px] text-[var(--text-primary)] max-w-[180px] truncate">{log.from || '—'}</td>
                          <td className="py-3 pr-4 text-[13px] text-[var(--text-primary)] max-w-[200px] truncate">{log.subject || '—'}</td>
                          <td className="py-3 pr-4 text-[12px] text-[var(--text-secondary)] max-w-[160px] truncate">{log.intent || '—'}</td>
                          <td className="py-3 pr-4">
                            {log.confidence != null ? <ConfidenceBadge value={log.confidence} /> : <span className="text-[12px] text-[var(--text-tertiary)]">—</span>}
                          </td>
                          <td className="py-3">
                            {log.status ? <StatusBadge status={log.status} /> : <span className="text-[12px] text-[var(--text-tertiary)]">—</span>}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${log.id}-detail`} className="border-b border-[var(--border-subtle)]">
                            <td colSpan={6} className="py-3 px-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Eye size={13} className="text-[var(--text-tertiary)]" />
                                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Parsed Plan</span>
                              </div>
                              <pre className="p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                                {JSON.stringify(log.plan ?? log, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ─── 5. Capability Guide ───────────────────────────── */}
      <div>
        <button
          onClick={() => setCapabilityOpen(!capabilityOpen)}
          className="w-full flex items-center justify-between p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-[var(--text-tertiary)]" />
            <span className="text-[14px] font-semibold text-[var(--text-primary)]">Capability Guide</span>
          </div>
          <ChevronDown
            size={16}
            className={`text-[var(--text-tertiary)] transition-transform ${capabilityOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {capabilityOpen && (
          <div className="data-cell mt-2 space-y-4">
            <p className="text-[13px] text-[var(--text-secondary)]">
              The email agent monitors your inbox and automatically processes emails from authorized senders. It uses AI to understand the intent of each email and takes appropriate action within Nexus.
            </p>
            <div className="space-y-3">
              {[
                {
                  title: 'Create Tasks',
                  description: 'Email a task description and the agent will create it in the right project.',
                  example: 'Subject: "Create task: Update packaging design for KareEve serum"',
                },
                {
                  title: 'Update Project Status',
                  description: 'Send status updates and the agent will log them against the relevant project.',
                  example: 'Subject: "Status update: Bridge Systems ERP migration 80% complete"',
                },
                {
                  title: 'Schedule Reminders',
                  description: 'Ask the agent to remind you about something at a specific time.',
                  example: 'Subject: "Remind me: Follow up with supplier on Friday at 2pm"',
                },
                {
                  title: 'Log Notes',
                  description: 'Forward meeting notes or summaries to have them attached to the right project.',
                  example: 'Subject: "Meeting notes: Vibe Ideas product roadmap review"',
                },
                {
                  title: 'Query Information',
                  description: 'Ask questions about your projects, tasks, or recent activity.',
                  example: 'Subject: "What tasks are overdue for KareEve Beauty Group?"',
                },
                {
                  title: 'Manage Integrations',
                  description: 'Trigger syncs or check status of connected services.',
                  example: 'Subject: "Sync KareEve ERP data now"',
                },
              ].map((cap) => (
                <div key={cap.title} className="p-4 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                  <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">{cap.title}</h4>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-1">{cap.description}</p>
                  <div className="mt-2 px-3 py-2 rounded-[8px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                    <code className="text-[11px] text-[var(--accent)]">{cap.example}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Test Modal ────────────────────────────────────── */}
      {testModalOpen && <TestAgentModal onClose={() => setTestModalOpen(false)} />}
    </div>
  )
}
