import { PrismaClient } from '@prisma/client'

// Import prisma from the main app
let prisma: PrismaClient

export function setExecutorPrisma(p: PrismaClient) {
  prisma = p
}

export interface ExecutionResult {
  action: string
  success: boolean
  result?: { id?: string; name?: string; url?: string; filename?: string; [key: string]: any }
  error?: string
}

export async function executeActionPlan(
  parsedPlan: any,
  emailData: any,
  senderEmail: string
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = []

  // Sort actions by priority
  const sortedActions = [...(parsedPlan.actions || [])].sort(
    (a: any, b: any) => (a.priority || 1) - (b.priority || 1)
  )

  for (const action of sortedActions) {
    try {
      const result = await executeAction(action, emailData, senderEmail)
      results.push({ action: action.type, success: true, result })
    } catch (err: any) {
      results.push({ action: action.type, success: false, error: err.message })
    }
  }

  return results
}

async function executeAction(
  action: any,
  emailData: any,
  senderEmail: string
): Promise<Record<string, any>> {
  // Find R&D department and its modules for creating items
  const rdDept = await prisma.department.findFirst({ where: { type: 'BUILTIN_RD' } })

  switch (action.type) {
    case 'create_brief': {
      if (!rdDept) throw new Error('R&D department not found')
      const briefsModule = await prisma.departmentModule.findFirst({
        where: { departmentId: rdDept.id, type: 'BRIEFS' },
      })
      if (!briefsModule) throw new Error('Briefs module not found')

      const item = await prisma.moduleItem.create({
        data: {
          moduleId: briefsModule.id,
          data: {
            ...action.data,
            source: 'email_agent',
            sourceEmail: senderEmail,
            briefStatus: action.data.status || 'Brief Submitted',
            phase: 1,
          },
          status: action.data.status || 'Brief Submitted',
        },
      })
      return { id: item.id, name: action.data.projectName, url: '/r&d' }
    }

    case 'create_tech_transfer': {
      if (!rdDept) throw new Error('R&D department not found')
      const ttModule = await prisma.departmentModule.findFirst({
        where: { departmentId: rdDept.id, type: 'TECH_TRANSFERS' },
      })
      if (!ttModule) throw new Error('Tech Transfers module not found')

      const item = await prisma.moduleItem.create({
        data: {
          moduleId: ttModule.id,
          data: { ...action.data, source: 'email_agent', sourceEmail: senderEmail },
          status: action.data.status || 'Planning',
        },
      })
      return { id: item.id, name: action.data.product || action.data.productName, url: '/r&d' }
    }

    case 'create_formulation': {
      if (!rdDept) throw new Error('R&D department not found')
      const frmModule = await prisma.departmentModule.findFirst({
        where: { departmentId: rdDept.id, type: 'FORMULATIONS' },
      })
      if (!frmModule) throw new Error('Formulations module not found')

      const item = await prisma.moduleItem.create({
        data: {
          moduleId: frmModule.id,
          data: { ...action.data, source: 'email_agent', sourceEmail: senderEmail },
          status: action.data.status || 'Draft',
        },
      })
      return { id: item.id, name: action.data.product || action.data.productName, url: '/r&d' }
    }

    case 'create_npd_project': {
      if (!rdDept) throw new Error('R&D department not found')
      let npdModule = await prisma.departmentModule.findFirst({
        where: { departmentId: rdDept.id, type: 'NPD_PIPELINE' },
      })
      if (!npdModule) {
        npdModule = await prisma.departmentModule.create({
          data: { name: 'NPD Pipeline', type: 'NPD_PIPELINE', departmentId: rdDept.id, sortOrder: 4 },
        })
      }

      const item = await prisma.moduleItem.create({
        data: {
          moduleId: npdModule.id,
          data: {
            ...action.data,
            tasks: [],
            gateApprovals: [],
            teamAssignments: [],
            activityLog: [{ user: 'Email Agent', action: `Project created from email: ${emailData.subject}`, timestamp: new Date().toISOString() }],
            status: 'Active',
            source: 'email_agent',
            sourceEmail: senderEmail,
          },
          status: 'Active',
        },
      })
      return { id: item.id, name: action.data.projectName, url: '/r&d' }
    }

    case 'create_npd_task': {
      // Find the NPD project by searching module items
      if (!rdDept) throw new Error('R&D department not found')
      const npdModule = await prisma.departmentModule.findFirst({
        where: { departmentId: rdDept.id, type: 'NPD_PIPELINE' },
      })
      if (!npdModule) throw new Error('NPD module not found')

      const npdItems = await prisma.moduleItem.findMany({
        where: { moduleId: npdModule.id },
      })

      const searchName = (action.data.projectSearchName || action.data.projectName || '').toLowerCase()
      const project = npdItems.find((item: any) => {
        const data = item.data as any
        return data.projectName?.toLowerCase().includes(searchName)
      })

      if (!project) throw new Error(`NPD project not found matching: "${searchName}"`)

      const projectData = project.data as any
      const tasks = projectData.tasks || []
      const newTask = {
        id: `task-agent-${Date.now()}`,
        stageKey: action.data.stage?.toString() || '0',
        taskNumber: `A.${tasks.length + 1}`,
        taskName: action.data.taskName,
        collaborators: action.data.collaborators || '',
        leadRole: action.data.assigneeName || '',
        assignedName: action.data.assigneeName || '',
        helperComment: `Created by email agent from: ${emailData.subject}`,
        isGateTask: false,
        status: action.data.status || 'not_started',
        dueDate: action.data.dueDate || '',
        notes: [],
        attachments: [],
      }

      await prisma.moduleItem.update({
        where: { id: project.id },
        data: {
          data: {
            ...projectData,
            tasks: [...tasks, newTask],
            activityLog: [
              ...(projectData.activityLog || []),
              { user: 'Email Agent', action: `Added task: ${newTask.taskName}`, timestamp: new Date().toISOString(), stage: newTask.stageKey },
            ],
          },
        },
      })

      return { id: newTask.id, projectId: project.id, name: newTask.taskName, url: '/r&d' }
    }

    case 'create_task': {
      const task = await prisma.task.create({
        data: {
          title: action.data.taskName || action.data.title,
          description: action.data.description || `Created by email agent from: ${emailData.subject}`,
          status: 'NOT_STARTED',
          priority: (action.data.priority || 'MEDIUM').toUpperCase(),
          dueDate: action.data.dueDate ? new Date(action.data.dueDate) : undefined,
        },
      })
      return { id: task.id, name: task.title, url: '/everything' }
    }

    case 'update_record': {
      // Search across modules for the record
      const searchName = (action.data.searchName || '').toLowerCase()
      if (!searchName) throw new Error('No search name provided for update')

      const items = await prisma.moduleItem.findMany({ take: 100, orderBy: { updatedAt: 'desc' } })
      const match = items.find((item: any) => {
        const data = item.data as any
        const name = (data.projectName || data.product || data.name || '').toLowerCase()
        return name.includes(searchName)
      })

      if (!match) throw new Error(`Record not found matching: "${searchName}"`)

      const currentData = match.data as any
      await prisma.moduleItem.update({
        where: { id: match.id },
        data: {
          data: { ...currentData, ...action.data.updates },
          status: action.data.updates?.status || action.data.updates?.briefStatus || match.status,
        },
      })

      return { id: match.id, updated: true, name: currentData.projectName || currentData.product }
    }

    case 'add_note':
    case 'log_issue':
      return { noted: true, type: action.type, data: action.data }

    case 'upload_files':
      return { deferred: true }

    default:
      throw new Error(`Unknown action type: ${action.type}`)
  }
}
