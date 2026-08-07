import { api } from '@/lib/api'
import type {
  ApiEnvelope, ProjectSummary, ProjectDetail, ProjectTask,
  ProjectTypeRef, DepartmentRef, HealthBreakdown,
} from '../types'

// ─── Projects API client ─────────────────────────────────────
// Every call goes through here so the envelope ({ data, meta }) is unwrapped
// in exactly one place and components never touch axios directly.
//
// Errors are normalised: the API returns { error: { code, message, details } },
// and axios buries that in err.response.data. Without this, every mutation
// would surface "Request failed with status code 409" instead of the message
// the server took the trouble to write.

const BASE = '/projects'

export class ProjectsApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ProjectsApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function normalizeError(err: any): never {
  const status = err?.response?.status ?? 0
  const payload = err?.response?.data?.error
  if (payload?.message) {
    throw new ProjectsApiError(status, payload.code ?? 'Error', payload.message, payload.details)
  }
  throw new ProjectsApiError(
    status,
    'NetworkError',
    err?.message ?? 'Could not reach the server',
  )
}

async function get<T>(path: string, params?: Record<string, unknown>): Promise<ApiEnvelope<T>> {
  try {
    const res = await api.get(`${BASE}${path}`, { params })
    return res.data as ApiEnvelope<T>
  } catch (err) {
    return normalizeError(err)
  }
}

async function send<T>(
  method: 'post' | 'patch' | 'delete',
  path: string,
  body?: unknown,
): Promise<ApiEnvelope<T>> {
  try {
    // axios.delete takes a config object, not a body — passing a body
    // positionally would silently send it as request config.
    const res =
      method === 'delete'
        ? await api.delete(`${BASE}${path}`)
        : await api[method](`${BASE}${path}`, body)
    // 204 responses have no body; callers only need to know it succeeded.
    return (res.data ?? { data: null, meta: {} }) as ApiEnvelope<T>
  } catch (err) {
    return normalizeError(err)
  }
}

// ─── Reference data ──────────────────────────────────────────
export const fetchDepartments = () => get<DepartmentRef[]>('/meta/departments')
export const fetchProjectTypes = () => get<ProjectTypeRef[]>('/meta/types')
export const fetchTemplates = (params: { typeId?: string; departmentId?: string }) =>
  get<{ id: string; name: string; description: string | null; projectTypeId: string | null }[]>(
    '/meta/templates', params,
  )

// ─── Projects ────────────────────────────────────────────────
export interface ProjectListParams {
  departmentId?: string
  status?: string
  health?: string
  typeId?: string
  pmId?: string
  brand?: string
  retailer?: string
  priority?: string
  search?: string
  dueBefore?: string
  includeParticipating?: boolean
  sort?: 'recent' | 'health' | 'dueDate' | 'title'
  page?: number
  limit?: number
}

export const fetchProjects = (params: ProjectListParams) =>
  get<ProjectSummary[]>('', params as Record<string, unknown>)

export const fetchProject = (id: string) => get<ProjectDetail>(`/${id}`)
export const fetchProjectHealth = (id: string) => get<HealthBreakdown>(`/${id}/health`)
export const fetchTimeline = (id: string) => get<any>(`/${id}/timeline`)

export const createProject = (body: Record<string, unknown>) =>
  send<ProjectDetail>('post', '', body)
export const updateProject = (id: string, body: Record<string, unknown>) =>
  send<ProjectDetail>('patch', `/${id}`, body)
export const setProjectStatus = (id: string, status: string, reason?: string) =>
  send<ProjectDetail>('post', `/${id}/status`, { status, ...(reason ? { reason } : {}) })
export const setBaseline = (id: string, force = false) =>
  send<ProjectDetail>('post', `/${id}/baseline`, { force })
export const deleteProject = (id: string) => send<null>('delete', `/${id}`)

// ─── Departments & members on a project ──────────────────────
export const fetchProjectDepartments = (id: string) => get<any[]>(`/${id}/departments`)
export const addProjectDepartment = (id: string, body: Record<string, unknown>) =>
  send<any>('post', `/${id}/departments`, body)
export const removeProjectDepartment = (id: string, departmentId: string) =>
  send<null>('delete', `/${id}/departments/${departmentId}`)
export const fetchProjectMembers = (id: string) => get<any[]>(`/${id}/members`)
export const addProjectMember = (id: string, body: Record<string, unknown>) =>
  send<any>('post', `/${id}/members`, body)

// ─── Tasks ───────────────────────────────────────────────────
export const fetchTasks = (
  projectId: string,
  params?: { departmentId?: string; assigneeId?: string; status?: string; groupBy?: string },
) => get<ProjectTask[]>(`/${projectId}/tasks`, params)

export const fetchMyTasks = (params?: { status?: string; limit?: number }) =>
  get<ProjectTask[]>('/tasks/my', params)

export const createTask = (projectId: string, body: Record<string, unknown>) =>
  send<ProjectTask>('post', `/${projectId}/tasks`, body)
export const updateTask = (taskId: string, body: Record<string, unknown>) =>
  send<ProjectTask>('patch', `/tasks/${taskId}`, body)
export const setTaskStatus = (taskId: string, status: string) =>
  send<ProjectTask>('post', `/tasks/${taskId}/status`, { status })
export const acceptTask = (taskId: string) => send<ProjectTask>('post', `/tasks/${taskId}/accept`, {})
export const rejectTask = (taskId: string, reason: string) =>
  send<ProjectTask>('post', `/tasks/${taskId}/reject`, { reason })
export const blockTask = (taskId: string, reason: string) =>
  send<ProjectTask>('post', `/tasks/${taskId}/block`, { reason })
export const unblockTask = (taskId: string) => send<ProjectTask>('post', `/tasks/${taskId}/unblock`, {})
export const deleteTask = (taskId: string) => send<null>('delete', `/tasks/${taskId}`)
export const addChecklistItem = (taskId: string, label: string) =>
  send<any>('post', `/tasks/${taskId}/checklist`, { label })
export const updateChecklistItem = (itemId: string, body: Record<string, unknown>) =>
  send<any>('patch', `/tasks/checklist/${itemId}`, body)

// ─── Reports ─────────────────────────────────────────────────
// The payload is generated once and stored. Everything here reads that stored
// snapshot — nothing recomputes a report on the client, or a report reopened
// next month would quietly disagree with the one that was sent out.

export interface ReportSummary {
  id: string
  reportType: string
  title: string
  periodStart: string | null
  periodEnd: string | null
  isPublished: boolean
  publishedAt: string | null
  createdAt: string
  generatedBy?: string
  narrative?: string | null
  generatedByUser?: { id: string; name: string } | null
  project?: { id: string; projectNumber: string | null; title: string } | null
  scopeDepartment?: { id: string; name: string } | null
}

export interface ReportDetail extends ReportSummary {
  payload: Record<string, any>
}

export const fetchProjectReports = (projectId: string) =>
  get<ReportSummary[]>(`/${projectId}/reports`)

export const fetchPortfolioReports = (params?: {
  reportType?: string
  departmentId?: string
  published?: 'true' | 'false'
  limit?: number
}) => get<ReportSummary[]>('/reports', params as Record<string, unknown>)

export const fetchReport = (reportId: string) => get<ReportDetail>(`/reports/${reportId}`)

export const generateProjectReport = (
  projectId: string,
  body: { reportType?: 'PROJECT_UPDATE' | 'CLOSEOUT'; withNarrative?: boolean; periodStart?: string; periodEnd?: string },
) => send<{ reportId: string; title: string; payload: any; narrative: string | null }>(
  'post', `/${projectId}/reports/generate`, body,
)

export const generatePortfolioReport = (body: {
  reportType?: 'STATUS_UPDATE' | 'EXECUTIVE_ROLLUP' | 'DEPARTMENT_DIGEST'
  departmentId?: string
  withNarrative?: boolean
  periodStart?: string
  periodEnd?: string
}) => send<{ reportId: string; title: string; payload: any; narrative: string | null }>(
  'post', '/reports/portfolio', body,
)

export const updateReportNarrative = (reportId: string, narrative: string | null) =>
  send<ReportDetail>('patch', `/reports/${reportId}`, { narrative })

export const publishReport = (reportId: string, narrative?: string) =>
  send<ReportDetail>('post', `/reports/${reportId}/publish`, narrative !== undefined ? { narrative } : {})

export const summariseCheckins = (projectId: string) =>
  send<{ summary: string | null; blockers: { blocker: string; owner: string }[]; skippedReason?: string }>(
    'post', `/${projectId}/reports/summarise-checkins`, {},
  )

/**
 * CSV/JSON export URL — hit directly by the browser so the download uses the
 * session cookie. Built from the axios instance's baseURL rather than a
 * hardcoded prefix, which would drift the moment the API is remounted.
 */
export const reportExportUrl = (reportId: string, format: 'csv' | 'json' = 'csv') =>
  `${api.defaults.baseURL ?? ''}${BASE}/reports/${reportId}/export?format=${format}`

// ─── Collab bridge ───────────────────────────────────────────
// Linking never copies a project — it grants the collab's departments access to
// the same row. These calls go to /collabs, which the API also serves under
// /cowork; one base here keeps the two from drifting.

const COLLAB_BASE = '/collabs'

async function collabGet<T>(path: string, params?: Record<string, unknown>): Promise<ApiEnvelope<T>> {
  try {
    const res = await api.get(`${COLLAB_BASE}${path}`, { params })
    return res.data as ApiEnvelope<T>
  } catch (err) {
    return normalizeError(err)
  }
}

async function collabSend<T>(
  method: 'post' | 'delete',
  path: string,
  body?: unknown,
): Promise<ApiEnvelope<T>> {
  try {
    const res =
      method === 'delete'
        ? await api.delete(`${COLLAB_BASE}${path}`)
        : await api.post(`${COLLAB_BASE}${path}`, body)
    return (res.data ?? { data: null, meta: {} }) as ApiEnvelope<T>
  } catch (err) {
    return normalizeError(err)
  }
}

export type CollabVisibility = 'FULL' | 'TASKS_ONLY' | 'SUMMARY_ONLY'

export interface CollabProjectLink {
  id: string
  visibility: CollabVisibility
  autoAddMembers: boolean
  linkedAt: string
  unlinkedAt: string | null
  linkedBy?: { id: string; name: string } | null
  project: ProjectSummary
}

export interface ProjectCollabLink {
  id: string
  visibility: CollabVisibility
  linkedAt: string
  coworkSpace: { id: string; name: string; type: string; status: string; deptNames: string[] }
  linkedBy?: { id: string; name: string } | null
}

export interface CollabBoardCard {
  id: string
  taskNumber: number | null
  title: string
  status: string
  priority: string | null
  dueDate: string | null
  blockedReason: string | null
  isCrossDept: boolean
  acceptanceStatus: string | null
  owner: { id: string; name: string } | null
  department: { id: string; name: string; color: string | null } | null
  project: { id: string; projectNumber: string | null; title: string; healthBand: string }
}

export interface CollabBoardData {
  lanes: { departmentId: string | null; departmentName: string; color: string | null; cards: CollabBoardCard[] }[]
  projects: { id: string; projectNumber: string | null; title: string; healthBand: string; visibility: CollabVisibility }[]
  totals: { tasks: number; blocked: number; overdue: number }
  excludedProjects: { id: string; title: string; reason: string }[]
}

export interface LinkPreview {
  matched: { id: string; name: string }[]
  unmatched: string[]
  memberCount: number
}

export const fetchCollabProjects = (collabId: string) =>
  collabGet<CollabProjectLink[]>(`/${collabId}/projects`)

export const fetchCollabBoard = (collabId: string) =>
  collabGet<CollabBoardData>(`/${collabId}/projects/board`)

export const fetchLinkPreview = (collabId: string) =>
  collabGet<LinkPreview>(`/${collabId}/projects/preview`)

export const linkProjectToCollab = (
  collabId: string,
  body: { projectId: string; visibility?: CollabVisibility; autoAddMembers?: boolean },
) => collabSend<{
  linkId: string
  reactivated: boolean
  departmentsAdded: string[]
  departmentsAlreadyPresent: string[]
  membersAdded: number
  unmatchedDepartmentNames: string[]
}>('post', `/${collabId}/projects`, body)

export const unlinkProjectFromCollab = (collabId: string, projectId: string) =>
  collabSend<{
    departmentsRemoved: string[]
    departmentsKept: { name: string; reason: string }[]
    membersRemoved: number
  }>('delete', `/${collabId}/projects/${projectId}`)

/** Which collabs a project is shared into — drives the "Shared via" banner. */
export const fetchProjectCollabs = (projectId: string) =>
  get<ProjectCollabLink[]>(`/${projectId}/collabs`)

// ─── Analytics ───────────────────────────────────────────────

export interface AnalyticsSummary {
  generatedAt: string
  total: number
  active: number
  byStatus: { key: string; count: number }[]
  byHealth: { key: string; count: number }[]
  byPriority: { key: string; count: number }[]
  averagePercentComplete: number
  averageHealth: number
  atRisk: number
  dueSoon: number
  overdue: number
  slip: { projectsSlipping: number; averageSlipDays: number; maxSlipDays: number }
  budget: {
    totalBudget: number; totalSpend: number
    percentSpent: number | null; projectsWithoutBudget: number
  }
  openBlockedTasks: number
  overdueTasks: number
  overdueMilestones: number
  openCriticalRisks: number
}

export interface HealthTrend {
  points: { day: string; GREEN: number; AMBER: number; RED: number; total: number; averageScore: number | null }[]
  coverage: { daysRequested: number; daysWithData: number; firstDay: string | null }
}

export interface Workload {
  generatedAt: string
  assignees: {
    ownerId: string | null; ownerName: string
    open: number; overdue: number; blocked: number
    estimatedHours: number | null; departments: string[]
  }[]
  totals: {
    openTasks: number; unassigned: number; overdue: number
    blocked: number; peopleWithWork: number
  }
}

export interface CycleTime {
  generatedAt: string
  types: {
    type: string; projects: number; completed: number
    averageActualDays: number | null; averagePlannedDays: number | null
    averageSlipDays: number | null; onTimePercent: number | null
    withoutBaseline: number
  }[]
}

export interface CheckinCompliance {
  generatedAt: string
  departments: {
    department: string; asked: number; answered: number
    rate: number; onTimeRate: number; averageHoursToRespond: number | null
  }[]
  overall: { asked: number; answered: number; rate: number; stillOpen: number }
}

type Scope = { departmentId?: string }

export const fetchAnalyticsSummary = (p: Scope = {}) =>
  get<AnalyticsSummary>('/analytics/summary', p as Record<string, unknown>)
export const fetchHealthTrend = (p: Scope & { days?: number } = {}) =>
  get<HealthTrend>('/analytics/health-trend', p as Record<string, unknown>)
export const fetchWorkload = (p: Scope = {}) =>
  get<Workload>('/analytics/workload', p as Record<string, unknown>)
export const fetchCycleTime = (p: Scope & { typeId?: string } = {}) =>
  get<CycleTime>('/analytics/cycle-time', p as Record<string, unknown>)
export const fetchCheckinCompliance = (p: Scope & { days?: number } = {}) =>
  get<CheckinCompliance>('/analytics/checkin-compliance', p as Record<string, unknown>)

// ─── Module links (§8.3) ─────────────────────────────────────

export type LinkedModule =
  | 'BRIEF' | 'NPD' | 'FORMULATION' | 'ARTWORK' | 'COMPONENT'
  | 'TECH_TRANSFER' | 'PRODUCTION_ORDER' | 'CM' | 'DASHBOARD_SKU'

export interface ModuleLink {
  id: string
  projectId: string
  module: LinkedModule
  recordId: string
  label: string | null
  linkType: 'SOURCE' | 'OUTPUT' | 'RELATED' | 'BLOCKS'
  createdAt: string
}

export interface RelatedInitiative extends ModuleLink {
  project: {
    id: string; projectNumber: string | null; title: string; status: string
    health: number; healthBand: string; percentComplete: number; targetEndDate: string | null
    ownerDepartment: { id: string; name: string; color: string | null } | null
    projectManager: { id: string; name: string } | null
  }
}

export const fetchProjectLinks = (projectId: string) =>
  get<ModuleLink[]>(`/${projectId}/links`)

export const createProjectLink = (
  projectId: string,
  body: { module: LinkedModule; recordId: string; label?: string; linkType?: ModuleLink['linkType'] },
) => send<ModuleLink>('post', `/${projectId}/links`, body)

export const deleteProjectLink = (linkId: string) => send<null>('delete', `/links/${linkId}`)

/** "Related Initiatives" for a record in another module — the reverse direction. */
export const fetchRelatedInitiatives = (module: LinkedModule, recordId: string) =>
  get<RelatedInitiative[]>('/links/by-record', { module, recordId })
