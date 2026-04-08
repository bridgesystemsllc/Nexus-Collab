import { useAppStore } from '@/stores/appStore'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { AIPanel } from '@/components/layout/AIPanel'
import { OnboardingGuard } from '@/components/onboarding/OnboardingGuard'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { DashboardPage } from '@/app/routes/dashboard'
import { EverythingPage } from '@/app/routes/everything'
import { RDPage } from '@/app/routes/departments/rd'
import { OpsPage } from '@/app/routes/departments/ops'
import { CoworkPage } from '@/app/routes/cowork'
import { CoworkDetailPage } from '@/app/routes/cowork-detail'
import { DocsPage } from '@/app/routes/docs'
import { IntegrationsPage } from '@/app/routes/integrations'
import { DeptManagerPage } from '@/app/routes/dept-manager'
import { PulsePage } from '@/app/routes/pulse'
import { AgentSettingsPage } from '@/app/routes/agent-settings'
import { ProductCatalogPage } from '@/app/routes/product-catalog'

function PageContent() {
  const currentPage = useAppStore((s) => s.currentPage)

  switch (currentPage) {
    case 'dashboard':
      return <DashboardPage />
    case 'everything':
      return <EverythingPage />
    case 'rd':
      return <RDPage />
    case 'ops':
      return <OpsPage />
    case 'cowork':
      return <CoworkPage />
    case 'cowork-detail':
      return <CoworkDetailPage />
    case 'docs':
      return <DocsPage />
    case 'integrations':
      return <IntegrationsPage />
    case 'dept-manager':
      return <DeptManagerPage />
    case 'pulse':
      return <PulsePage />
    case 'agent-settings':
      return <AgentSettingsPage />
    case 'product-catalog':
      return <ProductCatalogPage />
    default:
      return (
        <div className="flex-1 flex items-center justify-center text-[var(--text-tertiary)]">
          <p className="text-lg">Page under construction</p>
        </div>
      )
  }
}

export function App() {
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)

  return (
    <OnboardingGuard>
      <div className="flex h-screen overflow-hidden bg-[var(--bg-base)]">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <MeetingBotBanner />
            <ErrorBoundary>
              <PageContent />
            </ErrorBoundary>
          </main>
        </div>

        {aiPanelOpen && <AIPanel />}
      </div>
    </OnboardingGuard>
  )
}

function MeetingBotBanner() {
  const currentPage = useAppStore((s) => s.currentPage)
  const showBanner = localStorage.getItem('nexus-show-meeting-bot-banner') === 'true'
    && !localStorage.getItem('nexus-meeting-bot-banner-dismissed')

  if (!showBanner || currentPage !== 'dashboard') return null

  const dismiss = () => {
    localStorage.setItem('nexus-meeting-bot-banner-dismissed', 'true')
    // Force re-render
    window.dispatchEvent(new Event('storage'))
  }

  return (
    <div className="mx-6 mt-4 p-4 bg-[var(--accent-subtle)] border border-[var(--accent)]/20 rounded-[12px] flex items-center justify-between animate-fade-in">
      <div className="flex items-center gap-3">
        <span className="text-[20px]">🤖</span>
        <p className="text-[14px] text-[var(--text-primary)]">
          <span className="font-medium">Set up your Meeting AI Bot</span>
          {' — '}
          <span className="text-[var(--text-secondary)]">connect your calendar to start auto-joining meetings and syncing notes.</span>
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <button className="text-[13px] text-[var(--accent)] font-medium hover:underline">
          Set up now
        </button>
        <button onClick={dismiss} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-[12px]">
          Dismiss
        </button>
      </div>
    </div>
  )
}
