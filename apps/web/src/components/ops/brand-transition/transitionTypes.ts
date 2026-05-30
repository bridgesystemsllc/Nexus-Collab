// ─── Brand Transition Types ─────────────────────────────────

export interface TransitionSku {
  id: string
  materialCode: string
  description: string
  brand: string
  track: 'loreal_coman' | 'full_buy' | 'disco_decision'
  currentCm: string | null
  lorealEntity: string | null
  manufacturingProcess: string | null
  transitionDeadline: string | null
  newCm: string | null
  cmStatus: string
  cmOutreachDate: string | null
  cmAgreementDate: string | null
  firstProductionDate: string | null
  transitionOwner: string | null
  formulaTransferred: boolean
  formulaTransferDate: string | null
  formulaOwner: string | null
  rawMaterialsConfirmed: boolean
  rmNotes: string | null
  discoDecision: 'Pending' | 'Discontinue' | 'Find RM and Produce'
  discoDecisionDate: string | null
  discoDecisionOwner: string | null
  rmDisengaged: string | null
  lastLorealBatches: number
  lastBatchEta: string | null
  currentInventoryUnits: number
  weeksOfSupply: number | null
  avgWeeklyVelocity: number | null
  overallStatus: string
  isFlagged: boolean
  priority: 'High' | 'Medium' | 'Low'
  isCowork: boolean
  coworkType: string | null
  coworkNote: string | null
  coworkAssignedTo: string | null
  coworkResolved: boolean
  notes: string | null
  orgId: string
  transitionNotes: TransitionNote[]
  milestones: TransitionMilestone[]
  cmCandidates: CmCandidate[]
  createdAt: string
  updatedAt: string
}

export interface TransitionNote {
  id: string
  skuId: string
  noteType: string
  noteText: string
  createdBy: string | null
  createdAt: string
}

export interface TransitionMilestone {
  id: string
  skuId: string
  milestoneName: string
  dueDate: string | null
  completed: boolean
  completedDate: string | null
  completedBy: string | null
  notes: string | null
}

export interface CmCandidate {
  id: string
  skuId: string
  cmName: string
  cmContact: string | null
  cmEmail: string | null
  capability: string | null
  outreachDate: string | null
  responseReceived: boolean
  responseDate: string | null
  quoteReceived: boolean
  quoteAmount: number | null
  status: 'Under Evaluation' | 'Qualified' | 'Rejected' | 'Selected'
  rejectionReason: string | null
  notes: string | null
  createdAt: string
}

// ─── Constants ──────────────────────────────────────────────

export const TRACK_LABELS: Record<string, string> = {
  loreal_coman: 'L\'Oreal Co-Man Transition',
  full_buy: 'Full Buy — CD Owns Directly',
  disco_decision: 'RM Disengagement — Decision Required',
}

export const TRACK_COLORS: Record<string, string> = {
  loreal_coman: '#7C3AED',
  full_buy: '#32D74B',
  disco_decision: '#FF453A',
}

export const STATUS_COLORS: Record<string, string> = {
  'Active': '#32D74B',
  'Transition Complete': '#32D74B',
  'Needs Action': '#FF9F0A',
  'At Risk': '#FF453A',
  'Decision Required': '#FF453A',
  'Discontinued': '#6E6E73',
  'CM Identified': '#0A84FF',
  'In Progress': '#7C3AED',
}

export const CM_STATUS_OPTIONS = [
  'Not Started',
  'CM Identified',
  'Agreement in Review',
  'Agreement Signed',
  'Trial Run Scheduled',
  'Trial Complete',
  'Active at CM',
  'No CM Required',
]

export const NOTE_TYPES = [
  'Update',
  'CM Outreach',
  'Legal / Agreement',
  'Formula Transfer',
  'RM Update',
  'Decision',
  'CoWork',
  'System',
]

export const PRIORITY_OPTIONS = ['High', 'Medium', 'Low']

export const OVERALL_STATUS_OPTIONS = [
  'Active',
  'Needs Action',
  'At Risk',
  'Decision Required',
  'Discontinued',
  'Transition Complete',
]

// ─── Utilities ──────────────────────────────────────────────

export function calcTransitionProgress(sku: TransitionSku): number {
  if (sku.track === 'disco_decision') return 0
  if (!sku.milestones || sku.milestones.length === 0) return 0
  const completed = sku.milestones.filter(m => m.completed).length
  return Math.round((completed / sku.milestones.length) * 100)
}

export function groupByKey<T>(items: T[], key: keyof T): Record<string, T[]> {
  const groups: Record<string, T[]> = {}
  for (const item of items) {
    const k = String(item[key] ?? 'Unknown')
    if (!groups[k]) groups[k] = []
    groups[k].push(item)
  }
  return groups
}
