export interface ArtworkIntakeUpload {
  kind: 'upload'
  filename: string
  objectPath: string
  url: string
  mimeType?: string
  size?: number
}

export interface ArtworkIntakeSharePoint {
  kind: 'sharepoint'
  url: string
  displayName: string
}

export type ArtworkIntake = ArtworkIntakeUpload | ArtworkIntakeSharePoint

export interface StatusAssignee {
  userId: string
  userName: string
}

export interface ArtworkStatusForm {
  lastUpdated: string | null
  needsRevisions: boolean
  needsRevisionsNotes: string
  revisionsAssignees: StatusAssignee[]
  approvalsAssignees: StatusAssignee[]
  updatesAssignees: StatusAssignee[]
  nextAction: string
  finalApprovalVersion: string
}

export interface SharePointLink {
  displayName: string
  url: string
  addedBy: string
  addedAt: string
}

export interface DocFile {
  name: string
  size: number
  type: string
  uploadedBy: string
  uploadedAt: string
  url: string
  source: 'local' | 'onedrive'
}

export interface ArtworkTrackerData {
  title: string
  intake: ArtworkIntake
  statusForm: ArtworkStatusForm
  sharePointLinks?: SharePointLink[]
  files?: DocFile[]
}

export interface ArtworkModuleItem {
  id: string
  moduleId: string
  data: ArtworkTrackerData
  status?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export function getDefaultStatusForm(): ArtworkStatusForm {
  return {
    lastUpdated: null,
    needsRevisions: false,
    needsRevisionsNotes: '',
    revisionsAssignees: [],
    approvalsAssignees: [],
    updatesAssignees: [],
    nextAction: '',
    finalApprovalVersion: '',
  }
}
