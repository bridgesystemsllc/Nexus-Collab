import { useAppStore } from '@/stores/appStore'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { AIPanel } from '@/components/layout/AIPanel'
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
    <div className="flex h-screen overflow-hidden bg-[var(--bg-base)]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <PageContent />
        </main>
      </div>

      {aiPanelOpen && <AIPanel />}
    </div>
  )
}
