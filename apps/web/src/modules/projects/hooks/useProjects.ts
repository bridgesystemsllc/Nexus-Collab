import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as client from '../api/projectsClient'
import type { ProjectListParams } from '../api/projectsClient'
import type { ProjectTask } from '../types'

// ─── Query keys ──────────────────────────────────────────────
// Namespaced so a single invalidate(['projects']) refreshes everything after a
// mutation that could affect more than the record edited — completing a task
// changes the project's percent and health too.

export const qk = {
  all: ['projects'] as const,
  list: (params: ProjectListParams) => ['projects', 'list', params] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
  health: (id: string) => ['projects', 'health', id] as const,
  timeline: (id: string) => ['projects', 'timeline', id] as const,
  tasks: (id: string, params?: unknown) => ['projects', 'tasks', id, params ?? null] as const,
  myTasks: (params?: unknown) => ['projects', 'my-tasks', params ?? null] as const,
  meta: (what: string, params?: unknown) => ['projects', 'meta', what, params ?? null] as const,
}

// ─── Reference data ──────────────────────────────────────────
// Types and departments change rarely; a long stale time keeps the create
// wizard from refetching them on every step.

export function useProjectDepartments() {
  return useQuery({
    queryKey: qk.meta('departments'),
    queryFn: async () => (await client.fetchDepartments()).data,
    staleTime: 5 * 60_000,
  })
}

export function useProjectTypes() {
  return useQuery({
    queryKey: qk.meta('types'),
    queryFn: async () => (await client.fetchProjectTypes()).data,
    staleTime: 5 * 60_000,
  })
}

export function useProjectTemplates(typeId?: string) {
  return useQuery({
    queryKey: qk.meta('templates', typeId),
    queryFn: async () => (await client.fetchTemplates({ typeId })).data,
    enabled: !!typeId,
    staleTime: 5 * 60_000,
  })
}

// ─── Projects ────────────────────────────────────────────────

export function useProjects(params: ProjectListParams) {
  return useQuery({
    queryKey: qk.list(params),
    queryFn: () => client.fetchProjects(params),
    // Keep the previous page on screen while the next loads, so filtering does
    // not flash an empty table.
    placeholderData: (prev) => prev,
  })
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: qk.detail(id ?? ''),
    queryFn: async () => (await client.fetchProject(id as string)).data,
    enabled: !!id,
  })
}

export function useProjectHealth(id: string | null) {
  return useQuery({
    queryKey: qk.health(id ?? ''),
    queryFn: async () => (await client.fetchProjectHealth(id as string)).data,
    enabled: !!id,
  })
}

export function useProjectTimeline(id: string | null) {
  return useQuery({
    queryKey: qk.timeline(id ?? ''),
    queryFn: async () => await client.fetchTimeline(id as string),
    enabled: !!id,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => client.createProject(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  })
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => client.updateProject(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  })
}

export function useSetProjectStatus(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ status, reason }: { status: string; reason?: string }) =>
      client.setProjectStatus(id, status, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  })
}

// ─── Tasks ───────────────────────────────────────────────────

export function useTasks(
  projectId: string | null,
  params?: { departmentId?: string; assigneeId?: string; status?: string },
) {
  return useQuery({
    queryKey: qk.tasks(projectId ?? '', params),
    queryFn: async () => (await client.fetchTasks(projectId as string, params)).data,
    enabled: !!projectId,
  })
}

export function useMyTasks(params?: { status?: string; limit?: number }) {
  return useQuery({
    queryKey: qk.myTasks(params),
    queryFn: async () => (await client.fetchMyTasks(params)).data,
  })
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => client.createTask(projectId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  })
}

/**
 * Drag-and-drop status change with an optimistic update.
 *
 * The card must move the instant it is dropped — waiting for a round trip
 * makes the board feel broken. On failure the previous cache is restored and
 * the caller surfaces the server's message, so a policy denial is visible
 * rather than silently reverted.
 */
export function useSetTaskStatus(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      client.setTaskStatus(taskId, status),

    onMutate: async ({ taskId, status }) => {
      await qc.cancelQueries({ queryKey: ['projects', 'tasks', projectId] })
      const snapshots = qc.getQueriesData<ProjectTask[]>({
        queryKey: ['projects', 'tasks', projectId],
      })
      for (const [key, tasks] of snapshots) {
        if (!tasks) continue
        qc.setQueryData<ProjectTask[]>(
          key,
          tasks.map((t) =>
            t.id === taskId
              ? { ...t, status: status as ProjectTask['status'], percentComplete: status === 'COMPLETE' ? 100 : t.percentComplete }
              : t,
          ),
        )
      }
      return { snapshots }
    },

    onError: (_err, _vars, ctx) => {
      for (const [key, data] of ctx?.snapshots ?? []) qc.setQueryData(key, data)
    },

    onSettled: () => {
      // Health and percent-complete are recomputed server-side after a debounce,
      // so the detail/list caches need refreshing too, not just the board.
      qc.invalidateQueries({ queryKey: qk.all })
    },
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: Record<string, unknown> }) =>
      client.updateTask(taskId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  })
}

export function useTaskAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input:
      | { action: 'accept'; taskId: string }
      | { action: 'reject'; taskId: string; reason: string }
      | { action: 'block'; taskId: string; reason: string }
      | { action: 'unblock'; taskId: string }
      | { action: 'delete'; taskId: string }) => {
      switch (input.action) {
        case 'accept': return client.acceptTask(input.taskId)
        case 'reject': return client.rejectTask(input.taskId, input.reason)
        case 'block': return client.blockTask(input.taskId, input.reason)
        case 'unblock': return client.unblockTask(input.taskId)
        case 'delete': return client.deleteTask(input.taskId)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  })
}
