/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { IntegrationsSection, SanitizedConnector, Automation } from '../IntegrationsSection'

// §5.2: Render test verifying masked fields are shown and secrets are NOT rendered

// Mock fetch for API calls
const mockConnectors: SanitizedConnector[] = [
  {
    id: 'conn-1',
    type: 'GENERIC_HTTP',
    name: 'Test HTTP Connector',
    status: 'CONNECTED',
    paused: false,
    authType: 'API_KEY',
    lastTestAt: '2026-09-01T12:00:00Z',
    lastTestOk: true,
    lastError: null,
    consecutiveFailures: 0,
    circuitOpenUntil: null,
    hasCredentials: true,
    apiKeyMasked: '••••a1b2', // masked last 4
    config: {
      baseUrl: 'https://api.example.com',
      routing: { orders: true, inventory: false },
      outbound: { sync: true },
      liveVerified: true,
    },
  },
  {
    id: 'conn-2',
    type: 'ERP_KAREVE_SYNC',
    name: 'ERP Connection',
    status: 'DISCONNECTED',
    paused: false,
    authType: 'API_KEY',
    lastTestAt: null,
    lastTestOk: null,
    lastError: null,
    consecutiveFailures: 0,
    circuitOpenUntil: null,
    hasCredentials: false,
    apiKeyMasked: null,
    config: {
      apiUrl: 'https://erp.example.com/api',
    },
  },
]

const mockAutomations: Automation[] = [
  {
    id: 'auto-1',
    name: 'Hourly Sync',
    description: 'Sync data every hour',
    connectorId: 'conn-1',
    triggerType: 'SCHEDULE',
    triggerConfig: { everyMinutes: 60, timezone: 'America/New_York' },
    actionType: 'HTTP_REQUEST',
    actionConfig: { method: 'POST', path: '/sync' },
    status: 'ACTIVE',
    nextRunAt: '2026-09-01T13:00:00Z',
    lastRunAt: '2026-09-01T12:00:00Z',
    lastRunOk: true,
    lastError: null,
  },
  {
    id: 'auto-2',
    name: 'Draft Automation',
    description: 'Needs activation',
    connectorId: 'conn-1',
    triggerType: 'SCHEDULE',
    triggerConfig: { everyMinutes: 15 },
    actionType: 'HTTP_REQUEST',
    actionConfig: { method: 'GET', path: '/status' },
    status: 'DRAFT',
    nextRunAt: null,
    lastRunAt: null,
    lastRunOk: null,
    lastError: null,
  },
]

// Sensitive JSON keys that MUST NOT appear in the rendered output
// These are patterns that indicate a secret field is being rendered
const FORBIDDEN_SECRET_PATTERNS = [
  '"iv":', // JSON key for initialization vector
  '"encrypted":', // JSON key for encrypted data
  '"tag":', // JSON key for auth tag
  '"apiKey":', // JSON key for API key
  '"secrets":', // JSON key for secrets object
  '"password":', // JSON key for password
  '"token":', // JSON key for token
  '"webhookSecret":', // JSON key for webhook secret
  'sk-secret-key', // Actual secret value pattern
  'base64encrypteddata', // Encrypted blob pattern
]

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  )
}

describe('IntegrationsSection', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/v1/integrations')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConnectors),
        } as Response)
      }
      if (url.includes('/api/v1/automations')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockAutomations),
        } as Response)
      }
      return Promise.reject(new Error('Unknown URL'))
    }) as typeof fetch
  })

  describe('masked credentials display', () => {
    it('shows hasCredentials badge when connector has credentials', async () => {
      renderWithProviders(<IntegrationsSection />)

      await waitFor(() => {
        expect(screen.getByTestId('has-credentials')).toBeInTheDocument()
      })

      expect(screen.getByTestId('has-credentials')).toHaveTextContent('Credentials set')
    })

    it('shows apiKeyMasked with last 4 digits', async () => {
      renderWithProviders(<IntegrationsSection />)

      await waitFor(() => {
        expect(screen.getByTestId('api-key-masked')).toBeInTheDocument()
      })

      const maskedKey = screen.getByTestId('api-key-masked')
      expect(maskedKey).toHaveTextContent('API Key: ••••a1b2')
    })

    it('shows ERP routing and outbound config', async () => {
      renderWithProviders(<IntegrationsSection />)

      await waitFor(() => {
        expect(screen.getByTestId('erp-routing')).toBeInTheDocument()
      })

      expect(screen.getByTestId('erp-routing')).toHaveTextContent('Routing: orders')
      expect(screen.getByTestId('erp-outbound')).toHaveTextContent('Outbound: sync')
    })
  })

  describe('no secrets rendered', () => {
    it('does not render iv, encrypted, tag, apiKey, or other secret JSON keys in the DOM', async () => {
      renderWithProviders(<IntegrationsSection />)

      await waitFor(() => {
        expect(screen.getByTestId('connectors-list')).toBeInTheDocument()
      })

      const container = screen.getByTestId('integrations-section')
      const html = container.innerHTML.toLowerCase()

      for (const pattern of FORBIDDEN_SECRET_PATTERNS) {
        expect(html).not.toContain(pattern.toLowerCase())
      }
    })

    it('SanitizedConnector interface excludes secret fields', () => {
      const connector: SanitizedConnector = mockConnectors[0]

      expect(connector).not.toHaveProperty('iv')
      expect(connector).not.toHaveProperty('encrypted')
      expect(connector).not.toHaveProperty('tag')
      expect(connector).not.toHaveProperty('apiKey')
      expect(connector).not.toHaveProperty('secrets')
      expect(connector).not.toHaveProperty('password')
      expect(connector).not.toHaveProperty('token')

      expect(connector).toHaveProperty('hasCredentials')
      expect(connector).toHaveProperty('apiKeyMasked')
    })
  })

  describe('connector status display', () => {
    it('shows DISCONNECTED status', async () => {
      renderWithProviders(<IntegrationsSection />)

      await waitFor(() => {
        expect(screen.getAllByTestId('connector-status').length).toBeGreaterThan(0)
      })

      const statuses = screen.getAllByTestId('connector-status')
      const disconnectedStatus = statuses.find((s) => s.textContent === 'Disconnected')
      expect(disconnectedStatus).toBeInTheDocument()
    })

    it('shows CONNECTED status', async () => {
      renderWithProviders(<IntegrationsSection />)

      await waitFor(() => {
        expect(screen.getAllByTestId('connector-status').length).toBeGreaterThan(0)
      })

      const statuses = screen.getAllByTestId('connector-status')
      const connectedStatus = statuses.find((s) => s.textContent === 'Connected')
      expect(connectedStatus).toBeInTheDocument()
    })
  })

  describe('automation display', () => {
    it('shows triggerType and triggerConfig.everyMinutes', async () => {
      renderWithProviders(<IntegrationsSection />)

      await waitFor(() => {
        expect(screen.getAllByTestId('trigger-type').length).toBeGreaterThan(0)
      })

      const triggerElements = screen.getAllByTestId('trigger-type')
      const scheduleElement = triggerElements.find((el) => el.textContent?.includes('SCHEDULE'))
      expect(scheduleElement).toBeInTheDocument()

      const triggerConfig = screen.getAllByTestId('trigger-config')
      expect(triggerConfig.some((el) => el.textContent?.includes('Every hour'))).toBe(true)
    })

    it('shows actionType and actionConfig', async () => {
      renderWithProviders(<IntegrationsSection />)

      await waitFor(() => {
        expect(screen.getAllByTestId('action-config').length).toBeGreaterThan(0)
      })

      const actionConfigs = screen.getAllByTestId('action-config')
      expect(actionConfigs.some((el) => el.textContent?.includes('HTTP_REQUEST: POST /sync'))).toBe(
        true
      )
    })

    it('shows DRAFT status with Activate button', async () => {
      renderWithProviders(<IntegrationsSection />)

      await waitFor(() => {
        expect(screen.getAllByTestId('automation-status').length).toBeGreaterThan(0)
      })

      const statuses = screen.getAllByTestId('automation-status')
      const draftStatus = statuses.find((s) => s.textContent === 'Draft')
      expect(draftStatus).toBeInTheDocument()

      expect(screen.getByTestId('activate-button')).toBeInTheDocument()
      expect(screen.getByTestId('activate-button')).toHaveTextContent('Activate')
    })
  })

  describe('empty state', () => {
    it('shows empty CTA when no connectors', async () => {
      global.fetch = vi.fn((url: string) => {
        if (url.includes('/api/v1/integrations')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          } as Response)
        }
        if (url.includes('/api/v1/automations')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          } as Response)
        }
        return Promise.reject(new Error('Unknown URL'))
      }) as typeof fetch

      renderWithProviders(<IntegrationsSection />)

      await waitFor(() => {
        expect(screen.getByTestId('connectors-empty')).toBeInTheDocument()
      })

      expect(screen.getByText('No connectors yet')).toBeInTheDocument()
      expect(screen.getByText('Add your first connector')).toBeInTheDocument()
    })

    it('shows empty CTA when no automations', async () => {
      global.fetch = vi.fn((url: string) => {
        if (url.includes('/api/v1/integrations')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          } as Response)
        }
        if (url.includes('/api/v1/automations')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          } as Response)
        }
        return Promise.reject(new Error('Unknown URL'))
      }) as typeof fetch

      renderWithProviders(<IntegrationsSection />)

      await waitFor(() => {
        expect(screen.getByTestId('automations-empty')).toBeInTheDocument()
      })

      expect(screen.getByText('No automations yet')).toBeInTheDocument()
      expect(screen.getByText('Create your first automation')).toBeInTheDocument()
    })
  })
})
