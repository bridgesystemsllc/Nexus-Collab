import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertCircle,
  CheckCircle,
  CircleX,
  Cloud,
  CreditCard,
  Database,
  HardDrive,
  KeyRound,
  Loader2,
  Server,
  Shield,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Section, Alert } from '../components/SettingsPrimitives'

interface ReadinessChecks {
  database: boolean
  session: boolean
  tokenEncryption: boolean
  sentry: boolean
  microsoftGraph: boolean
  stripe: boolean
  storage: boolean
}

interface ReadinessResponse {
  data: {
    ready: boolean
    checks: ReadinessChecks
    version: string
    time: string
  }
}

async function fetchReadiness(): Promise<ReadinessResponse['data']> {
  const res = await api.get<ReadinessResponse>('/system/readiness')
  return res.data.data
}

interface CheckItemProps {
  label: string
  description: string
  status: boolean
  required?: boolean
  icon: typeof Database
}

function CheckItem({ label, description, status, required, icon: Icon }: CheckItemProps) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg px-3 py-2.5"
      style={{ background: status ? 'rgba(15, 123, 108, 0.04)' : required ? 'rgba(235, 87, 87, 0.04)' : 'rgba(0, 0, 0, 0.02)' }}
    >
      <div
        className="mt-0.5 shrink-0 rounded-full p-1.5"
        style={{
          background: status ? 'rgba(15, 123, 108, 0.1)' : required ? 'rgba(235, 87, 87, 0.1)' : 'rgba(0, 0, 0, 0.05)',
        }}
      >
        <Icon size={14} style={{ color: status ? 'var(--success)' : required ? 'var(--danger)' : 'var(--text-tertiary)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--text-primary)]">{label}</span>
          {status ? (
            <CheckCircle size={12} style={{ color: 'var(--success)' }} />
          ) : required ? (
            <CircleX size={12} style={{ color: 'var(--danger)' }} />
          ) : (
            <AlertCircle size={12} style={{ color: 'var(--text-tertiary)' }} />
          )}
          {required && !status && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase"
              style={{ background: 'rgba(235, 87, 87, 0.1)', color: 'var(--danger)' }}
            >
              Required
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{description}</p>
      </div>
    </div>
  )
}

export function SystemSection() {
  const readiness = useQuery({
    queryKey: ['system', 'readiness'],
    queryFn: fetchReadiness,
    refetchInterval: 30000,
  })

  return (
    <div className="space-y-4">
      <Section
        title="System Readiness"
        description="Production configuration status. Shows whether required services are configured."
      >
        {readiness.isLoading ? (
          <div
            className="flex items-center justify-center gap-2 rounded-lg py-12"
            style={{ background: '#F5F5F7' }}
          >
            <Loader2 size={16} className="animate-spin" style={{ color: '#0071E3' }} />
            <span className="text-xs" style={{ color: '#0071E3' }}>
              Checking system readiness…
            </span>
          </div>
        ) : readiness.isError || !readiness.data ? (
          <Alert>
            Could not check system readiness. You may not have the required permissions.
          </Alert>
        ) : (
          <div className="space-y-4">
            <div
              className="flex items-center gap-3 rounded-lg px-4 py-3"
              style={{
                background: readiness.data.ready ? 'rgba(15, 123, 108, 0.06)' : 'rgba(235, 87, 87, 0.06)',
                border: `1px solid ${readiness.data.ready ? 'rgba(15, 123, 108, 0.2)' : 'rgba(235, 87, 87, 0.2)'}`,
              }}
            >
              {readiness.data.ready ? (
                <CheckCircle size={20} style={{ color: 'var(--success)' }} />
              ) : (
                <AlertCircle size={20} style={{ color: 'var(--danger)' }} />
              )}
              <div>
                <p className="text-sm font-semibold" style={{ color: readiness.data.ready ? 'var(--success)' : 'var(--danger)' }}>
                  {readiness.data.ready ? 'System Ready' : 'Configuration Required'}
                </p>
                <p className="text-[11px] text-[var(--text-tertiary)]">
                  v{readiness.data.version} · Last checked {new Date(readiness.data.time).toLocaleTimeString()}
                </p>
              </div>
            </div>

            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border-default)', background: '#F5F5F7' }}>
              <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Core Services
              </h4>
              <div className="space-y-2">
                <CheckItem
                  icon={Database}
                  label="Database"
                  description="PostgreSQL connection healthy"
                  status={readiness.data.checks.database}
                  required
                />
                <CheckItem
                  icon={Shield}
                  label="Session Store"
                  description="SESSION_SECRET configured for secure cookies"
                  status={readiness.data.checks.session}
                  required
                />
                <CheckItem
                  icon={KeyRound}
                  label="Token Encryption"
                  description="TOKEN_ENCRYPTION_KEY set for OAuth tokens"
                  status={readiness.data.checks.tokenEncryption}
                  required
                />
              </div>

              <h4 className="mb-3 mt-5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Optional Integrations
              </h4>
              <div className="space-y-2">
                <CheckItem
                  icon={Cloud}
                  label="Microsoft Graph"
                  description="Entra ID / Microsoft 365 integration"
                  status={readiness.data.checks.microsoftGraph}
                />
                <CheckItem
                  icon={CreditCard}
                  label="Stripe"
                  description="Payment processing credentials"
                  status={readiness.data.checks.stripe}
                />
                <CheckItem
                  icon={HardDrive}
                  label="Cloud Storage"
                  description="S3-compatible file storage"
                  status={readiness.data.checks.storage}
                />
                <CheckItem
                  icon={Activity}
                  label="Sentry"
                  description="Error tracking and monitoring"
                  status={readiness.data.checks.sentry}
                />
              </div>
            </div>

            <p className="text-[10px] text-[var(--text-tertiary)]">
              This panel shows configuration status only — no secret values are exposed. Missing optional
              integrations may limit specific features but do not prevent the application from running.
            </p>
          </div>
        )}
      </Section>
    </div>
  )
}
