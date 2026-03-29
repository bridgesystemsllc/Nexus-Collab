import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ─── Departments ────────────────────────────────────────────
export function useDepartments() {
  return useQuery({ queryKey: ['departments'], queryFn: () => api.get('/departments').then(r => r.data) })
}

export function useDepartment(id: string) {
  return useQuery({ queryKey: ['department', id], queryFn: () => api.get(`/departments/${id}`).then(r => r.data), enabled: !!id })
}

export function useCreateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/departments', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  })
}

// ─── Tasks ──────────────────────────────────────────────────
export function useTasks(filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {}).toString()
  return useQuery({ queryKey: ['tasks', filters], queryFn: () => api.get(`/tasks?${params}`).then(r => r.data) })
}

export function useTask(id: string) {
  return useQuery({ queryKey: ['task', id], queryFn: () => api.get(`/tasks/${id}`).then(r => r.data), enabled: !!id })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/tasks', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api.patch(`/tasks/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useAddTaskNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.post(`/tasks/${id}/notes`, { content }).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['task', vars.id] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

// ─── Module Items ────────────────────────────────────────────
export function useCreateModuleItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ deptId, moduleId, data }: { deptId: string; moduleId: string; data: any }) =>
      api.post(`/departments/${deptId}/modules/${moduleId}/items`, { data }).then(r => r.data),
    onSuccess: (_res, vars) => qc.invalidateQueries({ queryKey: ['department', vars.deptId] }),
  })
}

// ─── Cowork ─────────────────────────────────────────────────
export function useCoworkSpaces() {
  return useQuery({ queryKey: ['cowork'], queryFn: () => api.get('/cowork').then(r => r.data) })
}

export function useCoworkSpace(id: string) {
  return useQuery({ queryKey: ['cowork', id], queryFn: () => api.get(`/cowork/${id}`).then(r => r.data), enabled: !!id })
}

export function usePostActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ spaceId, ...data }: any) => api.post(`/cowork/${spaceId}/activity`, data).then(r => r.data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['cowork', vars.spaceId] }),
  })
}

export function useCreateCoworkSpace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/cowork', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cowork'] }),
  })
}

// ─── Documents ──────────────────────────────────────────────
export function useDocuments(filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {}).toString()
  return useQuery({ queryKey: ['documents', filters], queryFn: () => api.get(`/documents?${params}`).then(r => r.data) })
}

export function useCreateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/documents/upload', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

// ─── Cowork task (scoped to a space) ────────────────────────
export function useCreateCoworkTask(spaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post(`/cowork/${spaceId}/tasks`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cowork', spaceId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

// ─── Everything ─────────────────────────────────────────────
export function useEverything(filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {}).toString()
  return useQuery({ queryKey: ['everything', filters], queryFn: () => api.get(`/everything?${params}`).then(r => r.data) })
}

// ─── Integrations ───────────────────────────────────────────
export function useIntegrations() {
  return useQuery({ queryKey: ['integrations'], queryFn: () => api.get('/integrations').then(r => r.data) })
}

export function useSyncIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (type: string) => api.post(`/integrations/${type}/sync`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  })
}

// ─── AI ─────────────────────────────────────────────────────
export function useAIBriefing() {
  return useQuery({ queryKey: ['ai-briefing'], queryFn: () => api.get('/ai/briefing').then(r => r.data) })
}

export function useAIChat() {
  return useMutation({
    mutationFn: (data: { message: string; history?: any[] }) => api.post('/ai/chat', data).then(r => r.data),
  })
}

export function useAIAction() {
  return useMutation({
    mutationFn: (action: string) => api.post(`/ai/actions/${action}`).then(r => r.data),
  })
}

// ─── Pulse ──────────────────────────────────────────────────
export function usePulse(filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {}).toString()
  return useQuery({ queryKey: ['pulse', filters], queryFn: () => api.get(`/pulse?${params}`).then(r => r.data) })
}

export function useMarkPulseRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/pulse/${id}/read`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pulse'] }),
  })
}

export function useMarkAllPulseRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/pulse/read-all').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pulse'] }),
  })
}
