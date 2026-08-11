// Which fields of a project patch each tier of actor may write.
//
// EDIT_PROJECT is open to any non-viewer participant, but that must not mean a
// contributor can reassign the project manager or move a project out of
// confidential. The policy answers "may this person edit at all"; this module
// answers "which fields".
//
// Both lists are explicit allowlists. A field added to the create schema later
// lands in neither and is reported as unrecognised, so it fails closed and
// loudly rather than silently becoming editable by everyone.

export const CONTENT_FIELDS = [
  'title',
  'description',
  'businessCase',
  'successCriteria',
  'priority',
  'startDate',
  'targetEndDate',
  'brands',
  'retailers',
  'markets',
  'customFields',
] as const

export const GOVERNANCE_FIELDS = [
  'projectTypeId',
  'projectManagerId',
  'executiveSponsorId',
  'isConfidential',
  'budgetAmount',
  'currency',
  'checkinCadence',
  'checkinDayOfWeek',
  'actualEndDate',
  'lessonsLearned',
] as const

export type ContentField = (typeof CONTENT_FIELDS)[number]
export type GovernanceField = (typeof GOVERNANCE_FIELDS)[number]

export interface TierSplit {
  content: Record<string, unknown>
  governance: Record<string, unknown>
  /** Keys in neither tier. `status` lands here on purpose. */
  unrecognised: string[]
}

const CONTENT = new Set<string>(CONTENT_FIELDS)
const GOVERNANCE = new Set<string>(GOVERNANCE_FIELDS)

export function splitByTier(body: Record<string, unknown>): TierSplit {
  const out: TierSplit = { content: {}, governance: {}, unrecognised: [] }

  for (const [key, value] of Object.entries(body)) {
    // An explicit null clears a field and must survive; undefined is absence.
    if (value === undefined) continue
    if (CONTENT.has(key)) out.content[key] = value
    else if (GOVERNANCE.has(key)) out.governance[key] = value
    else out.unrecognised.push(key)
  }

  return out
}
