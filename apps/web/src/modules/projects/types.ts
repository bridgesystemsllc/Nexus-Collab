// ─── Projects & Initiatives — shared types ───────────────────
// Mirrors the API response shapes. Kept deliberately loose where the server
// returns joined objects that vary by endpoint, and strict on the values the
// UI branches on (status, health band, roles) so a typo in a comparison is a
// compile error rather than a silently dead branch.

export type ProjectStatus =
  | 'DRAFT' | 'PROPOSED' | 'APPROVED' | 'ACTIVE' | 'ON_HOLD'
  | 'AT_RISK' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED'

export type HealthBand = 'GREEN' | 'AMBER' | 'RED'
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export type TaskStatus =
  | 'NOT_STARTED' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'COMPLETE' | 'CANCELLED'

export type DepartmentRole = 'OWNER' | 'CONTRIBUTOR' | 'REVIEWER' | 'VIEWER'

export interface DepartmentRef {
  id: string
  code: string | null
  name: string
  color?: string | null
  icon?: string | null
}

export interface MemberRef {
  id: string
  name: string
  avatar?: string | null
  email?: string | null
}

export interface ProjectTypeRef {
  id: string
  code: string
  label: string
  icon?: string | null
  description?: string | null
  requiredFields: string[]
  defaultDepartment?: DepartmentRef | null
}

export interface ProjectDepartmentRow {
  id: string
  departmentId: string
  role: DepartmentRole
  laneLeadId?: string | null
  department: DepartmentRef
  laneLead?: MemberRef | null
  /**
   * The collab link that granted this lane, if any. Present so the UI can show
   * which access a link is responsible for — and therefore what detaching it
   * would take away.
   */
  addedByLinkId?: string | null
}

export interface ProjectSummary {
  id: string
  projectNumber: string | null
  title: string
  description?: string | null
  status: ProjectStatus
  priority: Priority
  health: number
  healthBand: HealthBand
  percentComplete: string | number
  startDate?: string | null
  targetEndDate?: string | null
  baselineEndDate?: string | null
  brands: string[]
  retailers: string[]
  isConfidential: boolean
  lastActivityAt?: string | null
  projectType?: ProjectTypeRef | null
  ownerDepartment?: DepartmentRef | null
  projectManager?: MemberRef | null
  departments: ProjectDepartmentRow[]
  _count?: { tasks?: number; milestones?: number; risks?: number }
}

/** Mirrors ProjectCapabilities in apps/api/src/services/projects/capabilities.ts. */
export interface ProjectCapabilities {
  editProject: boolean
  editGovernance: boolean
  createTask: boolean
  editTaskOwnLane: boolean
  editTimeline: boolean
  setBaseline: boolean
  publishReport: boolean
}

/** Deny everything when the server sent nothing — never fail open. */
export const NO_CAPABILITIES: ProjectCapabilities = {
  editProject: false,
  editGovernance: false,
  createTask: false,
  editTaskOwnLane: false,
  editTimeline: false,
  setBaseline: false,
  publishReport: false,
}

export interface ProjectDetail extends ProjectSummary {
  businessCase?: string | null
  successCriteria?: string | null
  lessonsLearned?: string | null
  markets: string[]
  actualEndDate?: string | null
  baselinedAt?: string | null
  budgetAmount?: string | number | null
  actualSpend?: string | number | null
  currency: string
  customFields: Record<string, unknown>
  capabilities?: ProjectCapabilities
  checkinCadence: string
  nextCheckinAt?: string | null
  executiveSponsor?: MemberRef | null
  members: {
    id: string
    memberId: string
    role: string
    isWatcher: boolean
    member: MemberRef
    department?: DepartmentRef | null
  }[]
  moduleLinks: { id: string; module: string; recordId: string; label?: string | null; linkType: string }[]
  collabLinks: { id: string; coworkSpaceId: string; visibility: string; coworkSpace: { id: string; name: string } }[]
}

export interface ProjectTask {
  id: string
  taskNumber: number | null
  title: string
  description?: string | null
  status: TaskStatus
  priority: Priority
  departmentId: string | null
  ownerId: string | null
  phaseId: string | null
  milestoneId: string | null
  startDate?: string | null
  dueDate?: string | null
  completedAt?: string | null
  estimatedHours?: string | number | null
  percentComplete: number
  blockedReason?: string | null
  blockedSince?: string | null
  isCrossDept: boolean
  acceptanceStatus?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null
  acceptanceNote?: string | null
  requestedById?: string | null
  tags: string[]
  sortOrder: number
  department?: DepartmentRef | null
  owner?: MemberRef | null
  requestedBy?: MemberRef | null
  phase?: { id: string; name: string; sequence: number } | null
  checklist?: { id: string; label: string; isDone: boolean; sortOrder: number }[]
  _count?: { dependenciesIn?: number; dependenciesOut?: number; subtasks?: number }
  // Present on the timeline endpoint only.
  isCriticalPath?: boolean
  floatDays?: number | null
  isOverdue?: boolean
  durationDays?: number
}

export interface HealthPenalty {
  code: string
  label: string
  points: number
  count?: number
  cappedAt?: number
}

export interface HealthBreakdown {
  score: number
  band: HealthBand
  penalties: HealthPenalty[]
  percentComplete: number
  statusAutoSetTo?: string
}

export interface ApiEnvelope<T> {
  data: T
  meta: Record<string, unknown> & {
    total?: number
    page?: number
    limit?: number
    pages?: number
  }
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown }
}

// ─── Display constants ───────────────────────────────────────
// Colour and copy live together so a status can never render with a label from
// one place and a colour from another.

export const HEALTH_COLORS: Record<HealthBand, string> = {
  GREEN: 'var(--success)',
  AMBER: 'var(--warning)',
  RED: 'var(--danger)',
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: 'Draft',
  PROPOSED: 'Proposed',
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  AT_RISK: 'At risk',
  BLOCKED: 'Blocked',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  ARCHIVED: 'Archived',
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  NOT_STARTED: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  BLOCKED: 'Blocked',
  COMPLETE: 'Done',
  CANCELLED: 'Cancelled',
}

// Board column order. CANCELLED is deliberately absent — cancelled work should
// not occupy a column on a working board.
export const BOARD_COLUMNS: TaskStatus[] = [
  'NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'COMPLETE',
]

export const PRIORITY_COLORS: Record<Priority, string> = {
  CRITICAL: 'var(--danger)',
  HIGH: 'var(--warning)',
  MEDIUM: 'var(--text-tertiary)',
  LOW: 'var(--text-tertiary)',
}

/** Percent values arrive as Prisma Decimal strings; normalise for display. */
export function toPercent(value: string | number | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(n) ? Math.round((n as number) * 10) / 10 : 0
}
