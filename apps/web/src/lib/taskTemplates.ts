export type TaskTemplateCategory = 'FOLLOW_UP' | 'GENERAL'

export interface TaskTemplate {
  id: string
  label: string
  category: TaskTemplateCategory
  defaultPriority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  seedTags: string[]
  description?: string
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'CLIENT_FOLLOW_UP',
    label: 'Client Follow-up',
    category: 'FOLLOW_UP',
    defaultPriority: 'HIGH',
    seedTags: ['follow-up', 'client'],
    description: 'Track client communications and action items',
  },
  {
    id: 'VENDOR_FOLLOW_UP',
    label: 'Vendor Follow-up',
    category: 'FOLLOW_UP',
    defaultPriority: 'MEDIUM',
    seedTags: ['follow-up', 'vendor'],
    description: 'Track vendor communications and pending responses',
  },
  {
    id: 'INTERNAL_CHECKIN',
    label: 'Internal Check-in',
    category: 'FOLLOW_UP',
    defaultPriority: 'MEDIUM',
    seedTags: ['follow-up', 'internal'],
    description: 'Internal team check-ins and status updates',
  },
  {
    id: 'ACTION_REQUIRED',
    label: 'Action Required',
    category: 'FOLLOW_UP',
    defaultPriority: 'HIGH',
    seedTags: ['follow-up', 'action-required'],
    description: 'Time-sensitive items requiring immediate attention',
  },
  {
    id: 'GENERAL_TASK',
    label: 'General Task',
    category: 'GENERAL',
    defaultPriority: 'MEDIUM',
    seedTags: [],
    description: 'Standard task without a specific template',
  },
]

export interface TaskFormData {
  title: string
  description: string
  status: string
  priority: string
  dueDate: string
  ownerId: string
  tags: string[]
}

export function applyTemplate(
  template: TaskTemplate,
  overrides?: Partial<Pick<TaskFormData, 'title' | 'description'>>
): Partial<TaskFormData> {
  return {
    title: overrides?.title ?? '',
    description: overrides?.description ?? '',
    priority: template.defaultPriority,
    tags: [...template.seedTags],
  }
}

export function getTemplateById(id: string): TaskTemplate | undefined {
  return TASK_TEMPLATES.find((t) => t.id === id)
}

export function getTemplatesByCategory(category: TaskTemplateCategory): TaskTemplate[] {
  return TASK_TEMPLATES.filter((t) => t.category === category)
}
