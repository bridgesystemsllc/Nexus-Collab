import { FolderKanban } from 'lucide-react'
import { ProjectsModule } from '@/modules/projects/ProjectsModule'
import { useAppStore } from '@/stores/appStore'

// ─── Portfolio page ──────────────────────────────────────────
// Every initiative the viewer can see, across all departments. Renders the
// exact same module as each department tab — only the scope differs.

export function ProjectsPage() {
  const selectedProjectId = useAppStore((s) => s.selectedProjectId)
  const setSelectedProject = useAppStore((s) => s.setSelectedProject)

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--accent-secondary-light)', color: 'var(--accent-secondary)' }}
        >
          <FolderKanban size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Projects &amp; Initiatives
          </h1>
          <p className="text-sm text-[var(--text-tertiary)]">
            Every initiative across the business, with the departments working it
          </p>
        </div>
      </div>

      <ProjectsModule
        scope={{ type: 'portfolio' }}
        projectId={selectedProjectId}
        onSelectProject={setSelectedProject}
      />
    </div>
  )
}
