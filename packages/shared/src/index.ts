// ─── Shared Types for NEXUS ─────────────────────────────────

export type Role = 'ADMIN' | 'OPS_MANAGER' | 'DEPT_LEAD' | 'PROJECT_LEAD' | 'MEMBER'
export type MemberStatus = 'AVAILABLE' | 'FOCUSED' | 'IN_MEETING' | 'OOO'
export type DeptType = 'BUILTIN_RD' | 'BUILTIN_OPS' | 'CUSTOM'

export type ModuleType =
  | 'BRIEFS' | 'CM_PRODUCTIVITY' | 'TECH_TRANSFERS' | 'FORMULATIONS'
  | 'SKU_PIPELINE' | 'INVENTORY_HEALTH' | 'PRODUCTION_TRACKING'
  | 'CUSTOM_TABLE' | 'CUSTOM_KANBAN' | 'CUSTOM_LIST'

export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'COMPLETE'
export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'BLOCKED' | 'REVIEW' | 'COMPLETE' | 'ARCHIVED'
export type ProjectPriority = 'P0' | 'P1' | 'P2' | 'P3'

export type CoworkType = 'PROJECT' | 'EMERGENCY' | 'INITIATIVE' | 'DEPARTMENT'
export type ActivityType = 'UPDATE' | 'SUBMISSION' | 'NOTE' | 'STATUS_CHANGE' | 'FILE_UPLOAD' | 'EMAIL_LINKED' | 'TASK_CREATED' | 'TASK_COMPLETED' | 'AI_ACTION'

export type DocumentType = 'BRIEF' | 'COA' | 'SPEC_SHEET' | 'QUOTE' | 'PRICING' | 'CONTRACT' | 'REPORT' | 'ARTWORK' | 'INVOICE' | 'OTHER'
export type PulseType = 'ALERT' | 'SIGNAL' | 'HEARTBEAT' | 'BROADCAST'

export type IntegrationType =
  | 'ERP_KAREVE_SYNC' | 'MICROSOFT_OUTLOOK' | 'MICROSOFT_TEAMS' | 'MICROSOFT_ONEDRIVE'
  | 'AMAZON_VENDOR_CENTRAL' | 'SHOPIFY' | 'GS1_SYNC' | 'SLACK' | 'ZAPIER'

export type IntegrationStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'SYNCING'

// ─── WebSocket Events ───────────────────────────────────────
export const WS_EVENTS = {
  JOIN_SPACE: 'join_space',
  LEAVE_SPACE: 'leave_space',
  TYPING: 'typing',
  ACTIVITY_NEW: 'activity_new',
  TASK_UPDATED: 'task_updated',
  PULSE_NEW: 'pulse_new',
  SYNC_COMPLETE: 'sync_complete',
  MEMBER_STATUS: 'member_status',
} as const
