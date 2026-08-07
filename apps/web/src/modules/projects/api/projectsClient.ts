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
