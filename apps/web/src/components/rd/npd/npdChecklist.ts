// ─── NPD Task Master Checklist & Helper Utilities ───────────────────────────
// All 34 tasks across 5 stages + 2 gates for the New Product Development process.

// ─── NPDTask Interface ──────────────────────────────────────────────────────

export interface NPDTask {
  id: string
  stageKey: string
  taskNumber: string
  taskName: string
  collaborators: string
  leadRole: string
  assignedName: string
  helperComment: string
  isGateTask: boolean
  status: 'not_started' | 'in_progress' | 'complete' | 'blocked' | 'skipped'
  blockedReason?: string
  dueDate: string
  completedAt?: string
  completedBy?: string
  notes: { user: string; text: string; createdAt: string }[]
  attachments: { name: string; url: string }[]
}

// ─── 1) STAGE_CONFIG ────────────────────────────────────────────────────────

export const STAGE_CONFIG = [
  { key: '0', name: 'Feasibility', color: '#6366F1', taskCount: 4 },
  { key: '1', name: 'Scoping & Brief', color: '#F59E0B', taskCount: 10 },
  { key: '1/2', name: 'Pipe / Launch Gate', color: '#F97316', taskCount: 1, isGate: true },
  { key: '2', name: 'Business Case', color: '#8B5CF6', taskCount: 8 },
  { key: '2/3', name: 'Artwork Gate', color: '#F43F5E', taskCount: 1, isGate: true },
  { key: '3', name: 'Development', color: '#06B6D4', taskCount: 5 },
  { key: '4', name: 'Testing & Validation', color: '#10B981', taskCount: 5 },
] as const

// ─── 2) ChecklistTemplate & MASTER_CHECKLIST ────────────────────────────────

export interface ChecklistTemplate {
  stageKey: string
  taskNumber: string
  taskName: string
  collaborators: string
  leadRole: string
  helperComment: string
  isGateTask: boolean
}

export const MASTER_CHECKLIST: ChecklistTemplate[] = [
  // ── STAGE 0 — Feasibility (4 tasks) ──
  {
    stageKey: '0',
    taskNumber: '0.1',
    taskName: 'Feasibility Kickoff',
    collaborators: 'Cross-Department',
    leadRole: 'Product Development Lead',
    helperComment: 'Strategic meeting based on feasibility template, before full brief',
    isGateTask: false,
  },
  {
    stageKey: '0',
    taskNumber: '0.2',
    taskName: 'Confirm Annual Volume',
    collaborators: 'Launch Manager, Sales',
    leadRole: 'Sales / Demand Planning',
    helperComment: 'Sales & demand planning; pipeline?',
    isGateTask: false,
  },
  {
    stageKey: '0',
    taskNumber: '0.3',
    taskName: 'Confirm Amazon Volume (if Needed)',
    collaborators: 'Launch Manager, Sales',
    leadRole: 'Amazon / Demand Planning',
    helperComment: 'Sales & demand planning; pipeline?',
    isGateTask: false,
  },
  {
    stageKey: '0',
    taskNumber: '0.4',
    taskName: 'Kickoff Meeting',
    collaborators: 'Launch Manager, Cross-Department',
    leadRole: 'Product Development Lead',
    helperComment: 'Gathering information from sales, head of business, marketing, demand planning',
    isGateTask: false,
  },

  // ── STAGE 1 — Scoping & Brief (10 tasks) ──
  {
    stageKey: '1',
    taskNumber: '1.1',
    taskName: 'Brief Submission',
    collaborators: 'Marketing, R&D',
    leadRole: 'Marketing / PD / R&D',
    helperComment: '',
    isGateTask: false,
  },
  {
    stageKey: '1',
    taskNumber: '1.2',
    taskName: 'Formula Submission Review',
    collaborators: 'Marketing, R&D',
    leadRole: 'R&D Lead',
    helperComment: 'Submission from CM',
    isGateTask: false,
  },
  {
    stageKey: '1',
    taskNumber: '1.3',
    taskName: 'Formula Approval',
    collaborators: 'Marketing, R&D',
    leadRole: 'R&D Director',
    helperComment: '',
    isGateTask: false,
  },
  {
    stageKey: '1',
    taskNumber: '1.4',
    taskName: 'Packout Confirmation (Amazon / Non-Amazon)',
    collaborators: 'Operations, Marketing',
    leadRole: 'Operations Director',
    helperComment: 'Confirm case QTY, autobag, dividers, dunnage, inserts, shipper weight/quality, etc.',
    isGateTask: false,
  },
  {
    stageKey: '1',
    taskNumber: '1.5',
    taskName: 'Pack Identification (Details in Brief)',
    collaborators: 'Launch Manager, R&D',
    leadRole: 'Launch Manager',
    helperComment: '',
    isGateTask: false,
  },
  {
    stageKey: '1',
    taskNumber: '1.6',
    taskName: 'Pack Costing & Cost Approval',
    collaborators: 'Launch Manager',
    leadRole: 'Product Development Lead',
    helperComment: '',
    isGateTask: false,
  },
  {
    stageKey: '1',
    taskNumber: '1.7',
    taskName: 'Artwork File Creation',
    collaborators: 'Launch Manager, Marketing, Graphics',
    leadRole: 'R&D Lead',
    helperComment: '',
    isGateTask: false,
  },
  {
    stageKey: '1',
    taskNumber: '1.8',
    taskName: 'Compatibility / Other Testing',
    collaborators: 'R&D',
    leadRole: 'R&D Lead',
    helperComment: 'R&D will review and approve costs for any testing needs. They will request PO from launch manager.',
    isGateTask: false,
  },
  {
    stageKey: '1',
    taskNumber: '1.9',
    taskName: 'Compatibility / Other Testing PO',
    collaborators: 'R&D Director',
    leadRole: 'R&D Director',
    helperComment: '',
    isGateTask: false,
  },
  {
    stageKey: '1',
    taskNumber: '1.10',
    taskName: 'COG Review / Proposal (Internal)',
    collaborators: 'Launch Manager, Sales, Operations',
    leadRole: 'Product Development Lead / Operations Director',
    helperComment: '',
    isGateTask: false,
  },

  // ── GATE 1/2 — Pipe / Launch Gate (1 task) ──
  {
    stageKey: '1/2',
    taskNumber: 'G1.1',
    taskName: 'Confirm Pipe / Launch Order',
    collaborators: 'Launch Manager',
    leadRole: 'Operations Director',
    helperComment: 'Gather information from sales, head of business, marketing, demand planning',
    isGateTask: true,
  },

  // ── STAGE 2 — Business Case (8 tasks) ──
  {
    stageKey: '2',
    taskNumber: '2.1',
    taskName: 'COG Approval',
    collaborators: 'Head of Business',
    leadRole: 'Head of Business',
    helperComment: '',
    isGateTask: false,
  },
  {
    stageKey: '2',
    taskNumber: '2.2',
    taskName: 'Launch Cost Approval (Finance)',
    collaborators: 'Launch Manager',
    leadRole: 'Operations Director',
    helperComment: 'Submit full cost: MOQ/launch QTY, validation, pilot/line trial',
    isGateTask: false,
  },
  {
    stageKey: '2',
    taskNumber: '2.3',
    taskName: 'Code Creation (SKU, UPC, GTIN)',
    collaborators: 'Launch Manager, Operations',
    leadRole: 'Operations Director / Operations Assistant',
    helperComment: 'Operations assistant',
    isGateTask: false,
  },
  {
    stageKey: '2',
    taskNumber: '2.4',
    taskName: 'Amazon Code (Determine if Needed)',
    collaborators: 'Operations',
    leadRole: 'Operations Director',
    helperComment: '',
    isGateTask: false,
  },
  {
    stageKey: '2',
    taskNumber: '2.5',
    taskName: 'BOM Creation (Part Numbers)',
    collaborators: 'Operations',
    leadRole: 'BOM / Operations Lead',
    helperComment: 'Confirm format (size), primary pack, and secondary pack',
    isGateTask: false,
  },
  {
    stageKey: '2',
    taskNumber: '2.6',
    taskName: 'Pack Approval',
    collaborators: 'Marketing',
    leadRole: 'Product Development Lead / Operations Director',
    helperComment: 'Confirm retailer packout requirements; Emerson vs KarEve labeling and storage requirements',
    isGateTask: false,
  },
  {
    stageKey: '2',
    taskNumber: '2.7',
    taskName: 'Artwork Development (FIL, Claims)',
    collaborators: 'R&D, Marketing, Graphics',
    leadRole: 'R&D / PD / Operations',
    helperComment: '',
    isGateTask: false,
  },
  {
    stageKey: '2',
    taskNumber: '2.8',
    taskName: 'Samples of Packaging (to CM)',
    collaborators: 'Launch Manager',
    leadRole: 'R&D / PD / Operations',
    helperComment: 'Ensure CM receives packaging samples for testing/compatibility; vendor contacts and final quotes shared',
    isGateTask: false,
  },

  // ── GATE 2/3 — Artwork Gate (1 task) ──
  {
    stageKey: '2/3',
    taskNumber: 'G2.1',
    taskName: 'Artwork Finalization / Sign Off',
    collaborators: 'Launch Manager, Marketing, R&D',
    leadRole: 'Product Development Lead / Operations Director',
    helperComment: '',
    isGateTask: true,
  },

  // ── STAGE 3 — Development (5 tasks) ──
  {
    stageKey: '3',
    taskNumber: '3.1',
    taskName: 'Code / BOM Send (to CM)',
    collaborators: 'Launch Manager, Operations',
    leadRole: 'Operations Director',
    helperComment: 'Finalized packout requirements, codes, case quantities, basic dimensions; ready for PO',
    isGateTask: false,
  },
  {
    stageKey: '3',
    taskNumber: '3.2',
    taskName: 'Artwork Send (to CM)',
    collaborators: 'R&D, Operations',
    leadRole: 'Product Development Lead',
    helperComment: '',
    isGateTask: false,
  },
  {
    stageKey: '3',
    taskNumber: '3.3',
    taskName: 'Vendor Proof Share (with Marketing)',
    collaborators: 'R&D, Operations',
    leadRole: 'Product Development Lead',
    helperComment: '',
    isGateTask: false,
  },
  {
    stageKey: '3',
    taskNumber: '3.4',
    taskName: 'Proof Approval',
    collaborators: 'Marketing',
    leadRole: 'Brand Manager',
    helperComment: '',
    isGateTask: false,
  },
  {
    stageKey: '3',
    taskNumber: '3.5',
    taskName: 'PO Submission',
    collaborators: 'Launch Manager',
    leadRole: 'PO Manager',
    helperComment: 'Submit PO with approved MOQ, COG, and validation, pilot, line trial costs',
    isGateTask: false,
  },

  // ── STAGE 4 — Testing & Validation (5 tasks) ──
  {
    stageKey: '4',
    taskNumber: '4.1',
    taskName: 'Specifications Request / BOM Finalization',
    collaborators: 'Launch Manager, Operations',
    leadRole: 'Operations Director',
    helperComment: 'Request final specs (dims, weights) for 3PL and customers',
    isGateTask: false,
  },
  {
    stageKey: '4',
    taskNumber: '4.2',
    taskName: 'Line Trial',
    collaborators: 'R&D',
    leadRole: 'R&D Director / Product Development Lead',
    helperComment: 'If necessary before production',
    isGateTask: false,
  },
  {
    stageKey: '4',
    taskNumber: '4.3',
    taskName: 'Production Timeline Confirmation',
    collaborators: 'Launch Manager, Operations',
    leadRole: 'Launch Manager',
    helperComment: 'Confirm timeline and PAD with CM after PO is processed',
    isGateTask: false,
  },
  {
    stageKey: '4',
    taskNumber: '4.4',
    taskName: 'PAD Confirmation / Communication to Team',
    collaborators: 'Launch Manager',
    leadRole: 'Launch Manager',
    helperComment: 'Communicate initial PAD to the team in regular updates',
    isGateTask: false,
  },
  {
    stageKey: '4',
    taskNumber: '4.5',
    taskName: 'Launch Tracker Updates',
    collaborators: 'Launch Manager',
    leadRole: 'Launch Manager',
    helperComment: 'Update launch tracker with changes and reflect in regular updates',
    isGateTask: false,
  },
]

// ─── 3) ROLE_TO_TEAM_KEY ───────────────────────────────────────────────────

export const ROLE_TO_TEAM_KEY: Record<string, string> = {
  'Product Development Lead': 'Product Development Lead',
  'R&D Director': 'R&D Director',
  'R&D Lead': 'R&D Lead',
  'Operations Director': 'Operations Director',
  'Operations Director / Operations Assistant': 'Operations Director',
  'Launch Manager': 'Launch Manager',
  'Brand Manager': 'Brand Manager',
  'Head of Business': 'Head of Business',
  'Sales / Demand Planning': 'Sales / Demand Planning',
  'Amazon / Demand Planning': 'Amazon/Operations',
  'BOM / Operations Lead': 'BOM / Operations Lead',
  'PO Manager': 'PO Manager',
  'Marketing / PD / R&D': 'Product Development Lead',
  'Product Development Lead / Operations Director': 'Product Development Lead',
  'R&D / PD / Operations': 'Product Development Lead',
  'R&D Director / Product Development Lead': 'R&D Director',
  'Finance Lead': 'Finance Lead',
}

// ─── Stage-key to stageDates key mapping ────────────────────────────────────

const STAGE_DATE_KEY: Record<string, string> = {
  '0': 'stage0Target',
  '1': 'stage1Target',
  '1/2': 'gate12Target',
  '2': 'stage2Target',
  '2/3': 'gate23Target',
  '3': 'stage3Target',
  '4': 'stage4Target',
}

// ─── 4) createDefaultTasks ──────────────────────────────────────────────────

export function createDefaultTasks(
  teamAssignments: { role: string; assignedName: string }[],
  stageDates: Record<string, string>
): Omit<NPDTask, 'id'>[] {
  return MASTER_CHECKLIST.map((template) => {
    const teamKey = ROLE_TO_TEAM_KEY[template.leadRole] ?? template.leadRole
    const assignment = teamAssignments.find((a) => a.role === teamKey)
    const assignedName = assignment?.assignedName ?? ''
    const dateKey = STAGE_DATE_KEY[template.stageKey] ?? ''
    const dueDate = dateKey ? stageDates[dateKey] ?? '' : ''

    return {
      stageKey: template.stageKey,
      taskNumber: template.taskNumber,
      taskName: template.taskName,
      collaborators: template.collaborators,
      leadRole: template.leadRole,
      assignedName,
      helperComment: template.helperComment,
      isGateTask: template.isGateTask,
      status: 'not_started' as const,
      dueDate,
      notes: [],
      attachments: [],
    }
  })
}

// ─── 5) Helper Functions ────────────────────────────────────────────────────

/**
 * Returns percentage (0–100) of completed tasks in a given stage.
 */
export function getStageProgress(tasks: NPDTask[], stageKey: string): number {
  if (!tasks || tasks.length === 0) return 0
  const stageTasks = tasks.filter((t) => t.stageKey === stageKey && t.status !== 'skipped')
  if (stageTasks.length === 0) return 0
  const completed = stageTasks.filter((t) => t.status === 'complete').length
  return Math.round((completed / stageTasks.length) * 100)
}

/**
 * Returns overall completion counts and percentage.
 */
export function getOverallProgress(tasks: NPDTask[]): {
  completed: number
  total: number
  percent: number
} {
  if (!tasks || tasks.length === 0) return { completed: 0, total: 0, percent: 0 }
  const activeTasks = tasks.filter((t) => t.status !== 'skipped')
  const total = activeTasks.length
  const completed = activeTasks.filter((t) => t.status === 'complete').length
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)
  return { completed, total, percent }
}

/**
 * Determines the current active stage based on task completion and gate approvals.
 * Returns the highest unlocked stage that still has incomplete tasks, or the last stage.
 */
export function getCurrentStage(
  tasks: NPDTask[],
  gateApprovals: { gate: string }[]
): string {
  if (!tasks || tasks.length === 0) return '0'

  const stageKeys = ['0', '1', '1/2', '2', '2/3', '3', '4']

  for (let i = stageKeys.length - 1; i >= 0; i--) {
    const key = stageKeys[i]
    if (!isStageUnlocked(key, tasks, gateApprovals)) continue

    const stageTasks = tasks.filter((t) => t.stageKey === key)
    if (stageTasks.length === 0) continue
    const hasIncomplete = stageTasks.some((t) => t.status !== 'complete' && t.status !== 'skipped')
    if (hasIncomplete) return key
  }

  // All tasks complete — return last stage
  return '4'
}

/**
 * Checks whether a stage is unlocked based on prior stage completion and gate approvals.
 */
export function isStageUnlocked(
  stageKey: string,
  tasks: NPDTask[],
  gateApprovals: { gate: string }[]
): boolean {
  if (!tasks) return stageKey === '0'
  const gateSet = new Set((gateApprovals || []).map((g) => g.gate))

  switch (stageKey) {
    case '0':
      return true

    case '1':
      // Unlocked when stage 0 has at least 1 complete task
      return tasks.filter((t) => t.stageKey === '0' && t.status === 'complete').length >= 1

    case '1/2':
      // Unlocked when stage 1 = 100%
      return getStageProgress(tasks, '1') === 100

    case '2':
      // Unlocked when gate 1/2 is approved
      return gateSet.has('1/2')

    case '2/3':
      // Unlocked when stage 2 = 100%
      return getStageProgress(tasks, '2') === 100

    case '3':
      // Unlocked when gate 2/3 is approved
      return gateSet.has('2/3')

    case '4':
      // Unlocked when stage 3 = 100%
      return getStageProgress(tasks, '3') === 100

    default:
      return false
  }
}
